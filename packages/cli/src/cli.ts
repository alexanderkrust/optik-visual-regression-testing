#!/usr/bin/env node
import { join, resolve } from 'path';
import { parseArgs } from 'util';
import type { RunResult } from './run';
import { startRenderer, type Renderer } from './renderer';
import { BROWSERS, parseViewport, storybook, type BrowserName } from './storybook';
import { collectScreenshots, upload } from './upload';

const HELP = `Usage:
  optik upload <file or directory>... [options]
  optik storybook [storybook-static | url] [options]

upload     Uploads PNG screenshots as one run. A snapshot's name is its path
           relative to the directory, without ".png" (screenshots/home/desktop.png → home/desktop).
storybook  Renders every story of a Storybook build (default: ./storybook-static) or a
           running Storybook (http://…) and uploads a screenshot of each — named "Title/Story".
           Needs Playwright: npm install -D playwright && npx playwright install chromium

Options:
  --suite <name>          Runs are merged and baselines are kept per suite
                          (default: cli, or storybook for the storybook command)
  --server <url>          optik server (default: OPTIK_SERVER_URL, else http://localhost:3000)
  --fail-on-changes       Exit with 1 when snapshots changed (default: the project setting)
  --no-fail-on-changes    Exit with 0 even when snapshots changed
  --concurrency <n>       Parallel uploads, or browser pages per browser (default: 4)
  --browser <name>        upload: browser the screenshots were taken with (e.g. firefox)
  --viewport <w>x<h>      upload: viewport the screenshots were taken with
  --browsers <list>       storybook: chromium, firefox and/or webkit (default: chromium)
  --viewports <list>      storybook: e.g. 375x667,1280x720 (default: 1280x720)
  --timeout <seconds>     storybook: time a story may take to render (default: 30)
  --renderer <ws-url>     storybook: use the browsers of an optik-renderer container
                          (default: OPTIK_RENDERER) for identical screenshots everywhere
  --docker                storybook: start the optik-renderer container for this run
  --only-changed          storybook: TurboSnap — capture only the stories that changed files can
                          affect since the last accepted run (needs storybook build --stats-json)
  --stats-file <path>     storybook: Storybook's module graph (default: <build>/preview-stats.json)
  --storybook-dir <path>  storybook: directory Storybook was built in (default: current directory)
  --config-dir <path>     storybook: Storybook's config directory (default: <storybook-dir>/.storybook)

Name, browser and viewport identify a snapshot: each combination has its own baseline.
  -h, --help              Show this help
  -v, --version           Show the version

Environment:
  OPTIK_TOKEN             Project API token (optik_...) — required
  OPTIK_SERVER_URL        optik server
  OPTIK_RENDERER          WebSocket URL of an optik-renderer container (see --renderer)
  OPTIK_RENDERER_IMAGE    Image for --docker (default: ghcr.io/alexanderkrust/optik-renderer:<Playwright version>)
  OPTIK_BRANCH, OPTIK_COMMIT  Override the branch and commit detected from git or CI

Exit codes: 0 no changes to review (or not failing), 1 changes to review,
            2 error (including stories that failed to render).
`;

function summary(result: RunResult, extra: [number, string][] = []) {
  const count = (status: string) => result.snapshots.filter((s) => s.result.status === status).length;
  const parts = ([[count('pending'), 'to review'], [count('new'), 'new'], [count('unchanged'), 'unchanged'], ...extra] as [
    number,
    string,
  ][]).filter(([n]) => n);
  console.log(`\n${result.snapshots.length} snapshots: ${parts.map(([n, label]) => `${n} ${label}`).join(', ') || 'none'}`);
  console.log(`Review: ${result.runUrl}`);
}

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      suite: { type: 'string' },
      server: { type: 'string' },
      'fail-on-changes': { type: 'boolean' },
      'no-fail-on-changes': { type: 'boolean' },
      concurrency: { type: 'string', default: '4' },
      browser: { type: 'string' },
      viewport: { type: 'string' },
      browsers: { type: 'string', default: 'chromium' },
      viewports: { type: 'string' },
      timeout: { type: 'string', default: '30' },
      renderer: { type: 'string' },
      docker: { type: 'boolean' },
      'only-changed': { type: 'boolean' },
      'stats-file': { type: 'string' },
      'storybook-dir': { type: 'string' },
      'config-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.version) {
    console.log(require('../package.json').version);
    return 0;
  }
  const [command, ...paths] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return values.help ? 0 : 2;
  }
  if (command !== 'upload' && command !== 'storybook') {
    console.error(`Unknown command "${command}".\n\n${HELP}`);
    return 2;
  }
  const token = env.OPTIK_TOKEN;
  if (!token) {
    console.error('Set OPTIK_TOKEN to a project API token (optik_...) — create one under Access Tokens in optik.');
    return 2;
  }
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    console.error('--concurrency must be a positive number');
    return 2;
  }
  const run = {
    token,
    serverUrl: values.server ?? env.OPTIK_SERVER_URL,
    failOnChanges: values['no-fail-on-changes'] ? false : values['fail-on-changes'] ? true : undefined,
    concurrency,
    log: (line: string) => console.log(line),
  };

  if (command === 'storybook') {
    // --viewport is accepted for a single viewport
    const viewports = (values.viewports ?? values.viewport ?? '1280x720').split(',').map((v) => parseViewport(v));
    const browsers = values.browsers!.split(',').map((b) => b.trim().toLowerCase());
    const timeout = Number(values.timeout);
    if (viewports.some((v) => !v)) {
      console.error('--viewports must look like 375x667,1280x720');
      return 2;
    }
    const unknown = browsers.filter((b) => !BROWSERS.includes(b as BrowserName));
    if (unknown.length > 0) {
      console.error(`Unknown browser ${unknown.join(', ')} — use ${BROWSERS.join(', ')}`);
      return 2;
    }
    if (!(timeout > 0)) {
      console.error('--timeout must be a positive number of seconds');
      return 2;
    }
    if (paths.length > 1) {
      console.error('Name one Storybook: optik storybook [storybook-static | url]');
      return 2;
    }
    if (values.docker && (values.renderer || env.OPTIK_RENDERER)) {
      console.error('Use either --docker or --renderer / OPTIK_RENDERER');
      return 2;
    }
    const source = paths[0] ?? 'storybook-static';
    const isUrl = /^https?:\/\//.test(source);
    if (values['only-changed'] && isUrl && !values['stats-file']) {
      console.error('--only-changed with a Storybook URL needs --stats-file (preview-stats.json of storybook build --stats-json)');
      return 2;
    }
    let container: Renderer | undefined;
    if (values.docker) container = await startRenderer(env.OPTIK_RENDERER_IMAGE || undefined, run.log);
    let result;
    try {
      result = await storybook(source, {
        ...run,
        suite: values.suite ?? 'storybook',
        browsers: [...new Set(browsers)] as BrowserName[],
        viewports: viewports as { width: number; height: number }[],
        timeout: timeout * 1000,
        renderer: container?.wsEndpoint ?? values.renderer ?? env.OPTIK_RENDERER,
        onlyChanged: values['only-changed']
          ? {
              statsFile: values['stats-file'] ?? join(source, 'preview-stats.json'),
              projectDir: values['storybook-dir'],
              configDir: values['config-dir'] && resolve(values['config-dir']),
            }
          : undefined,
      });
    } finally {
      await container?.stop();
    }
    summary(result, [
      [result.unaffected, 'unaffected stories (TurboSnap)'],
      [result.skipped.length, 'skipped'],
      [result.errors.length, 'failed to render'],
    ]);
    if (result.errors.length > 0) return 2;
    return result.failed > 0 ? 1 : 0;
  }

  if (paths.length === 0) {
    console.error('Name the screenshots to upload: optik upload <file or directory>...');
    return 2;
  }
  const screenshots = await collectScreenshots(paths);
  if (screenshots.length === 0) {
    console.error(`No PNG files found in ${paths.join(', ')}`);
    return 2;
  }
  const viewport = values.viewport ? parseViewport(values.viewport) : undefined;
  if (viewport === null) {
    console.error('--viewport must look like 1280x720');
    return 2;
  }
  const result = await upload(screenshots, {
    ...run,
    suite: values.suite ?? 'cli',
    variant: { browser: values.browser, viewport: viewport ? `${viewport.width}x${viewport.height}` : undefined },
  });
  summary(result);
  return result.failed > 0 ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: Error) => {
      console.error(e.message);
      process.exit(2);
    },
  );
}
