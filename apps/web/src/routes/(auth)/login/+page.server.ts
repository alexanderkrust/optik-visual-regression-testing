import { fail, redirect } from '@sveltejs/kit';
import { sealSession } from '$lib/session';
import { apiBase } from '$lib/server/api';
import { COOKIE_NAME, cookieOptions, sessionSecret } from '$lib/server/session-cookie';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request, cookies, url, locals }) => {
    const data = await request.formData();
    const email = (data.get('email') as string | null)?.trim() ?? '';
    const password = (data.get('password') as string | null) ?? '';

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required', email });
    }

    try {
      const res = await fetch(`${apiBase()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...locals.forwarded },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          return fail(401, { error: 'Invalid email or password', email });
        }
        if (res.status === 429) {
          const { retryAfter } = (await res.json().catch(() => ({}))) as { retryAfter?: number };
          const minutes = Math.max(1, Math.ceil((retryAfter ?? 60) / 60));
          return fail(429, {
            error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
            email,
          });
        }
        return fail(res.status, { error: 'Login failed. Please try again.', email });
      }

      const body = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string };
      };

      cookies.set(COOKIE_NAME, sealSession({ accessToken: body.accessToken, refreshToken: body.refreshToken, user: body.user }, sessionSecret()), cookieOptions(url));
    } catch (error) {
      console.error('Error during login:', error);
      return fail(502, { error: 'Could not reach the API. Make sure the server is running.', email });
    }

    redirect(302, '/');
  },
};
