import { error, fail, redirect } from '@sveltejs/kit';
import { sealSession } from '$lib/session';
import { apiBase } from '$lib/server/api';
import { COOKIE_NAME, cookieOptions, sessionSecret } from '$lib/server/session-cookie';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const res = await fetch(`${apiBase()}/invitations/token/${encodeURIComponent(params.token)}`);
  if (!res.ok) error(404, 'This invitation is invalid or has expired. Ask an admin for a new one.');
  return (await res.json()) as { email: string; expiresAt: string };
};

export const actions: Actions = {
  default: async ({ request, params, cookies, url, locals }) => {
    const data = await request.formData();
    const password = String(data.get('password') ?? '');
    if (password !== String(data.get('confirm') ?? '')) {
      return fail(400, { error: 'The passwords do not match' });
    }

    const res = await fetch(`${apiBase()}/invitations/token/${encodeURIComponent(params.token)}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...locals.forwarded },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return fail(res.status, { error: body.message ?? 'Could not accept the invitation.' });
    }

    // Signed in right away
    const session = await res.json();
    cookies.set(COOKIE_NAME, sealSession(session, sessionSecret()), cookieOptions(url));
    redirect(302, '/');
  },
};
