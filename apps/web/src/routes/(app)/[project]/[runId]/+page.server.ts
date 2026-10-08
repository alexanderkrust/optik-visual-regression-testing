import { createApi } from '$lib/api';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const api = createApi(event.locals.accessToken ?? undefined);
  try {
    const [run, snapshots] = await Promise.all([
      api.runs.get(event.params.runId),
      api.snapshots.list(event.params.runId),
    ]);
    return { run, snapshots, projectSlug: event.params.project, runId: event.params.runId };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('404')) {
      // Runs without visual changes are merged into the previous run of their branch
      throw error(404, 'Run not found — runs without visual changes are merged into the previous run');
    }
    console.error(`[load] Failed to fetch snapshots for run ${event.params.runId}:`, e);
    throw error(503, 'API unavailable — make sure the API server is running');
  }
};
