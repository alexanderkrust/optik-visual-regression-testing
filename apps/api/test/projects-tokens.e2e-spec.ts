import {
  AdapterClient,
  AdminClient,
  call,
  png,
  resetDatabase,
  startApp,
  TestApp,
} from './helpers';

describe('projects and API tokens', () => {
  let t: TestApp;
  let admin: AdminClient;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    admin = await AdminClient.setup(t.api);
  });

  describe('projects', () => {
    it('creates and lists projects', async () => {
      await admin.createProject('shop');
      const res = await call(`${t.api}/projects`, { token: admin.jwt });
      expect(res.body).toEqual([expect.objectContaining({ name: 'shop', slug: 'shop' })]);
    });

    it('rejects a duplicate slug', async () => {
      await admin.createProject('shop');
      const res = await call(`${t.api}/projects`, {
        token: admin.jwt,
        json: { name: 'Shop 2', slug: 'shop' },
      });
      expect(res.status).toBe(409);
    });
  });

  describe('tokens', () => {
    beforeEach(() => admin.createProject('shop'));

    it('shows the token value only once, on creation', async () => {
      const token = await admin.createToken('shop');
      expect(token).toMatch(/^optik_[0-9a-f]{64}$/);

      const list = await call(`${t.api}/projects/shop/tokens`, { token: admin.jwt });
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).not.toHaveProperty('token');
    });

    it('stores only a hash of the token, plus a short prefix to recognise it', async () => {
      const token = await admin.createToken('shop');
      const [row] = await t.prisma.apiToken.findMany();
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.tokenHash).not.toContain(token.slice(6));
      expect(row.tokenPrefix).toBe(token.slice(0, 12));

      const list = await call(`${t.api}/projects/shop/tokens`, { token: admin.jwt });
      expect(list.body[0].prefix).toBe(token.slice(0, 12));
    });

    it('authenticates adapters', async () => {
      const adapter = new AdapterClient(t.api, await admin.createToken('shop'));
      expect((await adapter.startRun()).status).toBe(201);
    });

    it('rejects missing, unknown, revoked and expired tokens', async () => {
      expect((await call(`${t.api}/runs`, { json: {} })).status).toBe(401);
      expect((await new AdapterClient(t.api, 'optik_unknown').startRun()).status).toBe(401);

      const revoked = await admin.createToken('shop');
      const [{ id }] = (await call(`${t.api}/projects/shop/tokens`, { token: admin.jwt })).body;
      const del = await call(`${t.api}/projects/shop/tokens/${id}`, {
        method: 'DELETE',
        token: admin.jwt,
      });
      expect(del.status).toBe(204);
      expect((await new AdapterClient(t.api, revoked).startRun()).status).toBe(401);

      const expired = await admin.createToken('shop', '2020-01-01T00:00:00Z');
      expect((await new AdapterClient(t.api, expired).startRun()).status).toBe(401);
    });

    it('does not accept a JWT as adapter token or vice versa', async () => {
      const token = await admin.createToken('shop');
      expect((await new AdapterClient(t.api, admin.jwt).startRun()).status).toBe(401);
      expect((await call(`${t.api}/projects`, { token })).status).toBe(401);
    });

    it('creates runs in the token’s project', async () => {
      await admin.createProject('blog');
      const adapter = new AdapterClient(t.api, await admin.createToken('blog'));
      await adapter.startRun();

      expect((await admin.runs('blog')).body).toHaveLength(1);
      expect((await admin.runs('shop')).body).toHaveLength(0);
    });
  });

  describe('project isolation', () => {
    let shop: AdapterClient;
    let blog: AdapterClient;
    let shopRunId: string;

    beforeEach(async () => {
      await admin.createProject('shop');
      await admin.createProject('blog');
      shop = new AdapterClient(t.api, await admin.createToken('shop'));
      blog = new AdapterClient(t.api, await admin.createToken('blog'));
      shopRunId = (await shop.startRun()).body.id;
    });

    it('does not let a token submit snapshots to another project’s run', async () => {
      const res = await blog.submit(shopRunId, 'Button', png(255));
      expect(res.status).toBe(404);
      expect(await t.prisma.snapshot.count()).toBe(0);
    });

    it('does not let a token complete another project’s run', async () => {
      expect((await blog.complete(shopRunId)).status).toBe(404);
      expect((await admin.run(shopRunId)).body.status).toBe('running');
    });

    it('keeps baselines separate per project', async () => {
      await shop.fullRun({ Button: png(255) });
      const blogRun = await blog.fullRun({ Button: png(0) });
      expect(blogRun.snapshots.Button.status).toBe('new');
    });
  });
});
