import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { unsealSession } from '$lib/session';
import type { Actions } from './$types';

if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set in the environment');
const SESSION_SECRET: string = env.SESSION_SECRET;

const COOKIE_NAME = 'optik_session';

function getApiBase(): string {
  return (
    process.env.PRIVATE_API_URL ??
    process.env.PUBLIC_API_URL ??
    'http://localhost:3001'
  );
}

export const actions: Actions = {
  default: async ({ cookies }) => {
    const raw = cookies.get(COOKIE_NAME);
    if (raw) {
      const session = unsealSession(raw, SESSION_SECRET);
      if (session?.refreshToken) {
        fetch(`${getApiBase()}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        }).catch(() => { /* ignore */ });
      }
      cookies.delete(COOKIE_NAME, { path: '/' });
    }
    redirect(302, '/login');
  },
};
