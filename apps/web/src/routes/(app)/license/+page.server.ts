import { error, fail } from '@sveltejs/kit';
import { serverApi } from '$lib/server/api';
import { messages } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { user } = await event.parent();
  if (user.role !== 'admin') error(403, messages(event.locals.locale).license.adminsOnly);
  return { info: await serverApi(event.locals).license.get() };
};

/** "400 Bad Request: message" from the API → just the message */
const message = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^\d{3} [^:]*:?\s*/, '') || e.message : String(e);

export const actions: Actions = {
  install: async (event) => {
    const key = String((await event.request.formData()).get('key') ?? '');
    if (!key.trim()) return fail(400, { error: messages(event.locals.locale).license.pasteKey });
    try {
      await serverApi(event.locals).license.set(key);
      return { installed: true };
    } catch (e) {
      return fail(400, { error: message(e) });
    }
  },
  remove: async (event) => {
    try {
      await serverApi(event.locals).license.remove();
      return { removed: true };
    } catch (e) {
      return fail(400, { error: message(e) });
    }
  },
};
