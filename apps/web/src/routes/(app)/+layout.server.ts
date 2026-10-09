import { redirect } from '@sveltejs/kit';
import { serverApi } from '$lib/server/api';
import { COOKIE_NAME } from '$lib/server/session-cookie';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  if (!event.locals.user) {
    redirect(302, '/login');
  }
  // The role can change at any time, so it is loaded fresh instead of read from the session
  let me;
  try {
    me = await serverApi(event.locals).auth.me();
  } catch (e) {
    // The account was removed: end the session
    if (e instanceof Error && e.message.startsWith('401')) {
      event.cookies.delete(COOKIE_NAME, { path: '/' });
      redirect(302, '/login');
    }
    throw e;
  }
  return { user: me, accessToken: event.locals.accessToken };
};
