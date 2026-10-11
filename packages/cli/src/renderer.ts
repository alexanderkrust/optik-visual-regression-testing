import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

/** Published with every optik release; tagged with the Playwright version inside. */
export const RENDERER_IMAGE = 'ghcr.io/alexanderkrust/optik-renderer';
/** Build context of the image, for other Playwright versions */
const RENDERER_SOURCE = 'https://github.com/alexanderkrust/optik-visual-regression-testing.git#main:docker/renderer';

/** The installed Playwright's version — the renderer must run the same one. */
export function playwrightVersion(): string {
  return require('playwright/package.json').version;
}

export interface Renderer {
  /** WebSocket endpoint of the browser server */
  wsEndpoint: string;
  stop: () => Promise<void>;
}

/**
 * Starts the optik-renderer container matching the installed Playwright on a
 * free local port and waits until its browser server answers.
 */
export async function startRenderer(
  image = `${RENDERER_IMAGE}:${playwrightVersion()}`,
  log: (line: string) => void = () => {},
): Promise<Renderer> {
  log(`Starting ${image} …`);
  let id: string;
  try {
    ({ stdout: id } = await run(
      'docker',
      ['run', '--detach', '--rm', '--platform', 'linux/amd64', '--publish', '127.0.0.1::3000', image],
      { timeout: 10 * 60_000 },
    ));
  } catch (e) {
    const err = e as { code?: string; stderr?: string; message: string };
    if (err.code === 'ENOENT') throw new Error('--docker needs Docker: https://docs.docker.com/get-docker/');
    // Docker's own reason, without its usage hints
    const reason =
      (err.stderr ?? '').split('\n').find((line) => line.startsWith('docker: '))?.slice('docker: '.length) ??
      (err.stderr || err.message).trim();
    throw new Error(
      `Could not start ${image}: ${reason}\n` +
        `The renderer is tagged with the Playwright version it runs (installed here: ${playwrightVersion()}). ` +
        'For another version build it yourself:\n' +
        `  docker build --platform linux/amd64 --build-arg PLAYWRIGHT_VERSION=${playwrightVersion()} -t optik-renderer ${RENDERER_SOURCE}\n` +
        '  OPTIK_RENDERER_IMAGE=optik-renderer optik storybook --docker',
    );
  }
  id = id.trim();
  const stop = async () => {
    await run('docker', ['stop', '--time', '2', id]).catch(() => {});
  };
  try {
    const { stdout } = await run('docker', ['port', id, '3000/tcp']);
    const port = /:(\d+)\s*$/m.exec(stdout)?.[1];
    if (!port) throw new Error(`Could not find the renderer's port (docker port: ${stdout.trim()})`);
    const http = `http://127.0.0.1:${port}/`;
    const deadline = Date.now() + 60_000;
    while (!(await fetch(http).then((r) => r.ok, () => false))) {
      if (Date.now() > deadline) throw new Error(`${image} did not start within 60 s`);
      await new Promise((done) => setTimeout(done, 250));
    }
    return { wsEndpoint: `ws://127.0.0.1:${port}/`, stop };
  } catch (e) {
    await stop();
    throw e;
  }
}
