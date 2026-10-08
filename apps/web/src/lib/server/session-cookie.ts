import { env } from '$env/dynamic/private';

export const COOKIE_NAME = 'optik_session';

export function sessionSecret(): string {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set in the environment');
  return env.SESSION_SECRET;
}

/** Secure cookies only over https — internal installations often run on plain http. */
export function cookieOptions(url: URL) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    secure: url.protocol === 'https:',
  };
}
