// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { error, fail } from '@sveltejs/kit';
import type { ProjectRole } from '@optik/shared';
import { serverApi } from '$lib/server/api';
import { messages } from '$lib/i18n';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const { user } = await event.parent();
  if (user.role !== 'admin') error(403, messages(event.locals.locale).teams.adminsOnly);
  const api = serverApi(event.locals);
  try {
    const [teams, projects] = await Promise.all([api.teams.list(), api.projects.list()]);
    return { available: true as const, teams, projects };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('403')) return { available: false as const, teams: [], projects: [] };
    throw e;
  }
};

/** "400 Bad Request: message" from the API → just the message */
const message = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^\d{3} [^:]*:?\s*/, '') || e.message : String(e);

/** Runs an API call for a team; errors are shown on that team's card. */
async function forTeam(id: string, run: () => Promise<unknown>) {
  try {
    await run();
    return { ok: id };
  } catch (e) {
    return fail(400, { error: message(e), team: id });
  }
}

export const actions: Actions = {
  create: async (event) => {
    const data = await event.request.formData();
    return forTeam('new', () =>
      serverApi(event.locals).teams.create({
        name: String(data.get('name') ?? ''),
        description: String(data.get('description') ?? '') || null,
      }),
    );
  },
  remove: async (event) => {
    const id = String((await event.request.formData()).get('id'));
    return forTeam(id, () => serverApi(event.locals).teams.remove(id));
  },
  addMember: async (event) => {
    const data = await event.request.formData();
    const id = String(data.get('id'));
    return forTeam(id, () => serverApi(event.locals).teams.addMember(id, String(data.get('email') ?? '')));
  },
  removeMember: async (event) => {
    const data = await event.request.formData();
    const id = String(data.get('id'));
    return forTeam(id, () => serverApi(event.locals).teams.removeMember(id, String(data.get('userId'))));
  },
  setRole: async (event) => {
    const data = await event.request.formData();
    const id = String(data.get('id'));
    const role = String(data.get('role') ?? '');
    return forTeam(id, () =>
      serverApi(event.locals).teams.setProjectRole(
        id,
        String(data.get('project')),
        role ? (role as ProjectRole) : null,
      ),
    );
  },
};
