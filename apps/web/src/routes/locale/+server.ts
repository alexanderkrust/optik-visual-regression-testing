import { redirect } from '@sveltejs/kit';
import { LOCALE_COOKIE, LOCALES } from '$lib/i18n';
import type { RequestHandler } from './$types';

/** The language switch: remembers the choice for a year and goes back to the page. */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const data = await request.formData();
  const locale = LOCALES.find((l) => l.value === data.get('locale'))?.value;
  if (locale) {
    cookies.set(LOCALE_COOKIE, locale, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
    });
  }
  const back = String(data.get('redirectTo') ?? '/');
  redirect(303, /^\/(?![/\\])/.test(back) ? back : '/');
};
