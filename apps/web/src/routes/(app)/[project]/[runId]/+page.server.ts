import { serverApi } from '$lib/server/api';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const api = serverApi(event.locals);
  try {
    const [project, run, snapshots] = await Promise.all([
      api.projects.get(event.params.project),
      api.runs.get(event.params.runId),
      api.snapshots.list(event.params.runId),
    ]);
    const canReview = project.myRole !== 'viewer';
    const canModerate = project.myRole === 'maintainer' || project.myRole === 'admin';
    return {
      run,
      snapshots,
      canReview,
      canModerate,
      projectSlug: event.params.project,
      runId: event.params.runId,
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('404')) {
      // Runs without visual changes are merged into the previous run of their branch
      throw error(404, 'Run not found — runs without visual changes are merged into the previous run');
    }
    console.error(`[load] Failed to fetch snapshots for run ${event.params.runId}:`, e);
    throw error(503, 'API unavailable — make sure the API server is running');
  }
};
