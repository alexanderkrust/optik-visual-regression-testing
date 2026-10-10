// Run with `pnpm --filter @optik/cli test` (after building). Rendering needs a
// browser and is checked against apps/example (pnpm test:storybook).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { listStories, optikParameters } from '../dist/index.js';
import { serveDirectory, snapshotName } from '../dist/storybook.js';

async function storybookBuild(files) {
  const dir = await mkdtemp(join(tmpdir(), 'optik-storybook-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

test('lists the stories of a Storybook 7+ build, without docs pages', async () => {
  const dir = await storybookBuild({
    'index.json': {
      v: 5,
      entries: {
        'button--primary': { id: 'button--primary', title: 'Components/Button', name: 'Primary', type: 'story' },
        'button--docs': { id: 'button--docs', title: 'Components/Button', name: 'Docs', type: 'docs' },
      },
    },
  });
  const server = await serveDirectory(dir);
  try {
    const stories = await listStories(server.url);
    assert.deepEqual(stories, [{ id: 'button--primary', title: 'Components/Button', name: 'Primary' }]);
    assert.equal(snapshotName(stories[0]), 'Components/Button/Primary');
  } finally {
    await server.close();
  }
});

test('falls back to stories.json of Storybook 6', async () => {
  const dir = await storybookBuild({
    'stories.json': { v: 3, stories: { 'card--default': { id: 'card--default', kind: 'Card', name: 'Default' } } },
  });
  const server = await serveDirectory(dir);
  try {
    assert.deepEqual(await listStories(server.url), [{ id: 'card--default', title: 'Card', name: 'Default' }]);
  } finally {
    await server.close();
  }
});

test('explains a directory without a Storybook build', async () => {
  const server = await serveDirectory(await storybookBuild({ 'index.html': '<p>hi</p>' }));
  try {
    await assert.rejects(listStories(server.url), /No Storybook found.*storybook build/);
  } finally {
    await server.close();
  }
});

test('serves files with their type and nothing outside the directory', async () => {
  const dir = await storybookBuild({ 'iframe.html': '<p>story</p>', 'assets/app.js': 'x' });
  const server = await serveDirectory(dir);
  try {
    const page = await fetch(new URL('iframe.html?id=a&viewMode=story', server.url));
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match((await fetch(new URL('assets/app.js', server.url))).headers.get('content-type'), /javascript/);
    assert.equal((await fetch(new URL('missing.js', server.url))).status, 404);
    assert.equal((await fetch(`${server.url}..%2F..%2Fetc%2Fpasswd`)).status, 403);
  } finally {
    await server.close();
  }
});

test('reads optik parameters, and Chromatic parameters for an easy switch', () => {
  assert.deepEqual(optikParameters({}), { disable: false, delay: 0, fullPage: false });
  assert.deepEqual(optikParameters({ optik: { disable: true, delay: 300 } }), { disable: true, delay: 300, fullPage: false });
  assert.deepEqual(optikParameters({ chromatic: { disableSnapshot: true, delay: 100 } }), {
    disable: true,
    delay: 100,
    fullPage: false,
  });
  assert.equal(optikParameters({ optik: { disable: false }, chromatic: { disableSnapshot: true } }).disable, false);
  assert.equal(optikParameters({ layout: 'fullscreen' }).fullPage, true);
});
