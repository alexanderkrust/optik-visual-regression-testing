import { redirect } from '@sveltejs/kit';
import { sealSession } from '$lib/session';
import { apiBase } from '$lib/server/api';
import { messages } from '$lib/i18n';
import { COOKIE_NAME, cookieOptions, sessionSecret } from '$lib/server/session-cookie';
import type { PageServerLoad } from './$types';

/**
 * The end of a single sign-on: the API sends the browser here with a
 * one-time code, which is traded for a session — tokens never appear in URLs.
 */
export const load: PageServerLoad = async ({ url, cookies, locals }) => {
  const code = url.searchParams.get('code') ?? '';
  const returnTo = url.searchParams.get('returnTo') ?? '/';

  const res = await fetch(`${apiBase()}/auth/sso/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...locals.forwarded },
    body: JSON.stringify({ code }),
  }).catch(() => null);
  if (!res?.ok) redirect(302, `/login?${new URLSearchParams({ sso_error: messages(locals.locale).auth.ssoExpired })}`);

  const body = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
  };
  cookies.set(
    COOKIE_NAME,
    sealSession({ accessToken: body.accessToken, refreshToken: body.refreshToken, user: body.user }, sessionSecret()),
    cookieOptions(url),
  );
  // Only paths inside optik
  redirect(302, /^\/(?![/\\])/.test(returnTo) ? returnTo : '/');
};
