import { readdir, readFile, stat } from 'fs/promises';
import { join, relative, sep } from 'path';
import { pool, withRun, type RunOptions, type RunResult } from './run';

export interface UploadOptions extends RunOptions {
  /** Parallel uploads */
  concurrency?: number;
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

/** Starts a run, uploads the screenshots and completes the run. */
export function upload(screenshots: { name: string; file: string }[], options: UploadOptions): Promise<RunResult> {
  return withRun(options, `${screenshots.length} screenshots`, (submit) =>
    pool(screenshots, options.concurrency ?? 4, async ({ name, file }) => submit(name, await readFile(file))),
  );
}
