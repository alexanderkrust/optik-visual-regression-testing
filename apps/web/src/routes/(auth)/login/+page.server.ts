import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { sealSession } from '$lib/session';
import type { Actions } from './$types';

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

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = (data.get('email') as string | null)?.trim() ?? '';
    const password = (data.get('password') as string | null) ?? '';

    if (!email || !password) {
      return fail(400, { error: 'Email and password are required', email });
    }

    try {
      const res = await fetch(`${getApiBase()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          return fail(401, { error: 'Invalid email or password', email });
        }
        return fail(res.status, { error: 'Login failed. Please try again.', email });
      }

      const body = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string };
      };

      cookies.set(COOKIE_NAME, sealSession({ accessToken: body.accessToken, refreshToken: body.refreshToken, user: body.user }, SESSION_SECRET), COOKIE_OPTS);
    } catch (error) {
      console.error('Error during login:', error);
      return fail(502, { error: 'Could not reach the API. Make sure the server is running.', email });
    }

    redirect(302, '/');
  },
};
