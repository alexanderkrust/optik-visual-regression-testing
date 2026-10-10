import { createHash, randomBytes } from 'crypto';
import { createServer, Server } from 'http';
import type { AddressInfo } from 'net';
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';

interface PendingCode {
  clientId: string;
  redirectUri: string;
  challenge: string;
  nonce: string;
  claims: Record<string, unknown>;
}

/**
 * A minimal OpenID provider: discovery, JWKS, token and userinfo endpoints.
 * Tests play the browser and call `signIn` instead of a login form.
 */
export class FakeOidc {
  issuer = '';
  clientId = 'optik-client';
  clientSecret = 's3cret';
  /** Overrides for the next ID token, e.g. a wrong nonce or audience */
  tamper: Record<string, unknown> = {};
  /** Claims only the userinfo endpoint returns (like Okta's groups) */
  userinfo: Record<string, unknown> = {};
  readonly tokenRequests: { authorization?: string; body: URLSearchParams }[] = [];
  private server!: Server;
  private key!: KeyLike;
  private jwk!: Record<string, unknown>;
  private readonly codes = new Map<string, PendingCode>();
  private readonly accessTokens = new Map<string, string>();

  async start() {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    this.key = privateKey;
    this.jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    this.server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => this.handle(req.url ?? '', req.headers.authorization, body).then(
        ({ status, json }) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(json)),
      ));
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.issuer = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/realm`;
  }

  stop() {
    return new Promise((r) => this.server.close(r));
  }

  /** What the login form would do: returns the code for the authorization request URL. */
  signIn(authorizeUrl: string, claims: Record<string, unknown>): { code: string; state: string; redirectUri: string } {
    const url = new URL(authorizeUrl);
    const p = url.searchParams;
    if (`${url.origin}${url.pathname}` !== `${this.issuer}/authorize`) throw new Error(`unexpected ${url}`);
    if (p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256') throw new Error('not PKCE');
    const code = randomBytes(16).toString('hex');
    this.codes.set(code, {
      clientId: p.get('client_id')!,
      redirectUri: p.get('redirect_uri')!,
      challenge: p.get('code_challenge')!,
      nonce: p.get('nonce')!,
      claims,
    });
    return { code, state: p.get('state')!, redirectUri: p.get('redirect_uri')! };
  }

  private async handle(path: string, authorization: string | undefined, body: string) {
    const ok = (json: unknown) => ({ status: 200, json });
    switch (path.split('?')[0]) {
      case '/realm/.well-known/openid-configuration':
        return ok({
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          jwks_uri: `${this.issuer}/jwks`,
          userinfo_endpoint: `${this.issuer}/userinfo`,
          token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
        });
      case '/realm/jwks':
        return ok({ keys: [this.jwk] });
      case '/realm/userinfo': {
        const sub = this.accessTokens.get(authorization?.replace('Bearer ', '') ?? '');
        return sub ? ok({ sub, ...this.userinfo }) : { status: 401, json: {} };
      }
      case '/realm/token': {
        const form = new URLSearchParams(body);
        this.tokenRequests.push({ authorization, body: form });
        const pending = this.codes.get(form.get('code') ?? '');
        this.codes.delete(form.get('code') ?? '');
        const expected = `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`;
        const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
        if (!pending || authorization !== expected || challenge !== pending.challenge || form.get('redirect_uri') !== pending.redirectUri) {
          return { status: 400, json: { error: 'invalid_grant' } };
        }
        const claims: Record<string, unknown> = { nonce: pending.nonce, ...pending.claims, ...this.tamper };
        const idToken = await new SignJWT(claims)
          .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
          .setIssuer((claims.iss as string) ?? this.issuer)
          .setAudience((claims.aud as string) ?? pending.clientId)
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(this.key);
        const accessToken = randomBytes(16).toString('hex');
        this.accessTokens.set(accessToken, pending.claims.sub as string);
        return ok({ id_token: idToken, access_token: accessToken, token_type: 'Bearer' });
      }
    }
    return { status: 404, json: {} };
  }
}
