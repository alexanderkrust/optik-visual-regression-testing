import { AdapterClient, AdminClient, png, resetDatabase, startApp, TestApp } from './helpers';

const WHITE = png(255);
const BLACK = png(0);

describe('runs', () => {
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

  it('starts a run and completes it', async () => {
    const started = await adapter.startRun('main', 'abc1234');
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ status: 'running', branch: 'main', commitSha: 'abc1234' });

    await adapter.submit(started.body.id, 'Button', WHITE);
    const completed = await adapter.complete(started.body.id);
    expect(completed.body).toMatchObject({
      id: started.body.id,
      status: 'complete',
      snapshotCount: 1,
      pendingCount: 0,
      changedCount: 0,
      runCount: 1,
    });
  });

  it('counts pending and reviewed changes', async () => {
    await adapter.fullRun({ A: WHITE, B: WHITE, C: WHITE });
    const run = await adapter.fullRun({ A: BLACK, B: BLACK, C: WHITE });
    await admin.review(run.snapshots.A.id, 'approved');

    expect((await admin.run(run.runId)).body).toMatchObject({
      snapshotCount: 3,
      pendingCount: 1,
      changedCount: 2,
    });
  });

  describe('suites', () => {
    const run = (suite: string | undefined, image: Buffer, branch = 'main') =>
      adapter.fullRun({ Button: image }, branch, 'abc1234', suite);

    it('puts runs without a suite into "default"', async () => {
      expect((await adapter.startRun()).body.suite).toBe('default');
      expect((await adapter.startRun('main', 'abc', ' vitest ')).body.suite).toBe('vitest');
    });

    it('rejects invalid suite names', async () => {
      for (const suite of ['has space', 'x'.repeat(65), 'ümlaut']) {
        expect((await adapter.startRun('main', 'abc', suite)).status).toBe(400);
      }
    });

    it('merges runs only within the same suite', async () => {
      const vitest = await run('vitest', WHITE);
      const playwright = await run('playwright', WHITE);
      expect(playwright.completed.id).toBe(playwright.runId);

      const vitestAgain = await run('vitest', WHITE);
      expect(vitestAgain.snapshots.Button.status).toBe('unchanged');
      expect(vitestAgain.completed).toMatchObject({ id: vitest.runId, runCount: 2 });
    });

    it('keeps baselines per suite, even for equal snapshot names', async () => {
      await run('components', WHITE);
      const pages = await run('pages', BLACK);
      expect(pages.snapshots.Button.status).toBe('new');

      expect((await run('components', WHITE)).snapshots.Button.status).toBe('unchanged');
      expect((await run('pages', BLACK)).snapshots.Button.status).toBe('unchanged');
    });

    it('falls back to "default" baselines, so reviews from before suites carry over', async () => {
      const legacy = (await run(undefined, WHITE)).snapshots.Button;

      const same = (await run('vitest', WHITE)).snapshots.Button;
      expect(same).toMatchObject({ status: 'unchanged', baselineId: legacy.id });

      // A change is still detected against the old baseline …
      const changed = (await run('vitest', BLACK)).snapshots.Button;
      expect(changed).toMatchObject({ status: 'pending', baselineId: legacy.id });

      // … and once accepted, the suite's own baseline wins
      await admin.review(changed.id, 'approved');
      expect((await run('vitest', BLACK)).snapshots.Button).toMatchObject({
        status: 'unchanged',
        baselineId: changed.id,
      });
      expect((await run(undefined, WHITE)).snapshots.Button.status).toBe('unchanged');
    });
  });

  describe('merging runs without visual changes', () => {
    it('merges a clean run into the previous clean run of the branch', async () => {
      const first = await adapter.fullRun({ Button: WHITE }, 'main', 'commit1');
      const second = await adapter.fullRun({ Button: WHITE }, 'main', 'commit2');

      expect(second.completed).toMatchObject({
        id: first.runId,
        runCount: 2,
        commitSha: 'commit1',
        lastCommitSha: 'commit2',
      });
      expect(new Date(second.completed.updatedAt).getTime()).toBeGreaterThan(
        new Date(second.completed.createdAt).getTime(),
      );
      expect((await admin.run(second.runId)).status).toBe(404);
      expect((await admin.runs('shop')).body).toHaveLength(1);
    });

    it('keeps merging consecutive clean runs', async () => {
      const first = await adapter.fullRun({ Button: WHITE });
      await adapter.fullRun({ Button: WHITE });
      const third = await adapter.fullRun({ Button: WHITE });

      expect(third.completed).toMatchObject({ id: first.runId, runCount: 3 });
    });

    it('keeps runs with visual changes', async () => {
      await adapter.fullRun({ Button: WHITE });
      const changed = await adapter.fullRun({ Button: BLACK });

      expect(changed.completed).toMatchObject({ id: changed.runId, runCount: 1 });
      expect((await admin.runs('shop')).body).toHaveLength(2);
    });

    it('never merges into a run with changes — not even after review', async () => {
      await adapter.fullRun({ Button: WHITE });
      const changed = await adapter.fullRun({ Button: BLACK });
      await admin.review(changed.snapshots.Button.id, 'approved');

      const clean = await adapter.fullRun({ Button: BLACK });
      expect(clean.completed).toMatchObject({ id: clean.runId, runCount: 1 });

      const nextClean = await adapter.fullRun({ Button: BLACK });
      expect(nextClean.completed).toMatchObject({ id: clean.runId, runCount: 2 });
    });

    it('keeps runs that add new snapshots', async () => {
      await adapter.fullRun({ Button: WHITE });
      const added = await adapter.fullRun({ Button: WHITE, Card: WHITE });
      expect(added.completed.id).toBe(added.runId);
    });

    it('does not merge across branches', async () => {
      await adapter.fullRun({ Button: WHITE }, 'main');
      const feature = await adapter.fullRun({ Button: WHITE }, 'feature');
      expect(feature.completed.id).toBe(feature.runId);
    });

    it('does not merge into a run that is still running', async () => {
      const open = (await adapter.startRun()).body;
      await adapter.submit(open.id, 'Button', WHITE);

      const clean = await adapter.fullRun({ Button: WHITE });
      expect(clean.completed.id).toBe(clean.runId);
    });

    it('keeps empty runs', async () => {
      await adapter.fullRun({ Button: WHITE });
      const empty = await adapter.fullRun({});
      expect(empty.completed).toMatchObject({ id: empty.runId, status: 'complete' });
    });
  });
});
