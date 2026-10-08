import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { unsealSession, sealSession } from '$lib/session';

if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set in the environment');
const SESSION_SECRET: string = env.SESSION_SECRET;

const COOKIE_NAME = 'optik_session';

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
  secure: process.env.NODE_ENV === 'production',
};

function getApiBase(): string {
  return (
    process.env.PRIVATE_API_URL ??
    process.env.PUBLIC_API_URL ??
    'http://localhost:3001'
  );
}

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
    const res = await fetch(`${getApiBase()}/auth/refresh`, {
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
    const session = unsealSession(raw, SESSION_SECRET);
    if (session) {
      if (isExpired(session.accessToken)) {
        // Attempt silent refresh
        const refreshed = await tryRefresh(session.refreshToken);
        if (refreshed) {
          const newSession = { ...session, accessToken: refreshed.accessToken };
          event.cookies.set(COOKIE_NAME, sealSession(newSession, SESSION_SECRET), COOKIE_OPTS);
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

  return resolve(event);
};
