import type { Handle } from '@sveltejs/kit';
import { unsealSession, sealSession } from '$lib/session';
import { apiBase } from '$lib/server/api';
import { COOKIE_NAME, cookieOptions, sessionSecret } from '$lib/server/session-cookie';
import { setupRequired } from '$lib/server/setup';
import { redirect } from '@sveltejs/kit';
import { LOCALE_COOKIE, resolveLocale } from '$lib/i18n';

/** Decode the JWT payload without verifying — for expiry check only. */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    // base64url → base64 → JSON
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  // Add 30-second buffer so we refresh a bit before actual expiry
  return payload.exp * 1000 < Date.now() + 30_000;
}

async function tryRefresh(
  refreshToken: string,
): Promise<{ accessToken: string } | null> {
  try {
    console.log('Access token expired, attempting refresh...');
    const res = await fetch(`${apiBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ accessToken: string }>;
  } catch {
    return null;
  }
}

/**
 * The web UI calls the API from the server, so the API would only see this
 * server's address. Pass on the client's and its browser (audit log), and the
 * host the browser uses (links such as single sign-on redirect URIs).
 */
function forwardedHeaders(event: Parameters<Handle>[0]['event']): Record<string, string> {
  const headers: Record<string, string> = {};
  let client = event.request.headers.get('x-forwarded-for');
  if (!client) {
    try {
      client = event.getClientAddress();
    } catch {
      client = null;
    }
  }
  if (client) headers['X-Forwarded-For'] = client;
  // … and the address the browser uses, for links the API builds
  headers['X-Forwarded-Host'] = event.request.headers.get('x-forwarded-host') ?? event.url.host;
  headers['X-Forwarded-Proto'] =
    event.request.headers.get('x-forwarded-proto') ?? event.url.protocol.replace(':', '');
  const userAgent = event.request.headers.get('user-agent');
  if (userAgent) headers['User-Agent'] = userAgent;
  return headers;
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.accessToken = null;
  event.locals.forwarded = forwardedHeaders(event);
  event.locals.locale = resolveLocale(event.cookies.get(LOCALE_COOKIE), event.request.headers.get('accept-language'));

  const raw = event.cookies.get(COOKIE_NAME);
  if (raw) {
    const session = unsealSession(raw, sessionSecret());
    if (session) {
      if (isExpired(session.accessToken)) {
        // Attempt silent refresh
        const refreshed = await tryRefresh(session.refreshToken);
        if (refreshed) {
          const newSession = { ...session, accessToken: refreshed.accessToken };
          event.cookies.set(COOKIE_NAME, sealSession(newSession, sessionSecret()), cookieOptions(event.url));
          event.locals.user = session.user;
          event.locals.accessToken = refreshed.accessToken;
        } else {
          // Refresh failed — clear cookie
          event.cookies.delete(COOKIE_NAME, { path: '/' });
        }
      } else {
        event.locals.user = session.user;
        event.locals.accessToken = session.accessToken;
      }
    }
  }

  // Fresh installation: send everyone to the first-run setup page
  if (!event.locals.user && event.url.pathname !== '/setup' && (await setupRequired())) {
    redirect(302, '/setup');
  }

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale),
  });
  setSecurityHeaders(response.headers, event.url);
  return response;
};

/** Security headers for pages; the Content-Security-Policy comes from svelte.config.js. */
function setSecurityHeaders(headers: Headers, url: URL) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (url.protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}
