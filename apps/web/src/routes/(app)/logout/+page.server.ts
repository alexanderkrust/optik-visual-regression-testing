import { redirect } from '@sveltejs/kit';
import { unsealSession } from '$lib/session';
import { apiBase } from '$lib/server/api';
import { COOKIE_NAME, sessionSecret } from '$lib/server/session-cookie';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ cookies }) => {
    const raw = cookies.get(COOKIE_NAME);
    if (raw) {
      const session = unsealSession(raw, sessionSecret());
      if (session?.refreshToken) {
        fetch(`${apiBase()}/auth/logout`, {
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
