import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';

const WHITE = png(255);
const BLACK = png(0);
const GRAY = png(128);

/**
 * A fake git history: `commit('m1', [])` creates a commit, the second argument
 * lists its parents. Runs send the commit and all its ancestors, like the
 * adapters do with `git rev-list HEAD`.
 */
class History {
  private readonly parents = new Map<string, string[]>();
  private readonly shas = new Map<string, string>();
  private next = 1;

  commit(name: string, parents: string[] = []) {
    this.parents.set(name, parents);
    this.shas.set(name, (this.next++).toString(16).padStart(40, '0'));
    return name;
  }

  sha(name: string) {
    return this.shas.get(name)!;
  }

  /** The commit and its ancestors, newest first (like `git rev-list`). */
  ancestry(name: string): string[] {
    const seen: string[] = [];
    const visit = (n: string) => {
      if (seen.includes(n)) return;
      seen.push(n);
      this.parents.get(n)!.forEach(visit);
    };
    visit(name);
    return seen.map((n) => this.sha(n));
  }
}

describe('baselines per branch', () => {
  let t: TestApp;
  let admin: AdminClient;
  let adapter: AdapterClient;
  let git: History;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    admin = await AdminClient.setup(t.api);
    await admin.createProject('shop');
    adapter = new AdapterClient(t.api, await admin.createToken('shop'));
    git = new History();
  });

  /** One run with a "Button" snapshot on `branch` at `commit`. */
  async function run(branch: string, commit: string, image: Buffer, opts: { history?: boolean } = {}) {
    const ancestors = opts.history === false ? undefined : git.ancestry(commit);
    const sha = opts.history === false ? 'unknown' : git.sha(commit);
    const { id } = (await adapter.startRun(branch, sha, 'vitest', ancestors)).body;
    const snapshot = (await adapter.submit(id, 'Button', image)).body;
    await adapter.complete(id);
    return snapshot;
  }

  it('keeps an accepted change on its branch until it is merged', async () => {
    git.commit('m1');
    const base = await run('main', 'm1', WHITE);

    git.commit('f1', ['m1']);
    const change = await run('feature', 'f1', BLACK);
    expect(change).toMatchObject({ status: 'pending', baselineId: base.id });
    await admin.review(change.id, 'approved');

    // main doesn't see the feature branch's change …
    git.commit('m2', ['m1']);
    expect(await run('main', 'm2', WHITE)).toMatchObject({ status: 'unchanged', baselineId: base.id });

    // … the feature branch does
    git.commit('f2', ['f1']);
    expect(await run('feature', 'f2', BLACK)).toMatchObject({ status: 'unchanged', baselineId: change.id });
  });

  it('compares a branch against the state it was branched from, not later main changes', async () => {
    git.commit('m1');
    const base = await run('main', 'm1', WHITE);
    git.commit('f1', ['m1']);
    await run('feature', 'f1', WHITE);

    git.commit('m2', ['m1']);
    const mainChange = await run('main', 'm2', GRAY);
    await admin.review(mainChange.id, 'approved');

    git.commit('f2', ['f1']);
    expect(await run('feature', 'f2', WHITE)).toMatchObject({ status: 'unchanged', baselineId: base.id });
  });

  it('carries accepted changes over with a merge commit', async () => {
    git.commit('m1');
    await run('main', 'm1', WHITE);
    git.commit('f1', ['m1']);
    const change = await run('feature', 'f1', BLACK);
    await admin.review(change.id, 'approved');

    git.commit('merge', ['m1', 'f1']);
    expect(await run('main', 'merge', BLACK)).toMatchObject({ status: 'unchanged', baselineId: change.id });
  });

  describe('squash and rebase merges', () => {
    it('accepts an image automatically if exactly this image was already approved', async () => {
      git.commit('m1');
      await run('main', 'm1', WHITE);
      git.commit('f1', ['m1']);
      const change = await run('feature', 'f1', BLACK);
      await admin.review(change.id, 'approved');

      // The squash commit's history doesn't contain f1
      git.commit('squash', ['m1']);
      const squashed = await run('main', 'squash', BLACK);
      expect(squashed).toMatchObject({ status: 'approved', autoApprovedFromId: change.id });
      expect(squashed.diffUrl).not.toBeNull();

      // … and it is the baseline on main from now on
      git.commit('m3', ['squash']);
      expect(await run('main', 'm3', BLACK)).toMatchObject({ status: 'unchanged', baselineId: squashed.id });
    });

    it('does not accept images that were only rejected or not reviewed', async () => {
      git.commit('m1');
      await run('main', 'm1', WHITE);
      git.commit('f1', ['m1']);
      const pending = await run('feature', 'f1', BLACK);
      git.commit('f2', ['m1']);
      const rejected = await run('feature-2', 'f2', GRAY);
      await admin.review(rejected.id, 'rejected');

      git.commit('m2', ['m1']);
      expect((await run('main', 'm2', BLACK)).status).toBe('pending');
      git.commit('m3', ['m1']);
      expect((await run('main', 'm3', GRAY)).status).toBe('pending');
      expect(pending.status).toBe('pending');
    });
  });

  describe('without git history (shallow clones, older adapters)', () => {
    it('falls back to the same branch, then to the default branch', async () => {
      git.commit('m1');
      const base = await run('main', 'm1', WHITE);

      const first = await run('feature', 'f', BLACK, { history: false });
      expect(first).toMatchObject({ status: 'pending', baselineId: base.id });
      await admin.review(first.id, 'approved');

      expect(await run('feature', 'f', BLACK, { history: false })).toMatchObject({
        status: 'unchanged',
        baselineId: first.id,
      });
      expect(await run('other', 'f', WHITE, { history: false })).toMatchObject({
        status: 'unchanged',
        baselineId: base.id,
      });
    });

    it('uses the project’s configured default branch', async () => {
      const res = await call(`${t.api}/projects/shop`, {
        method: 'PATCH',
        token: admin.jwt,
        json: { defaultBranch: 'develop' },
      });
      expect(res.body.defaultBranch).toBe('develop');

      git.commit('d1');
      const develop = await run('develop', 'd1', GRAY);
      await run('main', 'd1', WHITE, { history: false });
      expect(await run('feature', 'f', GRAY, { history: false })).toMatchObject({
        status: 'unchanged',
        baselineId: develop.id,
      });
    });
  });

  describe('upgrading from runs without history', () => {
    it('uses the newest baseline of older runs on this, the default or an undetected branch', async () => {
      // Before the upgrade: no commits known, partly no branch detected
      await run('main', 'x', WHITE, { history: false });
      const newest = await run('unknown', 'x', GRAY, { history: false });
      expect(newest.status).toBe('pending');
      await admin.review(newest.id, 'approved');

      // After the upgrade, with history: nothing found via ancestry, but the
      // newest accepted legacy baseline is used — no false failures
      git.commit('m1');
      expect(await run('main', 'm1', GRAY)).toMatchObject({ status: 'unchanged', baselineId: newest.id });
    });

    it('does not let new runs of other branches leak in that way', async () => {
      git.commit('m1');
      await run('main', 'm1', WHITE);
      git.commit('f1', ['m1']);
      const change = await run('feature', 'f1', BLACK);
      await admin.review(change.id, 'approved');

      git.commit('m2', ['m1']);
      expect((await run('main', 'm2', WHITE)).status).toBe('unchanged');
    });
  });

  it('validates ancestors and the default branch', async () => {
    const bad = await adapter.startRun('main', 'abc1234', 'vitest', ['not-a-sha']);
    expect(bad.status).toBe(400);
    const tooMany = await adapter.startRun('main', 'abc1234', 'vitest', Array(1001).fill('abc1234'));
    expect(tooMany.status).toBe(400);

    const branch = await call(`${t.api}/projects/shop`, {
      method: 'PATCH',
      token: admin.jwt,
      json: { defaultBranch: 'has space' },
    });
    expect(branch.status).toBe(400);
  });
});
