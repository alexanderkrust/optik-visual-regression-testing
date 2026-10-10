import { serverApi } from '$lib/server/api';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { CiProvider, NotificationChannelType, NotificationEvent, ProjectRole } from '@optik/shared';

export const load: PageServerLoad = async (event) => {
  const api = serverApi(event.locals);
  try {
    const [project, runs] = await Promise.all([
      api.projects.get(event.params.project),
      api.runs.list(event.params.project),
    ]);
    // Tokens and members are for maintainers (and admins) only
    const manages = project.myRole === 'maintainer' || project.myRole === 'admin';
    const [tokens, members, channels, teams] = manages
      ? await Promise.all([
          api.tokens.list(event.params.project),
          api.members.list(event.params.project),
          api.notifications.list(event.params.project),
          // Teams (Enterprise) — empty on servers without them
          api.teams.forProject(event.params.project).catch(() => []),
        ])
      : [[], [], [], []];
    return { project, runs, tokens, members, channels, teams, manages, projectSlug: event.params.project };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('404')) error(404, 'Project not found');
    console.error(`[load] Failed to fetch project data for ${event.params.project}:`, e);
    throw error(503, 'API unavailable — make sure the API server is running');
  }
};

export const actions: Actions = {
  createToken: async (event) => {
    const api = serverApi(event.locals);
    const data = await event.request.formData();
    const name = (data.get('name') as string | null)?.trim() ?? '';
    const expiresAtRaw = (data.get('expiresAt') as string | null)?.trim() ?? '';
    const expiresAt = expiresAtRaw || null;

    if (!name) return fail(400, { tokenError: 'Token name is required' });

    try {
      const created = await api.tokens.create(event.params.project, { name, expiresAt });
      return { createdToken: created.token, createdTokenName: created.name };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('503') || msg.toLowerCase().includes('fetch'))
        return fail(502, { tokenError: 'Could not reach the API. Make sure the server is running.' });
      return fail(500, { tokenError: `Failed to create token: ${msg}` });
    }
  },

  updateSettings: async (event) => {
    const api = serverApi(event.locals);
    const data = await event.request.formData();
    const field = (name: string) => ((data.get(name) as string | null) ?? '').trim();
    const defaultBranch = field('defaultBranch');
    if (!defaultBranch) return fail(400, { settingsError: 'The default branch is required' });

    try {
      await api.projects.update(event.params.project, {
        defaultBranch,
        failTestsOnChanges: data.get('failTestsOnChanges') === 'on',
        ciProvider: field('ciProvider') as CiProvider | '',
        ciRepository: field('ciRepository'),
        ciApiUrl: field('ciApiUrl'),
        // Empty keeps the stored token; it is never sent back to the browser
        ...(field('ciToken') ? { ciToken: field('ciToken') } : {}),
      });
      return { settingsSaved: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('400')) {
        // "400 Bad Request: The GitLab repository must look like …"
        return fail(400, { settingsError: msg.replace(/^400[^:]*:\s*/, '') });
      }
      return fail(500, { settingsError: `Failed to save: ${msg}` });
    }
  },

  setMember: async (event) => {
    const data = await event.request.formData();
    try {
      await serverApi(event.locals).members.set(event.params.project, {
        email: String(data.get('email') ?? '').trim(),
        role: data.get('role') as ProjectRole,
      });
      return { memberSaved: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message.replace(/^\d{3} [^:]*:?\s*/, '') : String(e);
      return fail(400, { memberError: msg });
    }
  },

  addChannel: async (event) => {
    const data = await event.request.formData();
    try {
      const channel = await serverApi(event.locals).notifications.create(event.params.project, {
        type: data.get('type') as NotificationChannelType,
        target: String(data.get('target') ?? ''),
        events: data.getAll('events') as NotificationEvent[],
      });
      return { channelAdded: true, webhookSecret: channel.webhookSecret ?? null };
    } catch (e) {
      const msg = e instanceof Error ? e.message.replace(/^\d{3} [^:]*:?\s*/, '') : String(e);
      return fail(400, { channelError: msg });
    }
  },

  removeChannel: async (event) => {
    const data = await event.request.formData();
    await serverApi(event.locals).notifications.remove(event.params.project, String(data.get('id')));
  },

  testChannel: async (event) => {
    const data = await event.request.formData();
    const id = String(data.get('id'));
    const { delivered } = await serverApi(event.locals).notifications.test(event.params.project, id);
    return { testedChannel: id, delivered };
  },

  removeMember: async (event) => {
    const data = await event.request.formData();
    await serverApi(event.locals).members.remove(event.params.project, String(data.get('userId')));
  },

  revokeToken: async (event) => {
    const api = serverApi(event.locals);
    const data = await event.request.formData();
    const tokenId = data.get('tokenId') as string | null;

    if (!tokenId) return fail(400, { revokeError: 'Missing token ID' });

    try {
      await api.tokens.revoke(event.params.project, tokenId);
      return { revoked: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(500, { revokeError: `Failed to revoke token: ${msg}` });
    }
  },
};
