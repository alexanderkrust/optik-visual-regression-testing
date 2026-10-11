import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { createServer, type Server } from 'http';
import { extname, join, normalize, resolve, sep } from 'path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { label, pool, withRun, type RunOptions, type RunResult } from './run';

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
  /**
   * Viewports for this story instead of the CLI's — "375x667", or a width in
   * pixels (with the height of the first CLI viewport)
   */
  viewports?: (string | number)[];
}

export type BrowserName = 'chromium' | 'firefox' | 'webkit';
export const BROWSERS: BrowserName[] = ['chromium', 'firefox', 'webkit'];

export interface Viewport {
  width: number;
  height: number;
}

export interface StorybookOptions extends RunOptions {
  /** Parallel browser pages (per browser) */
  concurrency?: number;
  /** Every story is captured in each browser (default: chromium) … */
  browsers?: BrowserName[];
  /** … and each viewport (default: 1280x720) */
  viewports?: Viewport[];
  /** Per story, in milliseconds */
  timeout?: number;
  /**
   * WebSocket endpoint of a Playwright browser server — the optik-renderer
   * container — instead of the locally installed browsers
   */
  renderer?: string;
}

export interface StorybookResult extends RunResult {
  skipped: string[];
  /** Stories that failed to render, with the reason */
  errors: { name: string; message: string }[];
}

/** "1280x720" → { width: 1280, height: 720 }; a number is a width with `height` */
export function parseViewport(value: string | number, height = 720): Viewport | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? { width: value, height } : null;
  const match = /^\s*([1-9]\d{0,4})\s*x\s*([1-9]\d{0,4})\s*$/i.exec(value);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

const viewportName = (v: Viewport) => `${v.width}x${v.height}`;

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
  const chromatic = (parameters.chromatic ?? {}) as { disableSnapshot?: boolean; delay?: number; viewports?: number[] };
  const viewports = optik.viewports ?? chromatic.viewports;
  return {
    disable: optik.disable ?? chromatic.disableSnapshot ?? false,
    delay: optik.delay ?? chromatic.delay ?? 0,
    fullPage: optik.fullPage ?? parameters.layout === 'fullscreen',
    ...(Array.isArray(viewports) && viewports.length > 0 ? { viewports } : {}),
  };
}

/** Loads Playwright, which the CLI only needs for Storybook. */
function loadPlaywright(): typeof import('playwright') {
  try {
    return require('playwright');
  } catch {
    throw new Error(
      'optik storybook needs Playwright to render the stories:\n' +
        '  npm install -D playwright && npx playwright install chromium   (and firefox, webkit for --browsers)',
    );
  }
}

interface Worker {
  /** One page per browser, opened when first needed */
  pages: Map<BrowserName, { context: BrowserContext; page: Page }>;
}

/**
 * Renders every story of a Storybook at `baseUrl` — in each browser and
 * viewport — and uploads a screenshot of each as one run.
 */
export async function captureStorybook(baseUrl: string, options: StorybookOptions): Promise<StorybookResult> {
  const log = options.log ?? (() => {});
  const stories = await listStories(baseUrl);
  const timeout = options.timeout ?? 30_000;
  const browserNames = options.browsers?.length ? options.browsers : (['chromium'] as BrowserName[]);
  const defaultViewports = options.viewports?.length ? options.viewports : [{ width: 1280, height: 720 }];
  const skipped: string[] = [];
  const errors: StorybookResult['errors'] = [];

  const playwright = loadPlaywright();
  const browsers = new Map<BrowserName, Browser>();
  try {
    for (const name of browserNames) {
      browsers.set(
        name,
        options.renderer
          ? // The renderer's browsers reach this machine's localhost (the Storybook server) through the connection
            await playwright[name].connect(options.renderer, { exposeNetwork: '<loopback>', timeout: 60_000 })
          : await playwright[name].launch(),
      );
    }

    const openPage = async (worker: Worker, browserName: BrowserName) => {
      let open = worker.pages.get(browserName);
      if (!open) {
        const context = await browsers.get(browserName)!.newContext({
          viewport: defaultViewports[0],
          deviceScaleFactor: 1,
          reducedMotion: 'reduce',
          // Dates and numbers the same on every machine
          locale: 'en-US',
          timezoneId: 'UTC',
        });
        await context.addInitScript(recordStoryEvents);
        await context.addInitScript({
          content: `addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style');
            style.textContent = ${JSON.stringify(STABLE_CSS)};
            document.head.appendChild(style);
          });`,
        });
        open = { context, page: await context.newPage() };
        worker.pages.set(browserName, open);
      }
      return open.page;
    };

    const tasks = stories.flatMap((story) => browserNames.map((browser) => ({ story, browser })));
    const describe = `${stories.length} stories × ${browserNames.join(', ')} × ${defaultViewports.map(viewportName).join(', ')}`;
    const result = await withRun(options, describe, (submit) =>
      pool<{ story: Story; browser: BrowserName }, Worker>(
        tasks,
        (options.concurrency ?? 4) * browserNames.length,
        async ({ story, browser }, worker) => {
          const name = snapshotName(story);
          const page = await openPage(worker, browser);
          const url = new URL(`iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, baseUrl).href;
          const render = async () => {
            await page.goto(url, { waitUntil: 'load', timeout });
            return waitForStory(page, story.id, timeout).catch(() => ({
              parameters: {},
              error: `Did not render within ${timeout / 1000} s`,
            }));
          };
          const fail = (message: string, viewport?: Viewport) => {
            const where = label(name, { browser, viewport: viewport && viewportName(viewport) });
            errors.push({ name: where, message });
            log(`  ✗ error     ${where}: ${message}`);
          };

          // The first render tells the story's parameters (and its viewports)
          await page.setViewportSize(defaultViewports[0]);
          let rendered = await render();
          if (rendered.error) return fail(rendered.error);
          const params = optikParameters(rendered.parameters);
          if (params.disable) {
            if (browser === browserNames[0]) {
              skipped.push(name);
              log(`  – skipped   ${name}`);
            }
            return;
          }
          const viewports = params.viewports
            ? params.viewports.map((v) => parseViewport(v, defaultViewports[0].height))
            : defaultViewports;
          if (viewports.some((v) => !v)) {
            return fail(`invalid viewports parameter ${JSON.stringify(params.viewports)} — use "375x667" or widths`);
          }

          let current = defaultViewports[0];
          for (const viewport of viewports as Viewport[]) {
            // Render again in the new size, so script-driven layouts see it from the start
            if (viewportName(viewport) !== viewportName(current)) {
              await page.setViewportSize(viewport);
              current = viewport;
              rendered = await render();
              if (rendered.error) {
                fail(rendered.error, viewport);
                continue;
              }
            }
            await settle(page, params.delay ?? 0);
            const root = page.locator('#storybook-root, #root').first();
            const box = params.fullPage ? null : await root.boundingBox().catch(() => null);
            const png =
              box && box.width > 0 && box.height > 0
                ? await root.screenshot({ animations: 'disabled', caret: 'hide' })
                : await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
            await submit(name, png, { browser, viewport: viewportName(viewport) });
          }
        },
        async () => ({ pages: new Map() }),
        async (worker) => {
          for (const { context } of worker.pages.values()) await context.close();
        },
      ),
    );
    return { ...result, skipped: skipped.sort(), errors: errors.sort((a, b) => a.name.localeCompare(b.name)) };
  } finally {
    for (const browser of browsers.values()) await browser.close();
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
