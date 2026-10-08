import { serverApi } from '$lib/server/api';
import type { PageServerLoad } from './$types';

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
