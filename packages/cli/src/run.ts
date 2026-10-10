import { OptikClient, shouldFail } from '@optik/core';
import type { Run, SubmittedSnapshot } from '@optik/shared';

export interface RunOptions {
  /** Project-scoped API token (optik_...) */
  token: string;
  serverUrl?: string;
  /** Runs are merged and baselines are kept per suite */
  suite: string;
  /** Overrides the project setting "Fail tests on visual changes" */
  failOnChanges?: boolean;
  /** Progress output; nothing when omitted */
  log?: (line: string) => void;
}

export interface RunResult {
  run: Run;
  /** Link to the run in the web UI */
  runUrl: string;
  snapshots: { name: string; result: SubmittedSnapshot }[];
  /** Snapshots that fail the run (changes, unless turned off) */
  failed: number;
}

const LABEL: Record<SubmittedSnapshot['status'], string> = {
  new: '+ new      ',
  unchanged: '  unchanged',
  pending: '● changed  ',
  approved: '✓ accepted ',
  rejected: '✗ rejected ',
};

/**
 * Starts a run, lets `work` submit screenshots and completes the run. When
 * `work` throws, the run is left incomplete — a partial run must not become
 * the baseline for later ones.
 */
export async function withRun(
  options: RunOptions,
  describe: string,
  work: (submit: (name: string, png: Uint8Array) => Promise<void>) => Promise<void>,
): Promise<RunResult> {
  const log = options.log ?? (() => {});
  const client = new OptikClient({ token: options.token, serverUrl: options.serverUrl });
  const run = await client.createRun({ suite: options.suite });
  log(`Run ${run.id.slice(0, 8)} · ${run.branch} · suite ${run.suite} · ${describe}`);

  const snapshots: RunResult['snapshots'] = [];
  await work(async (name, png) => {
    const result = await client.submit(run.id, name, png);
    snapshots.push({ name, result });
    const score = result.status === 'pending' ? ` ${((result.diffScore ?? 0) * 100).toFixed(2)}%` : '';
    log(`  ${LABEL[result.status]} ${name}${score}`);
  });

  // A run without changes is merged into the previous one — link to that
  const completed = await client.complete(run.id);
  snapshots.sort((a, b) => a.name.localeCompare(b.name));
  return {
    run: completed,
    runUrl: client.url(`/${completed.projectSlug}/${completed.id}`),
    snapshots,
    failed: snapshots.filter((s) => shouldFail(s.result, options.failOnChanges)).length,
  };
}

/** Runs `task` for every item, `concurrency` at a time; stops starting new ones after the first error. */
export async function pool<T, W>(
  items: T[],
  concurrency: number,
  task: (item: T, worker: W) => Promise<void>,
  /** Per-worker state, e.g. a browser page; closed when the worker ends */
  open: () => Promise<W> = async () => undefined as W,
  close: (worker: W) => Promise<void> = async () => {},
): Promise<void> {
  let next = 0;
  let aborted = false;
  const worker = async () => {
    if (next >= items.length) return;
    const state = await open();
    try {
      while (next < items.length && !aborted) {
        const item = items[next++];
        await task(item, state).catch((e) => {
          aborted = true;
          throw e;
        });
      }
    } finally {
      await close(state);
    }
  };
  // Wait for every worker to close its state before reporting the first error
  const results = await Promise.allSettled(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker),
  );
  const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) throw failure.reason;
}
