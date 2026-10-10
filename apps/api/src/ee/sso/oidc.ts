// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { createHash, randomBytes } from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/** The parts of an OpenID provider's discovery document optik uses. */
export interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
}

export interface OidcClient {
  issuer: string;
  clientId: string;
  clientSecret: string | null;
  scopes: string;
  redirectUri: string;
}

const TIMEOUT = 10_000;
const DISCOVERY_TTL = 60 * 60 * 1000;

const discoveries = new Map<string, { at: number; value: Discovery }>();
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Reads (and caches for an hour) the provider's /.well-known/openid-configuration. */
export async function discover(issuer: string, { fresh = false } = {}): Promise<Discovery> {
  const cached = discoveries.get(issuer);
  if (!fresh && cached && Date.now() - cached.at < DISCOVERY_TTL) return cached.value;

  const url = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const value = (await res.json()) as Discovery;
  for (const field of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
    if (typeof value[field] !== 'string') throw new Error(`The discovery document has no ${field}`);
  }
  // The document must belong to the configured issuer (Entra: use the tenant URL, not "common")
  if (value.issuer.replace(/\/+$/, '') !== issuer.replace(/\/+$/, '')) {
    throw new Error(`The provider calls itself "${value.issuer}", not "${issuer}"`);
  }
  discoveries.set(issuer, { at: Date.now(), value });
  return value;
}

export const randomToken = () => randomBytes(32).toString('base64url');
export const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/** Where the browser goes to sign in (authorization code flow with PKCE). */
export function authorizationUrl(
  d: Discovery,
  client: OidcClient,
  { state, nonce, verifier }: { state: string; nonce: string; verifier: string },
): string {
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    scope: client.scopes,
    state,
    nonce,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

/**
 * Exchanges the authorization code, verifies the ID token (signature via the
 * provider's JWKS, issuer, audience, expiry, nonce) and returns its claims,
 * completed from the userinfo endpoint.
 */
export async function completeSignIn(
  d: Discovery,
  client: OidcClient,
  { code, verifier, nonce }: { code: string; verifier: string; nonce: string },
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: client.redirectUri,
    code_verifier: verifier,
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  const methods = d.token_endpoint_auth_methods_supported ?? ['client_secret_basic'];
  if (client.clientSecret && methods.includes('client_secret_basic')) {
    const id = encodeURIComponent(client.clientId);
    const secret = encodeURIComponent(client.clientSecret);
    headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
  } else {
    body.set('client_id', client.clientId);
    if (client.clientSecret) body.set('client_secret', client.clientSecret);
  }

  const res = await fetch(d.token_endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT) });
  const tokens = (await res.json().catch(() => ({}))) as { id_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !tokens.id_token) {
    throw new Error(`The provider refused the sign-in: ${tokens.error_description ?? tokens.error ?? res.status}`);
  }

  let keys = keySets.get(d.jwks_uri);
  if (!keys) keySets.set(d.jwks_uri, (keys = createRemoteJWKSet(new URL(d.jwks_uri))));
  const { payload } = await jwtVerify(tokens.id_token, keys, {
    issuer: d.issuer,
    audience: client.clientId,
    clockTolerance: 60,
  });
  if (payload.nonce !== nonce) throw new Error('The ID token does not belong to this sign-in (nonce)');

  const claims: Record<string, unknown> = { ...(payload as JWTPayload) };
  if (d.userinfo_endpoint && tokens.access_token) {
    const info = await fetch(d.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    // Userinfo may add claims (e.g. Okta's groups), but never replace the ID token's subject
    if (info && typeof info === 'object' && (info as { sub?: string }).sub === payload.sub) {
      for (const [k, v] of Object.entries(info)) if (!(k in claims)) claims[k] = v;
    }
  }
  return claims;
}
