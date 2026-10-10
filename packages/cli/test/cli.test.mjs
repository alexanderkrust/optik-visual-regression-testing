// Run with `pnpm --filter @optik/cli test` (after building).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { main } from '../dist/cli.js';
import { collectScreenshots } from '../dist/index.js';

// A 1×1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** The adapter API: answers each snapshot with the status named in `statuses` */
function fakeServer(statuses) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (req.headers.authorization !== 'Bearer optik_test') return json(401, { message: 'Invalid token' });
    const run = { id: 'run-1', projectSlug: 'app', branch: 'main', suite: req.url === '/api/runs' ? JSON.parse(body).suite : 'cli' };
    if (req.url === '/api/runs') return json(201, run);
    if (req.url === '/api/runs/run-1/complete') return json(200, run);
    if (req.url === '/api/snapshots') {
      const name = /name="name"\r\n\r\n([^\r]*)/.exec(body)[1];
      const status = statuses[name] ?? 'unchanged';
      return json(201, { name, status, diffScore: 0.0123, failTest: status === 'pending', reviewPath: `/app/run-1?snapshot=${name}` });
    }
    json(404, { message: 'Not found' });
  });
  return { server, requests };
}

let dir;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'optik-cli-'));
  await mkdir(join(dir, 'shots', 'home'), { recursive: true });
  await writeFile(join(dir, 'shots', 'home', 'desktop.png'), PNG);
  await writeFile(join(dir, 'shots', 'login.PNG'), PNG);
  await writeFile(join(dir, 'shots', 'notes.txt'), 'not a screenshot');
  await mkdir(join(dir, 'shots', 'node_modules'));
  await writeFile(join(dir, 'shots', 'node_modules', 'skip.png'), PNG);
});

async function run(args, statuses = {}, env = {}) {
  const { server, requests } = fakeServer(statuses);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const lines = [];
  const log = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    const code = await main(args, { OPTIK_TOKEN: 'optik_test', OPTIK_SERVER_URL: url, ...env });
    return { code, requests, output: lines.join('\n') };
  } finally {
    console.log = log;
    server.closeAllConnections();
    server.close();
  }
}

test('names snapshots by their path in the directory', async () => {
  const shots = await collectScreenshots([join(dir, 'shots')]);
  assert.deepEqual(
    shots.map((s) => s.name),
    ['home/desktop', 'login'],
  );
});

test('uploads all screenshots as one run and completes it', async () => {
  const { code, requests, output } = await run(['upload', join(dir, 'shots'), '--suite', 'docs']);
  assert.equal(code, 0);
  assert.deepEqual(
    requests.map((r) => `${r.method} ${r.url}`),
    ['POST /api/runs', 'POST /api/snapshots', 'POST /api/snapshots', 'POST /api/runs/run-1/complete'],
  );
  assert.equal(JSON.parse(requests[0].body).suite, 'docs');
  assert.match(output, /2 snapshots: 2 unchanged/);
  assert.match(output, /Review: http:\/\/127\.0\.0\.1:\d+\/app\/run-1/);
});

test('exits with 1 when snapshots changed and the project fails tests', async () => {
  const { code, output } = await run(['upload', join(dir, 'shots')], { login: 'pending', 'home/desktop': 'new' });
  assert.equal(code, 1);
  assert.match(output, /● changed\s+login 1\.23%/);
  assert.match(output, /2 snapshots: 1 to review, 1 new/);
});

test('--no-fail-on-changes exits with 0 despite changes', async () => {
  const { code } = await run(['upload', join(dir, 'shots'), '--no-fail-on-changes'], { login: 'pending' });
  assert.equal(code, 0);
});

test('reports a wrong token', async () => {
  await assert.rejects(run(['upload', join(dir, 'shots')], {}, { OPTIK_TOKEN: 'optik_wrong' }), /auth failed \(401\): Invalid token/);
});

test('needs a token and something to upload', async () => {
  assert.equal((await run(['upload', join(dir, 'shots')], {}, { OPTIK_TOKEN: '' })).code, 2);
  assert.equal((await run(['upload'])).code, 2);
  await assert.rejects(run(['upload', join(dir, 'shots', 'notes.txt')]), /Not a PNG/);
});
