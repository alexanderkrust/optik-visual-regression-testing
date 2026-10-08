import { fail, redirect } from '@sveltejs/kit';
import { sealSession } from '$lib/session';
import { apiBase } from '$lib/server/api';
import { setupRequired } from '$lib/server/setup';
import { COOKIE_NAME, cookieOptions, sessionSecret } from '$lib/server/session-cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!(await setupRequired())) redirect(302, '/login');
};

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const data = await request.formData();
    const email = (data.get('email') as string | null)?.trim() ?? '';
    const password = (data.get('password') as string | null) ?? '';
    const confirm = (data.get('confirm') as string | null) ?? '';

    if (password !== confirm) {
      return fail(400, { error: 'The passwords do not match', email });
    }

    let res: Response;
    try {
      res = await fetch(`${apiBase()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return fail(502, { error: 'Could not reach the API. Make sure the server is running.', email });
    }

    if (res.status === 403) redirect(302, '/login');
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return fail(res.status, { error: body.message ?? 'Setup failed. Please try again.', email });
    }

    // The new admin is signed in right away
    const session = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string };
    };
    cookies.set(COOKIE_NAME, sealSession(session, sessionSecret()), cookieOptions(url));
    redirect(302, '/');
  },
};
