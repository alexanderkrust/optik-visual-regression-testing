import { serverApi } from '$lib/server/api';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const api = serverApi(event.locals);
  try {
    const projects = await api.projects.list();
    return { projects };
  } catch (e) {
    console.error('[load] Failed to fetch projects:', e);
    return { projects: [] as Awaited<ReturnType<typeof api.projects.list>> };
  }
};

export const actions: Actions = {
  create: async (event) => {
    const api = serverApi(event.locals);
    const data = await event.request.formData();
    const name = (data.get('name') as string)?.trim();
    const slug = (data.get('slug') as string)?.trim();

    if (!name || !slug) {
      return fail(400, { name, slug, error: 'Name and slug are required.' });
    }

    try {
      await api.projects.create({ name, slug });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('409')) {
        return fail(409, { name, slug, error: `Slug "${slug}" is already taken.` });
      }
      console.error('[action:create] API error:', e);
      return fail(502, { name, slug, error: 'Could not reach the API. Make sure the server is running.' });
    }

    return { success: true };
  },
};
