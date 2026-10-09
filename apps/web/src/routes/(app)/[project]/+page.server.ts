import { serverApi } from '$lib/server/api';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async (event) => {
  const api = serverApi(event.locals);
  try {
    const [project, runs, tokens] = await Promise.all([
      api.projects.get(event.params.project),
      api.runs.list(event.params.project),
      api.tokens.list(event.params.project),
    ]);
    return { project, runs, tokens, projectSlug: event.params.project };
  } catch (e) {
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
    const defaultBranch = (data.get('defaultBranch') as string | null)?.trim() ?? '';
    if (!defaultBranch) return fail(400, { settingsError: 'The default branch is required' });

    try {
      await api.projects.update(event.params.project, { defaultBranch });
      return { settingsSaved: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('400')) {
        return fail(400, { settingsError: 'That is not a valid git branch name' });
      }
      return fail(500, { settingsError: `Failed to save: ${msg}` });
    }
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
