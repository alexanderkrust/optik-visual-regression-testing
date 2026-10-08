import type { Handle } from '@sveltejs/kit';
import { unsealSession, sealSession } from '$lib/session';
import { apiBase } from '$lib/server/api';
import { COOKIE_NAME, cookieOptions, sessionSecret } from '$lib/server/session-cookie';
import { setupRequired } from '$lib/server/setup';
import { redirect } from '@sveltejs/kit';

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

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.accessToken = null;

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

  return resolve(event);
};
