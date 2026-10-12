import { AdapterClient, AdminClient, png, resetDatabase, startApp, TestApp } from './helpers';

const WHITE = png(255);
const GRAY = png(128);
const KEY = 'storybook/1;chromium;1280x720;local:1.59.1';

// Commits, oldest first: a ← b ← c ← d
const [A, B, C, D] = ['aaaaaaa', 'bbbbbbb', 'ccccccc', 'ddddddd'];
/** The commit and its ancestors, newest first — as the adapters send them */
const history = (sha: string) => [D, C, B, A].slice([D, C, B, A].indexOf(sha));

describe('TurboSnap base', () => {
  let t: TestApp;
  let admin: AdminClient;
  let adapter: AdapterClient;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    admin = await AdminClient.setup(t.api);
    await admin.createProject('shop');
    adapter = new AdapterClient(t.api, await admin.createToken('shop'));
  });

  /** A run on `sha` with the given snapshots, completed with `captureKey` (none: as after errors) */
  async function run(sha: string, shots: Record<string, Buffer>, captureKey?: string, branch = 'main') {
    const started = (await adapter.startRun(branch, sha, 'storybook', history(sha))).body;
    const results: Record<string, any> = {};
    for (const [name, image] of Object.entries(shots)) {
      results[name] = (await adapter.submit(started.id, name, image)).body;
    }
    const completed = await adapter.complete(started.id, captureKey);
    expect(completed.status).toBe(201);
    return { id: started.id as string, snapshots: results, completed: completed.body };
  }

  const base = async (sha: string, captureKey = KEY) => {
    const res = await adapter.turboSnapBase(history(sha), captureKey, 'storybook');
    expect(res.status).toBe(201);
    return res.body;
  };

  it('has no base without an earlier run', async () => {
    expect(await base(D)).toEqual({ commitSha: null, runId: null });
  });

  it('is the newest completed run on an ancestor with the same capture settings', async () => {
    const first = await run(A, { Button: WHITE, Card: WHITE }, KEY);
    const second = await run(B, { Button: GRAY }, KEY); // a change …
    expect(await base(D)).toEqual({ commitSha: A, runId: first.id }); // … open: not a base

    await admin.review(second.snapshots.Button.id, 'approved');
    expect(await base(D)).toEqual({ commitSha: B, runId: second.id });
    // Another commit's history doesn't include later commits
    expect(await base(A)).toEqual({ commitSha: A, runId: first.id });
    // Other settings, other suite: no base
    expect((await base(D, 'storybook/1;firefox;1280x720;local:1.59.1')).commitSha).toBeNull();
    expect((await adapter.turboSnapBase(history(D), KEY, 'other')).body.commitSha).toBeNull();
  });

  it('never builds on rejected changes or runs that had errors', async () => {
    await run(A, { Button: WHITE }, KEY);
    const rejected = await run(B, { Button: GRAY }, KEY);
    await admin.review(rejected.snapshots.Button.id, 'rejected');
    expect((await base(D)).commitSha).toBe(A);

    // Completed without captureKey: something failed to render
    await run(C, { Card: WHITE });
    expect((await base(D)).commitSha).toBe(A);
  });

  it('follows runs merged into an earlier one, and forgets the base when a merged run had errors', async () => {
    const first = await run(A, { Button: WHITE }, KEY);
    const merged = await run(B, { Button: WHITE }, KEY);
    expect(merged.completed).toMatchObject({ id: first.id, runCount: 2 });
    expect(await base(D)).toEqual({ commitSha: B, runId: first.id });

    // Merged again, but this time the capture had errors
    await run(C, { Button: WHITE });
    expect(await base(D)).toEqual({ commitSha: null, runId: null });
  });

  it('validates the request', async () => {
    expect((await adapter.turboSnapBase(history(D), '')).status).toBe(400);
    expect((await adapter.turboSnapBase(['not a sha'], KEY)).status).toBe(400);
    const started = (await adapter.startRun('main', A)).body;
    expect((await adapter.complete(started.id, 'x'.repeat(501))).status).toBe(400);
  });
});
