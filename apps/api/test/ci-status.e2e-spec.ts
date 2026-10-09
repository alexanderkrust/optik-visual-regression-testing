import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';
import { FakeCi } from './fake-ci';

const WHITE = png(255);
const BLACK = png(0);
const sha = (n: number) => n.toString(16).padStart(40, '0');

describe('commit statuses', () => {
  let t: TestApp;
  let ci: FakeCi;
  let ciUrl: string;
  let admin: AdminClient;
  let adapter: AdapterClient;

  beforeAll(async () => {
    t = await startApp();
    ci = new FakeCi();
    ciUrl = await ci.start();
  });
  afterAll(async () => {
    await t.app.close();
    await ci.stop();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ci.reset();
    admin = await AdminClient.setup(t.api);
    await admin.createProject('shop');
    adapter = new AdapterClient(t.api, await admin.createToken('shop'));
  });

  const configure = (settings: Record<string, unknown>) =>
    call(`${t.api}/projects/shop`, { method: 'PATCH', token: admin.jwt, json: settings });
  const connect = () =>
    configure({ ciProvider: 'github', ciRepository: 'acme/shop', ciApiUrl: ciUrl, ciToken: 'ghp_secret' });

  /** GitHub status calls for a commit, as GitHub would read them. */
  const github = {
    get calls() {
      return ci.calls;
    },
    forCommit: (commit: string) =>
      ci.matching(`/statuses/${commit}`).map((c) => ({
        ...c.body,
        repo: c.path.split('/').slice(2, 4).join('/'),
        authorization: c.headers.authorization,
      })),
  };

  /** A run like an adapter does it, including the optik URL it uses. */
  async function run(
    commit: string,
    image: Buffer,
    { complete = true, serverUrl = 'https://optik.example.com/', pullRequest = undefined as string | undefined } = {},
  ) {
    const started = await call(`${t.api}/runs`, {
      token: (adapter as any).token,
      json: { branch: 'main', commitSha: commit, suite: 'vitest', ancestors: [commit], serverUrl, pullRequest },
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
    expect(github.forCommit(sha(1))[1]).toMatchObject({
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
    ci.respondWith = 500;
    const { snapshot, completed } = await run(sha(1), WHITE);
    expect(snapshot.status).toBe('new');
    expect(completed.status).toBe('complete');
    expect(github.calls.length).toBeGreaterThan(0);
  });

  describe('GitLab', () => {
    it('reports to the project path with a private token', async () => {
      await configure({
        ciProvider: 'gitlab',
        ciRepository: 'acme/web/shop',
        ciApiUrl: `${ciUrl}/api/v4`,
        ciToken: 'glpat-secret',
      });
      await run(sha(1), WHITE);
      const { runId } = await run(sha(2), BLACK);

      const calls = ci.matching(sha(2));
      expect(calls.map((c) => c.path)).toEqual([
        `/api/v4/projects/acme%2Fweb%2Fshop/statuses/${sha(2)}`,
        `/api/v4/projects/acme%2Fweb%2Fshop/statuses/${sha(2)}`,
      ]);
      expect(calls[0].headers['private-token']).toBe('glpat-secret');
      expect(calls.map((c) => c.body.state)).toEqual(['running', 'failed']);
      expect(calls[1].body).toEqual({
        state: 'failed',
        name: 'optik/vitest',
        description: '1 visual change to review',
        target_url: `https://optik.example.com/shop/${runId}`,
      });
    });

    it('accepts a numeric project ID', async () => {
      const res = await configure({ ciProvider: 'gitlab', ciRepository: '4711', ciToken: 'glpat-secret' });
      expect(res.status).toBe(200);
    });
  });

  describe('Bitbucket', () => {
    it('reports build statuses to Bitbucket Cloud', async () => {
      await configure({ ciProvider: 'bitbucket', ciRepository: 'acme/shop', ciApiUrl: `${ciUrl}/2.0`, ciToken: 'repo-token' });
      const { runId } = await run(sha(1), WHITE);

      const calls = ci.matching(sha(1));
      expect(calls[0].path).toBe(`/2.0/repositories/acme/shop/commit/${sha(1)}/statuses/build`);
      expect(calls[0].headers.authorization).toBe('Bearer repo-token');
      expect(calls.map((c) => c.body.state)).toEqual(['INPROGRESS', 'SUCCESSFUL']);
      expect(calls[1].body).toEqual({
        key: 'optik-vitest',
        name: 'optik/vitest',
        state: 'SUCCESSFUL',
        description: '1 new snapshot',
        url: `https://optik.example.com/shop/${runId}`,
      });
    });

    it('uses basic auth for "username:token"', async () => {
      await configure({ ciProvider: 'bitbucket', ciRepository: 'acme/shop', ciApiUrl: ciUrl, ciToken: 'jane@acme.com:api-token' });
      await run(sha(1), WHITE);
      expect(ci.calls[0].headers.authorization).toBe(
        `Basic ${Buffer.from('jane@acme.com:api-token').toString('base64')}`,
      );
    });

    it('reports to Bitbucket Data Center', async () => {
      await configure({ ciProvider: 'bitbucket_server', ciRepository: 'SHOP/web', ciApiUrl: ciUrl, ciToken: 'http-token' });
      await run(sha(1), BLACK);
      expect(ci.calls[0].path).toBe(`/rest/api/latest/projects/SHOP/repos/web/commits/${sha(1)}/builds`);
      expect(ci.calls[0].headers.authorization).toBe('Bearer http-token');
      expect(ci.calls.at(-1)!.body).toMatchObject({ key: 'optik-vitest', state: 'SUCCESSFUL' });
    });

    it('skips statuses without a link to optik, which Bitbucket requires', async () => {
      await configure({ ciProvider: 'bitbucket', ciRepository: 'acme/shop', ciApiUrl: ciUrl, ciToken: 'repo-token' });
      await run(sha(1), WHITE, { serverUrl: '' });
      expect(ci.calls).toHaveLength(0);
    });
  });

  describe('Azure DevOps', () => {
    const azure = () =>
      configure({ ciProvider: 'azure_devops', ciRepository: 'My Shop/web', ciApiUrl: `${ciUrl}/acme`, ciToken: 'pat' });

    it('reports commit statuses with a personal access token', async () => {
      await azure();
      const { runId } = await run(sha(1), WHITE);
      const calls = ci.matching(sha(1));
      expect(calls[0].path).toBe(
        `/acme/My%20Shop/_apis/git/repositories/web/commits/${sha(1)}/statuses?api-version=7.1`,
      );
      expect(calls[0].headers.authorization).toBe(`Basic ${Buffer.from(':pat').toString('base64')}`);
      expect(calls.map((c) => c.body.state)).toEqual(['pending', 'succeeded']);
      expect(calls[1].body).toEqual({
        state: 'succeeded',
        description: '1 new snapshot',
        context: { genre: 'optik', name: 'vitest' },
        targetUrl: `https://optik.example.com/shop/${runId}`,
      });
    });

    it('also reports on the pull request, for branch policies', async () => {
      await azure();
      await run(sha(1), WHITE);
      const { snapshot } = await run(sha(2), BLACK, { pullRequest: '42' });
      const onPullRequest = () => ci.matching('/pullRequests/42/statuses?api-version=7.1');
      expect(onPullRequest().map((c) => c.body.state)).toEqual(['pending', 'failed']);

      await admin.review(snapshot.id, 'approved');
      expect(onPullRequest().at(-1)!.body.state).toBe('succeeded');
    });
  });

  describe('settings', () => {
    it('stores the token encrypted and never returns it', async () => {
      const res = await connect();
      expect(res.body).toMatchObject({ ciProvider: 'github', ciRepository: 'acme/shop', ciTokenConfigured: true });
      expect(JSON.stringify(res.body)).not.toContain('ghp_secret');

      const row = await t.prisma.project.findUniqueOrThrow({ where: { slug: 'shop' } });
      expect(row.ciTokenEncrypted).not.toContain('ghp_secret');

      // Omitting the token keeps it, an empty string removes it
      expect((await configure({ ciRepository: 'acme/web' })).body.ciTokenConfigured).toBe(true);
      expect((await configure({ ciToken: '' })).body.ciTokenConfigured).toBe(false);
    });

    it('drops the token when provider or API URL change, so it never goes to another server', async () => {
      await connect();
      expect((await configure({ ciApiUrl: 'https://evil.example.com' })).body.ciTokenConfigured).toBe(false);

      await connect();
      const switched = await configure({ ciProvider: 'gitlab', ciRepository: 'acme/shop', ciApiUrl: '' });
      expect(switched.body).toMatchObject({ ciProvider: 'gitlab', ciTokenConfigured: false });

      // … unless a new token comes with the change
      const withToken = await configure({ ciProvider: 'github', ciApiUrl: ciUrl, ciToken: 'ghp_new' });
      expect(withToken.body.ciTokenConfigured).toBe(true);
    });

    it('turns commit statuses off', async () => {
      await connect();
      expect((await configure({ ciProvider: '' })).body).toMatchObject({
        ciProvider: null,
        ciRepository: null,
        ciApiUrl: null,
        ciTokenConfigured: false,
      });
    });

    it('validates provider, repository and API URL', async () => {
      const invalid = [
        { ciProvider: 'jenkins' },
        { ciRepository: 'acme/shop' }, // no provider
        { ciProvider: 'github', ciRepository: 'not a repo' },
        { ciProvider: 'gitlab', ciRepository: 'shop' },
        { ciProvider: 'bitbucket', ciRepository: 'acme/shop/web' },
        { ciProvider: 'azure_devops', ciRepository: 'web' },
        { ciProvider: 'azure_devops', ciRepository: 'Shop/web' }, // needs the organization URL
        { ciProvider: 'bitbucket_server', ciRepository: 'SHOP/web' }, // needs the server URL
        { ciProvider: 'github', ciApiUrl: 'ftp://github' },
        { failTestsOnChanges: 'no' },
      ];
      for (const settings of invalid) expect([settings, (await configure(settings)).status]).toEqual([settings, 400]);
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
