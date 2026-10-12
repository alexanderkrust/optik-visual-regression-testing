// Node side: runs in Cypress's setupNodeEvents, where the token lives. The
// support file (./support) takes the screenshots and hands them over here.
import { readFile } from 'fs/promises';
import { OptikClient, shouldFail } from '@optik/core';
import type { Run } from '@optik/shared';
import type { SubmitRequest, SubmitResponse } from './types';

export type { SubmitRequest, SubmitResponse } from './types';

export interface OptikCypressOptions {
  /** Project-scoped API token (optik_...). Defaults to OPTIK_TOKEN */
  token?: string;
  /** Defaults to OPTIK_SERVER_URL, else http://localhost:3000 */
  serverUrl?: string;
  /**
   * Name of this test suite. Runs are merged and baselines are kept per suite.
   * Defaults to "cypress".
   */
  suite?: string;
  /**
   * Fail tests on visual changes. Defaults to the project setting — turn it off
   * there when changes are reported as a commit status instead.
   */
  failOnChanges?: boolean;
  /**
   * Also upload in `cypress open`. Cypress only reports the end of an
   * interactive session with `experimentalInteractiveRunEvents: true` — without
   * it the run is never completed. Default: false (snapshots are skipped).
   */
  interactive?: boolean;
}

/** Completes the run of the last optikPlugin() call */
let completeCurrent: () => Promise<void> = async () => {};

/**
 * Wires optik into Cypress. Call it from setupNodeEvents:
 *
 * @example
 * // cypress.config.ts
 * import { optikPlugin } from '@optik/cypress'
 * export default defineConfig({
 *   e2e: {
 *     setupNodeEvents(on, config) {
 *       return optikPlugin(on, config, { suite: 'cypress' })
 *     },
 *   },
 * })
 *
 * It registers the `optik:submit` task and an `after:run` handler that
 * completes the run. Cypress keeps one handler per event: if you register your
 * own `after:run` afterwards, call `completeRun()` from it.
 */
export function optikPlugin(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  options: OptikCypressOptions = {},
): Cypress.PluginConfigOptions {
  const skipReason =
    config.isInteractive && !options.interactive
      ? 'cypress open — set interactive: true (with experimentalInteractiveRunEvents) to upload'
      : null;
  let client: OptikClient | undefined;
  let run: Promise<Run> | undefined;

  // The run starts with the first snapshot, so specs without any create none
  const startRun = () => {
    client ??= new OptikClient({ token: options.token ?? process.env.OPTIK_TOKEN ?? '', serverUrl: options.serverUrl });
    run ??= client.createRun({ suite: options.suite ?? 'cypress' });
    return run;
  };

  const complete = async () => {
    if (!run || !client) return;
    const { id } = await run;
    run = undefined;
    await client.complete(id);
  };
  completeCurrent = complete;

  on('task', {
    async 'optik:submit'(request: SubmitRequest): Promise<SubmitResponse> {
      if (skipReason) return { skipped: true, reason: skipReason };
      const { id } = await startRun();
      const result = await client!.submit(id, request.name, await readFile(request.path), {
        browser: request.browser,
        viewport: request.viewport,
      });
      return {
        skipped: false,
        status: result.status,
        diffScore: result.diffScore,
        failTest: shouldFail(result, options.failOnChanges),
        reviewUrl: client!.url(result.reviewPath),
      };
    },
  });
  on('after:run', complete);
  return config;
}

/** Completes the run — for an `after:run` handler of your own, which replaces optik's. */
export function completeRun(): Promise<void> {
  return completeCurrent();
}
