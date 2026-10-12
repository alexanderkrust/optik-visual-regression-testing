// Run with `pnpm --filter @optik/cli test` (after building).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { captureKey, changedFilesSince, selectStories } from '../dist/index.js';

const PROJECT = '/repo/apps/example';
const at = (path) => join(PROJECT, path);

// The shape `storybook build --stats-json` writes with the Vite builder (Storybook 10)
const VITE_STATS = {
  modules: [
    { name: '/virtual:/@storybook/builder-vite/storybook-stories.js', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/vite-app.js' }] },
    { name: './src/components/Badge.stories.tsx', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/storybook-stories.js' }] },
    { name: './src/components/Button.stories.tsx', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/storybook-stories.js' }] },
    { name: './src/components/Card.stories.tsx', reasons: [{ moduleName: '/virtual:/@storybook/builder-vite/storybook-stories.js' }] },
    { name: './src/components/Button.tsx', reasons: [{ moduleName: './src/components/Card.stories.tsx' }, { moduleName: './src/components/Button.stories.tsx' }] },
    { name: './src/components/Card.tsx', reasons: [{ moduleName: './src/components/Card.stories.tsx' }] },
    { name: './src/components/Badge.tsx', reasons: [{ moduleName: './src/components/Badge.stories.tsx' }] },
    { name: './src/tokens.ts?inline', reasons: [{ moduleName: './src/components/Badge.tsx' }] },
    { name: '../../packages/ui/src/icon.tsx', reasons: [{ moduleName: './src/components/Button.tsx' }] },
    { name: './src/index.css', reasons: [{ moduleName: './.storybook/preview.ts' }] },
    { name: './node_modules/react/index.js', reasons: [{ moduleName: './src/components/Button.tsx' }] },
  ],
};

const STORIES = [
  { id: 'badge--all', importPath: './src/components/Badge.stories.tsx' },
  { id: 'button--primary', importPath: './src/components/Button.stories.tsx' },
  { id: 'button--secondary', importPath: './src/components/Button.stories.tsx' },
  { id: 'card--default', importPath: './src/components/Card.stories.tsx' },
];

const select = (changedFiles, stats = VITE_STATS) => selectStories({ stats, stories: STORIES, changedFiles, projectDir: PROJECT });
const ids = (selection) => (selection.all ? selection : [...selection.storyIds].sort());

test('a component change affects the stories that import it, directly or not', () => {
  assert.deepEqual(ids(select([at('src/components/Button.tsx')])), ['button--primary', 'button--secondary', 'card--default']);
  assert.deepEqual(ids(select([at('src/components/Card.tsx')])), ['card--default']);
  // Through Badge.tsx; the query string of the module doesn't matter
  assert.deepEqual(ids(select([at('src/tokens.ts')])), ['badge--all']);
  // A package elsewhere in the monorepo
  assert.deepEqual(ids(select(['/repo/packages/ui/src/icon.tsx'])), ['button--primary', 'button--secondary', 'card--default']);
});

test('a story file affects its own stories', () => {
  assert.deepEqual(ids(select([at('src/components/Badge.stories.tsx')])), ['badge--all']);
});

test('files outside the module graph affect nothing', () => {
  assert.deepEqual(ids(select([at('README.md'), '/repo/apps/api/src/main.ts', at('src/components/Button.test.tsx')])), []);
  assert.equal(select([]).changedFiles, 0);
});

test('captures everything for dependencies, configuration and global styles', () => {
  for (const file of ['/repo/pnpm-lock.yaml', at('package.json'), '/repo/package.json', '/repo/yarn.lock']) {
    assert.equal(select([file]).all, true, file);
  }
  const config = select([at('.storybook/preview.ts')]);
  assert.deepEqual(config, { all: true, reason: 'Storybook configuration changed (.storybook/preview.ts)' });
  // index.css is imported by the preview — it can change every story
  assert.match(select([at('src/index.css')]).reason, /src\/index\.css is used by the Storybook configuration/);
});

test('reads webpack stats with concatenated modules', () => {
  const webpack = {
    modules: [
      {
        name: './src/components/Button.stories.tsx + 2 modules',
        reasons: [{ moduleName: './storybook-stories.js' }],
        modules: [
          { name: './src/components/Button.stories.tsx', reasons: [] },
          { name: './src/components/Button.tsx', reasons: [{ moduleName: './src/components/Button.stories.tsx' }] },
          { name: './src/components/Spinner.tsx', reasons: [{ moduleName: './src/components/Button.tsx' }] },
        ],
      },
    ],
  };
  assert.deepEqual(ids(select([at('src/components/Spinner.tsx')], webpack)), ['button--primary', 'button--secondary']);
});

test('the capture key changes with everything that changes pixels', () => {
  const vp = [{ width: 1280, height: 720 }, { width: 375, height: 667 }];
  const key = captureKey(['firefox', 'chromium'], vp, false);
  assert.match(key, /^storybook-1;browsers=chromium,firefox;viewports=1280x720,375x667;local-\w+-\w+;playwright=\d+\.\d+\.\d+$/);
  assert.equal(captureKey(['chromium', 'firefox'], [...vp].reverse(), false), key);
  assert.notEqual(captureKey(['chromium', 'firefox'], vp, true), key);
  assert.notEqual(captureKey(['chromium'], vp, false), key);
});

test('lists files changed since a commit, including uncommitted and new ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'optik-turbosnap-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  await mkdir(join(dir, 'src'));
  await writeFile(join(dir, 'src/a.ts'), 'a');
  await writeFile(join(dir, 'src/b.ts'), 'b');
  git('add', '.');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');

  await writeFile(join(dir, 'src/a.ts'), 'a2');
  git('commit', '-qam', 'change a');
  await writeFile(join(dir, 'src/b.ts'), 'b2'); // uncommitted
  await writeFile(join(dir, 'src/c.ts'), 'c'); // untracked

  const root = git('rev-parse', '--show-toplevel');
  assert.deepEqual(changedFilesSince(base, dir).sort(), ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((f) => join(root, f)));
  assert.equal(changedFilesSince('0123456789abcdef0123456789abcdef01234567', dir), null);
});
