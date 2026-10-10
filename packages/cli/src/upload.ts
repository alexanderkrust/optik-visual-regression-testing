import { readdir, readFile, stat } from 'fs/promises';
import { join, relative, sep } from 'path';
import { OptikClient, shouldFail } from '@optik/core';
import type { Run, SubmittedSnapshot } from '@optik/shared';

export interface UploadOptions {
  /** Project-scoped API token (optik_...) */
  token: string;
  serverUrl?: string;
  /** Runs are merged and baselines are kept per suite */
  suite: string;
  /** Overrides the project setting "Fail tests on visual changes" */
  failOnChanges?: boolean;
  /** Parallel uploads */
  concurrency?: number;
  /** Progress output; nothing when omitted */
  log?: (line: string) => void;
}

export interface UploadResult {
  run: Run;
  /** Link to the run in the web UI */
  runUrl: string;
  snapshots: { name: string; result: SubmittedSnapshot }[];
  /** Snapshots that fail the run (changes, unless turned off) */
  failed: number;
}

/**
 * Screenshots to upload: every PNG under the given files and directories.
 * A snapshot's name is its path relative to the directory, without ".png" —
 * `screenshots/home/desktop.png` becomes `home/desktop`.
 */
export async function collectScreenshots(paths: string[]): Promise<{ name: string; file: string }[]> {
  const found = new Map<string, string>();
  for (const path of paths) {
    if ((await stat(path)).isDirectory()) {
      for (const file of await walk(path)) found.set(snapshotName(relative(path, file)), file);
    } else if (path.toLowerCase().endsWith('.png')) {
      found.set(snapshotName(path.split(sep).pop()!), path);
    } else {
      throw new Error(`Not a PNG file or directory: ${path}`);
    }
  }
  return [...found].map(([name, file]) => ({ name, file })).sort((a, b) => a.name.localeCompare(b.name));
}

const snapshotName = (path: string) => path.split(sep).join('/').replace(/\.png$/i, '');

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(async (e) => {
        const path = join(dir, e.name);
        if (e.isDirectory()) return walk(path);
        return e.isFile() && e.name.toLowerCase().endsWith('.png') ? [path] : [];
      }),
  );
  return files.flat();
}

const LABEL: Record<SubmittedSnapshot['status'], string> = {
  new: '+ new      ',
  unchanged: '  unchanged',
  pending: '● changed  ',
  approved: '✓ accepted ',
  rejected: '✗ rejected ',
};

/** Starts a run, uploads the screenshots and completes the run. */
export async function upload(
  screenshots: { name: string; file: string }[],
  options: UploadOptions,
): Promise<UploadResult> {
  const log = options.log ?? (() => {});
  const client = new OptikClient({ token: options.token, serverUrl: options.serverUrl });
  const run = await client.createRun({ suite: options.suite });
  log(`Run ${run.id.slice(0, 8)} · ${run.branch} · suite ${run.suite} · ${screenshots.length} screenshots`);

  const snapshots: UploadResult['snapshots'] = [];
  let next = 0;
  let aborted = false;
  const worker = async () => {
    while (next < screenshots.length && !aborted) {
      const { name, file } = screenshots[next++];
      const result = await client.submit(run.id, name, await readFile(file)).catch((e) => {
        // Stop the other uploads; the run stays incomplete
        aborted = true;
        throw e;
      });
      snapshots.push({ name, result });
      const score = result.status === 'pending' ? ` ${((result.diffScore ?? 0) * 100).toFixed(2)}%` : '';
      log(`  ${LABEL[result.status]} ${name}${score}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));

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
