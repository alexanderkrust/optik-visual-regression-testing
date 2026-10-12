import { execFileSync } from 'child_process';
import { readFile } from 'fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'path';

/**
 * TurboSnap: only the stories that the changes since the base commit can
 * affect are captured — the others keep their baselines. Which stories a
 * file affects comes from Storybook's module graph (`storybook build
 * --stats-json`, preview-stats.json).
 */

/** Changes to these mean any story can look different */
const LOCKFILES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
]);

export type Selection =
  | { all: true; reason: string }
  | { all: false; storyIds: Set<string>; changedFiles: number };

interface StatsModule {
  name?: string;
  reasons?: { moduleName?: string | null }[];
  /** Webpack: modules concatenated into this one */
  modules?: StatsModule[];
}

export interface TurboSnapInput {
  /** preview-stats.json */
  stats: { modules?: StatsModule[] };
  stories: { id: string; importPath?: string }[];
  /** Absolute paths of the files changed since the base commit */
  changedFiles: string[];
  /** Directory Storybook was built in — module and import paths are relative to it */
  projectDir: string;
  /** Storybook's config directory (default: <projectDir>/.storybook) */
  configDir?: string;
}

/** "./src/Button.tsx?inline + 2 modules" → absolute path; null for virtual and dependency modules */
function modulePath(name: string | null | undefined, projectDir: string): string | null {
  if (!name) return null;
  const path = name.replace(/ \+ \d+ modules?$/, '').replace(/\?.*$/, '');
  if (path.includes('node_modules') || path.startsWith('/virtual:') || path.startsWith('\0')) return null;
  if (path.startsWith('./') || path.startsWith('../')) return resolve(projectDir, path);
  return isAbsolute(path) ? path : null;
}

const inside = (file: string, dir: string) => file === dir || file.startsWith(dir + sep);

/** Which stories to capture, given what changed since the base commit. */
export function selectStories(input: TurboSnapInput): Selection {
  const { projectDir } = input;
  const configDir = input.configDir ?? join(projectDir, '.storybook');

  for (const file of input.changedFiles) {
    if (LOCKFILES.has(basename(file))) return { all: true, reason: `${relative(projectDir, file)} changed` };
    if (inside(file, configDir)) return { all: true, reason: `Storybook configuration changed (${relative(projectDir, file)})` };
  }

  // Who imports each module
  const importers = new Map<string, Set<string>>();
  const add = (module: StatsModule, importersOf: (StatsModule['reasons'] & object) = []) => {
    const path = modulePath(module.name, projectDir);
    if (path) {
      const set = importers.get(path) ?? new Set<string>();
      for (const reason of importersOf) {
        const from = modulePath(reason.moduleName, projectDir);
        if (from && from !== path) set.add(from);
      }
      importers.set(path, set);
    }
    for (const inner of module.modules ?? []) add(inner, [...importersOf, ...(inner.reasons ?? [])]);
  };
  for (const module of input.stats.modules ?? []) add(module, module.reasons);

  // Everything that (indirectly) imports a changed file
  const affected = new Set<string>();
  const queue = input.changedFiles.filter((file) => importers.has(file)).map((file) => ({ file, changed: file }));
  while (queue.length > 0) {
    const { file, changed } = queue.pop()!;
    if (affected.has(file)) continue;
    affected.add(file);
    // Imported by the preview (global styles, decorators …): every story
    if (inside(file, configDir)) {
      return {
        all: true,
        reason: `${relative(projectDir, changed)} is used by the Storybook configuration (${relative(projectDir, file)})`,
      };
    }
    for (const importer of importers.get(file) ?? []) queue.push({ file: importer, changed });
  }

  const storyIds = new Set(
    input.stories
      .filter((story) => story.importPath && affected.has(resolve(projectDir, story.importPath)))
      .map((story) => story.id),
  );
  return { all: false, storyIds, changedFiles: input.changedFiles.length };
}

export async function readStats(file: string): Promise<TurboSnapInput['stats'] | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Files changed since `base` — committed, staged, unstaged and new untracked
 * files — as absolute paths. Null when the commit isn't in the local history
 * (e.g. a shallow clone).
 */
export function changedFilesSince(base: string, cwd: string): string[] | null {
  try {
    const root = git(['rev-parse', '--show-toplevel'], cwd).trim();
    const changed = git(['diff', '--name-only', '--no-renames', base], cwd);
    const untracked = git(['ls-files', '--others', '--exclude-standard', '--full-name'], root);
    return [...new Set([...changed.split('\n'), ...untracked.split('\n')].filter(Boolean))].map((f) => join(root, f));
  } catch {
    return null;
  }
}
