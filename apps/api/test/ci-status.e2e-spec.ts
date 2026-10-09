import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';
import { FakeGitHub } from './fake-github';

const WHITE = png(255);
const BLACK = png(0);
const sha = (n: number) => n.toString(16).padStart(40, '0');

describe('commit statuses (GitHub)', () => {
  let t: TestApp;
  let github: FakeGitHub;
  let githubUrl: string;
  let admin: AdminClient;
  let adapter: AdapterClient;

  beforeAll(async () => {
    t = await startApp();
    github = new FakeGitHub();
    githubUrl = await github.start();
  });
  afterAll(async () => {
    await t.app.close();
    await github.stop();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    github.calls.length = 0;
    github.respondWith = 201;
    admin = await AdminClient.setup(t.api);
    await admin.createProject('shop');
    adapter = new AdapterClient(t.api, await admin.createToken('shop'));
  });

  const configure = (settings: Record<string, unknown>) =>
    call(`${t.api}/projects/shop`, { method: 'PATCH', token: admin.jwt, json: settings });
  const connect = () =>
    configure({ githubRepo: 'acme/shop', githubApiUrl: githubUrl, githubToken: 'ghp_secret' });

  /** A run like an adapter does it, including the optik URL it uses. */
  async function run(commit: string, image: Buffer, { complete = true } = {}) {
    const started = await call(`${t.api}/runs`, {
      token: (adapter as any).token,
      json: { branch: 'main', commitSha: commit, suite: 'vitest', ancestors: [commit], serverUrl: 'https://optik.example.com/' },
    });
    const snapshot = (await adapter.submit(started.body.id, 'Button', image)).body;
    const completed = complete ? (await adapter.complete(started.body.id)).body : null;
    return { runId: started.body.id as string, snapshot, completed };
  }

  it('reports nothing without a GitHub configuration', async () => {
    await run(sha(1), WHITE);
    expect(github.calls).toHaveLength(0);
  });

  it('reports running, then the result with a link to the review', async () => {
    await connect();
    const { runId } = await run(sha(1), WHITE);

    expect(github.forCommit(sha(1))).toEqual([
      expect.objectContaining({ state: 'pending', description: 'Running visual tests…' }),
      expect.objectContaining({ state: 'success', description: '1 new snapshot' }),
    ]);
    expect(github.calls[1]).toMatchObject({
      repo: 'acme/shop',
      context: 'optik/vitest',
      authorization: 'Bearer ghp_secret',
      target_url: `https://optik.example.com/shop/${runId}`,
    });
  });

  it('turns green when the changes are accepted — without a new CI run', async () => {
    await connect();
    await run(sha(1), WHITE);
    const { snapshot } = await run(sha(2), BLACK);
    expect(github.forCommit(sha(2)).at(-1)).toMatchObject({
      state: 'failure',
      description: '1 visual change to review',
    });

    await admin.review(snapshot.id, 'approved');
    expect(github.forCommit(sha(2)).at(-1)).toMatchObject({
      state: 'success',
      description: '1 visual change accepted',
    });

    await admin.review(snapshot.id, 'rejected');
    expect(github.forCommit(sha(2)).at(-1)).toMatchObject({
      state: 'failure',
      description: '1 visual change rejected',
    });
  });

  it('reports a merged clean run as green on its own commit, linking to the run it was merged into', async () => {
    await connect();
    const first = await run(sha(1), WHITE);
    await run(sha(2), WHITE);

    expect(github.forCommit(sha(2)).at(-1)).toMatchObject({
      state: 'success',
      description: 'No visual changes',
      target_url: `https://optik.example.com/shop/${first.runId}`,
    });
  });

  it('skips commits that are not real SHAs', async () => {
    await connect();
    await run('unknown', WHITE);
    expect(github.calls).toHaveLength(0);
  });

  it('never fails a run because GitHub fails', async () => {
    await connect();
    github.respondWith = 500;
    const { snapshot, completed } = await run(sha(1), WHITE);
    expect(snapshot.status).toBe('new');
    expect(completed.status).toBe('complete');
    expect(github.calls.length).toBeGreaterThan(0);
  });

  describe('settings', () => {
    it('stores the token encrypted and never returns it', async () => {
      const res = await connect();
      expect(res.body).toMatchObject({ githubRepo: 'acme/shop', githubTokenConfigured: true });
      expect(JSON.stringify(res.body)).not.toContain('ghp_secret');

      const row = await t.prisma.project.findUniqueOrThrow({ where: { slug: 'shop' } });
      expect(row.githubTokenEncrypted).not.toContain('ghp_secret');

      // Omitting the token keeps it, an empty string removes it
      expect((await configure({ githubRepo: 'acme/web' })).body.githubTokenConfigured).toBe(true);
      expect((await configure({ githubToken: '' })).body.githubTokenConfigured).toBe(false);
    });

    it('validates repository and API URL', async () => {
      expect((await configure({ githubRepo: 'not a repo' })).status).toBe(400);
      expect((await configure({ githubApiUrl: 'ftp://github' })).status).toBe(400);
      expect((await configure({ failTestsOnChanges: 'no' })).status).toBe(400);
    });
  });

  describe('failing tests on changes', () => {
    it('tells adapters to fail by default, and not to when the project turns it off', async () => {
      await run(sha(1), WHITE);
      expect((await run(sha(2), BLACK, { complete: false })).snapshot).toMatchObject({
        status: 'pending',
        failTest: true,
      });

      await configure({ failTestsOnChanges: false });
      expect((await run(sha(3), BLACK, { complete: false })).snapshot).toMatchObject({
        status: 'pending',
        failTest: false,
      });
    });

    it('never fails tests for unchanged or new snapshots', async () => {
      expect((await run(sha(1), WHITE)).snapshot.failTest).toBe(false);
      expect((await run(sha(2), WHITE)).snapshot.failTest).toBe(false);
    });
  });
});
