import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { createServer, type Server } from 'http';
import { extname, join, normalize, resolve, sep } from 'path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { pool, withRun, type RunOptions, type RunResult } from './run';

export interface Story {
  id: string;
  title: string;
  name: string;
}

/** Story parameters optik reads: `parameters: { optik: { … } }` */
export interface OptikParameters {
  /** Don't take a snapshot of this story */
  disable?: boolean;
  /** Milliseconds to wait after the story rendered, e.g. for animations that can't be turned off */
  delay?: number;
  /** Capture the whole page instead of the story's root element (e.g. for modals rendered in a portal) */
  fullPage?: boolean;
}

export interface StorybookOptions extends RunOptions {
  /** Parallel browser pages */
  concurrency?: number;
  /** Browser viewport */
  viewport?: { width: number; height: number };
  /** Per story, in milliseconds */
  timeout?: number;
}

export interface StorybookResult extends RunResult {
  skipped: string[];
  /** Stories that failed to render, with the reason */
  errors: { name: string; message: string }[];
}

/** "Components/Button" + "Primary" → "Components/Button/Primary" */
export const snapshotName = (story: Story) => `${story.title}/${story.name}`;

// ------------------------------------------------------------------ stories

/** The stories of a Storybook build or server: index.json (Storybook 7+), else stories.json (6.4+). */
export async function listStories(baseUrl: string): Promise<Story[]> {
  for (const file of ['index.json', 'stories.json']) {
    const res = await fetch(new URL(file, baseUrl));
    if (!res.ok) continue;
    const index = (await res.json()) as {
      entries?: Record<string, Story & { type?: string }>;
      stories?: Record<string, Story & { kind?: string }>;
    };
    const entries = Object.values(index.entries ?? index.stories ?? {});
    return entries
      .filter((e) => (e as { type?: string }).type === undefined || (e as { type?: string }).type === 'story')
      .map((e) => ({ id: e.id, title: e.title ?? (e as { kind?: string }).kind ?? '', name: e.name }));
  }
  throw new Error(`No Storybook found at ${baseUrl} (neither index.json nor stories.json). Build it first: storybook build`);
}

// ------------------------------------------------------------------ static server

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

/** Serves a Storybook build (storybook-static) on a free local port. */
export async function serveDirectory(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const root = resolve(dir);
  const server: Server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      await stat(file);
    } catch {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}

// ------------------------------------------------------------------ capture

/**
 * Runs before Storybook's own scripts: records the channel events that say a
 * story was prepared (with its parameters), rendered or failed.
 */
function recordStoryEvents() {
  type Channel = { on: (event: string, listener: (payload: unknown) => void) => void };
  const w = window as unknown as Record<string, unknown> & { __optik: { events: [string, unknown][] } };
  w.__optik = { events: [] };
  const watch = (channel: Channel) => {
    for (const event of ['storyPrepared', 'storyRendered', 'storyErrored', 'storyThrewException', 'storyMissing']) {
      channel.on(event, (payload) => w.__optik.events.push([event, payload]));
    }
  };
  let channel: Channel | undefined;
  Object.defineProperty(window, '__STORYBOOK_ADDONS_CHANNEL__', {
    configurable: true,
    get: () => channel,
    set: (value: Channel) => {
      channel = value;
      watch(value);
    },
  });
}

/** Freezes what makes screenshots flaky: animations, transitions, the blinking caret. */
const STABLE_CSS = `*, *::before, *::after {
  animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important;
  transition-duration: 0s !important; transition-delay: 0s !important;
  caret-color: transparent !important; scroll-behavior: auto !important;
}`;

interface Rendered {
  parameters: Record<string, unknown>;
  error: string | null;
}

/** Waits until Storybook rendered the story (play function included) or reported an error. */
async function waitForStory(page: Page, id: string, timeout: number): Promise<Rendered> {
  const handle = await page.waitForFunction(
    (storyId) => {
      const events = (window as unknown as { __optik?: { events: [string, any][] } }).__optik?.events ?? [];
      const prepared = events.find(([e, p]) => e === 'storyPrepared' && p?.id === storyId)?.[1];
      for (const [event, payload] of events) {
        if (event === 'storyRendered' && (payload === storyId || payload?.storyId === storyId)) {
          return { parameters: prepared?.parameters ?? {}, error: null };
        }
        if (event === 'storyMissing') return { parameters: {}, error: `Story "${storyId}" not found` };
        if (event === 'storyErrored') return { parameters: {}, error: payload?.description ?? payload?.title ?? 'Render error' };
        if (event === 'storyThrewException') return { parameters: {}, error: payload?.message ?? String(payload) };
      }
      return null;
    },
    id,
    { timeout, polling: 50 },
  );
  return (await handle.jsonValue()) as Rendered;
}

/** Waits for web fonts and images, then for `delay` milliseconds. */
async function settle(page: Page, delay: number) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].filter((img) => !img.complete).map((img) => new Promise((done) => {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      })),
    );
  });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  if (delay > 0) await page.waitForTimeout(delay);
}

/** Story parameters, with Chromatic's `disableSnapshot` and `delay` honoured for an easy switch. */
export function optikParameters(parameters: Record<string, unknown>): OptikParameters {
  const optik = (parameters.optik ?? {}) as OptikParameters;
  const chromatic = (parameters.chromatic ?? {}) as { disableSnapshot?: boolean; delay?: number };
  return {
    disable: optik.disable ?? chromatic.disableSnapshot ?? false,
    delay: optik.delay ?? chromatic.delay ?? 0,
    fullPage: optik.fullPage ?? parameters.layout === 'fullscreen',
  };
}

/** Loads Playwright, which the CLI only needs for Storybook. */
function loadPlaywright(): typeof import('playwright') {
  try {
    return require('playwright');
  } catch {
    throw new Error(
      'optik storybook needs Playwright to render the stories:\n' +
        '  npm install -D playwright && npx playwright install chromium',
    );
  }
}

/** Renders every story of a Storybook at `baseUrl` and uploads a screenshot of each as one run. */
export async function captureStorybook(baseUrl: string, options: StorybookOptions): Promise<StorybookResult> {
  const log = options.log ?? (() => {});
  const stories = await listStories(baseUrl);
  const timeout = options.timeout ?? 30_000;
  const skipped: string[] = [];
  const errors: StorybookResult['errors'] = [];

  const { chromium } = loadPlaywright();
  const browser: Browser = await chromium.launch();
  try {
    const result = await withRun(options, `${stories.length} stories`, (submit) =>
      pool<Story, { context: BrowserContext; page: Page }>(
        stories,
        options.concurrency ?? 4,
        async (story, { page }) => {
          const name = snapshotName(story);
          const url = new URL(`iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, baseUrl);
          await page.goto(url.href, { waitUntil: 'load', timeout });
          const rendered = await waitForStory(page, story.id, timeout).catch(() => ({
            parameters: {},
            error: `Did not render within ${timeout / 1000} s`,
          }));
          if (rendered.error) {
            errors.push({ name, message: rendered.error });
            log(`  ✗ error     ${name}: ${rendered.error}`);
            return;
          }
          const params = optikParameters(rendered.parameters);
          if (params.disable) {
            skipped.push(name);
            log(`  – skipped   ${name}`);
            return;
          }
          await settle(page, params.delay ?? 0);
          const root = page.locator('#storybook-root, #root').first();
          const box = params.fullPage ? null : await root.boundingBox().catch(() => null);
          const png =
            box && box.width > 0 && box.height > 0
              ? await root.screenshot({ animations: 'disabled', caret: 'hide' })
              : await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
          await submit(name, png);
        },
        async () => {
          const context = await browser.newContext({
            viewport: options.viewport ?? { width: 1280, height: 720 },
            deviceScaleFactor: 1,
            reducedMotion: 'reduce',
          });
          await context.addInitScript(recordStoryEvents);
          await context.addInitScript({
            content: `addEventListener('DOMContentLoaded', () => {
              const style = document.createElement('style');
              style.textContent = ${JSON.stringify(STABLE_CSS)};
              document.head.appendChild(style);
            });`,
          });
          return { context, page: await context.newPage() };
        },
        async ({ context }) => context.close(),
      ),
    );
    return { ...result, skipped: skipped.sort(), errors: errors.sort((a, b) => a.name.localeCompare(b.name)) };
  } finally {
    await browser.close();
  }
}

/** `optik storybook <dir or url>`: serves a build directory, or uses a running Storybook. */
export async function storybook(source: string, options: StorybookOptions): Promise<StorybookResult> {
  if (/^https?:\/\//.test(source)) return captureStorybook(source.endsWith('/') ? source : `${source}/`, options);
  const server = await serveDirectory(source);
  try {
    return await captureStorybook(server.url, options);
  } finally {
    await server.close();
  }
}
