// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { error } from '@sveltejs/kit';
import { serverApi } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

/** Filters the page passes on to the API */
const FILTERS = ['q', 'action', 'project', 'from', 'to', 'before'] as const;

export const load: PageServerLoad = async (event) => {
  const { user } = await event.parent();
  if (user.role !== 'admin') error(403, 'Only admins can see the audit log');
  const api = serverApi(event.locals);

  const query = new URLSearchParams();
  for (const name of FILTERS) {
    const value = event.url.searchParams.get(name)?.trim();
    if (value) query.set(name, value);
  }
  query.set('limit', '50');

  try {
    const [page, projects] = await Promise.all([api.audit.list(query.toString()), api.projects.list()]);
    return { page, projects, available: true as const };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith('403')) return { page: null, projects: [], available: false as const };
    error(400, message.replace(/^\d{3} [^:]*:?\s*/, ''));
  }
};

export const actions: Actions = {
  verify: async (event) => ({ verification: await serverApi(event.locals).audit.verify() }),
};
