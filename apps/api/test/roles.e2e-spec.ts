import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';

describe('users, roles and invitations', () => {
  let t: TestApp;
  let admin: AdminClient;
  /** A run in "shop" with one change to review, and one in "blog" */
  let shopRun: string;
  let shopChange: string;
  let blogRun: string;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    admin = await AdminClient.setup(t.api);
    await admin.createProject('shop');
    await admin.createProject('blog');

    const shop = new AdapterClient(t.api, await admin.createToken('shop'));
    await shop.fullRun({ Button: png(255) });
    const changed = await shop.fullRun({ Button: png(0) });
    shopRun = changed.runId;
    shopChange = changed.snapshots.Button.id;
    blogRun = (await new AdapterClient(t.api, await admin.createToken('blog')).fullRun({ Card: png(0) })).runId;
  });

  const get = (client: AdminClient, path: string) => call(`${t.api}${path}`, { token: client.jwt });

  describe('invitations', () => {
    it('lets an invited person set a password and sign in — once', async () => {
      const invite = await call(`${t.api}/invitations`, {
        token: admin.jwt,
        json: { email: 'Viewer@Example.com', projectSlug: 'shop', projectRole: 'viewer' },
      });
      expect(invite.status).toBe(201);
      expect(invite.body).toMatchObject({ email: 'viewer@example.com', projectSlug: 'shop', projectRole: 'viewer' });
      const token = invite.body.invitePath.split('/').pop();

      expect((await call(`${t.api}/invitations/token/${token}`)).body.email).toBe('viewer@example.com');
      expect((await get(admin, '/invitations')).body).toHaveLength(1);

      const accepted = await call(`${t.api}/invitations/token/${token}/accept`, { json: { password: 'correct-horse' } });
      expect(accepted.status).toBe(201);
      expect(accepted.body.user).toMatchObject({ email: 'viewer@example.com', role: 'member' });

      expect((await call(`${t.api}/invitations/token/${token}/accept`, { json: { password: 'correct-horse' } })).status).toBe(404);
      expect((await get(admin, '/invitations')).body).toHaveLength(0);
      const login = await call(`${t.api}/auth/login`, { json: { email: 'viewer@example.com', password: 'correct-horse' } });
      expect(login.status).toBe(200);
    });

    it('validates invitations', async () => {
      const invite = (json: object) => call(`${t.api}/invitations`, { token: admin.jwt, json });
      expect((await invite({ email: 'admin@optik.test' })).status).toBe(409);
      expect((await invite({ email: 'no-email' })).status).toBe(400);
      expect((await invite({ email: 'x@y.z', projectSlug: 'nope' })).status).toBe(404);
      expect((await invite({ email: 'x@y.z', role: 'owner' })).status).toBe(400);
      expect((await invite({ email: 'x@y.z', projectSlug: 'shop', projectRole: 'owner' })).status).toBe(400);

      const pending = (await invite({ email: 'x@y.z' })).body;
      const token = pending.invitePath.split('/').pop();
      const short = await call(`${t.api}/invitations/token/${token}/accept`, { json: { password: 'short' } });
      expect(short.status).toBe(400);
      await call(`${t.api}/invitations/${pending.id}`, { method: 'DELETE', token: admin.jwt });
      expect((await call(`${t.api}/invitations/token/${token}`)).status).toBe(404);
    });

    it('can only be sent by admins', async () => {
      const member = await admin.inviteUser('m@optik.test', { projectSlug: 'shop', projectRole: 'maintainer' });
      expect((await call(`${t.api}/invitations`, { token: member.jwt, json: { email: 'x@y.z' } })).status).toBe(403);
    });
  });

  describe('project visibility', () => {
    it('shows members only their projects and hides the others', async () => {
      const viewer = await admin.inviteUser('v@optik.test', { projectSlug: 'shop', projectRole: 'viewer' });

      const projects = await get(viewer, '/projects');
      expect(projects.body.map((p: any) => [p.slug, p.myRole])).toEqual([['shop', 'viewer']]);
      expect((await get(admin, '/projects')).body.map((p: any) => p.myRole)).toEqual(['admin', 'admin']);

      for (const path of ['/projects/blog', '/runs?project=blog', `/runs/${blogRun}`, `/snapshots?runId=${blogRun}`]) {
        expect([path, (await get(viewer, path)).status]).toEqual([path, 404]);
      }
    });

    it('lets members see runs, snapshots and images of their projects', async () => {
      const viewer = await admin.inviteUser('v@optik.test', { projectSlug: 'shop', projectRole: 'viewer' });
      expect((await get(viewer, `/runs?project=shop`)).body).toHaveLength(2);
      expect((await get(viewer, `/snapshots?runId=${shopRun}`)).status).toBe(200);
      expect((await get(viewer, `/snapshots/${shopChange}/image`)).status).toBe(200);

      const [blogSnapshot] = (await get(admin, `/snapshots?runId=${blogRun}`)).body;
      expect((await get(viewer, `/snapshots/${blogSnapshot.id}/image`)).status).toBe(404);
    });

    it('lets only admins create projects', async () => {
      const member = await admin.inviteUser('m@optik.test');
      const res = await call(`${t.api}/projects`, { token: member.jwt, json: { name: 'x', slug: 'x' } });
      expect(res.status).toBe(403);
      expect((await get(member, '/projects')).body).toEqual([]);
    });
  });

  describe('project roles', () => {
    it('viewers cannot review, reviewers can — and are recorded', async () => {
      const viewer = await admin.inviteUser('v@optik.test', { projectSlug: 'shop', projectRole: 'viewer' });
      const reviewer = await admin.inviteUser('r@optik.test', { projectSlug: 'shop', projectRole: 'reviewer' });

      expect((await viewer.review(shopChange, 'approved')).status).toBe(403);
      const reviewed = await reviewer.review(shopChange, 'approved');
      expect(reviewed.status).toBe(200);
      expect(reviewed.body).toMatchObject({ reviewedBy: 'r@optik.test', reviewedAt: expect.any(String) });

      const [listed] = (await get(viewer, `/snapshots?runId=${shopRun}`)).body;
      expect(listed.reviewedBy).toBe('r@optik.test');
    });

    it('only maintainers manage tokens, settings and members', async () => {
      const reviewer = await admin.inviteUser('r@optik.test', { projectSlug: 'shop', projectRole: 'reviewer' });
      const maintainer = await admin.inviteUser('m@optik.test', { projectSlug: 'shop', projectRole: 'maintainer' });
      const settings = { defaultBranch: 'develop' };

      for (const client of [reviewer, maintainer]) {
        const expected = client === maintainer ? [200, 200, 201, 200] : [403, 403, 403, 403];
        expect([
          (await get(client, '/projects/shop/tokens')).status,
          (await call(`${t.api}/projects/shop`, { method: 'PATCH', token: client.jwt, json: settings })).status,
          (await call(`${t.api}/projects/shop/tokens`, { token: client.jwt, json: { name: 'ci' } })).status,
          (await get(client, '/projects/shop/members')).status,
        ]).toEqual(expected);
      }
    });

    it('maintainers add existing users, change their role and remove them', async () => {
      const maintainer = await admin.inviteUser('m@optik.test', { projectSlug: 'shop', projectRole: 'maintainer' });
      const other = await admin.inviteUser('o@optik.test');
      const member = (json: object) =>
        call(`${t.api}/projects/shop/members`, { method: 'PUT', token: maintainer.jwt, json });

      expect((await member({ email: 'unknown@optik.test', role: 'viewer' })).status).toBe(404);
      expect((await member({ email: 'o@optik.test', role: 'boss' })).status).toBe(400);
      const added = await member({ email: 'o@optik.test', role: 'viewer' });
      expect(added.body).toMatchObject({ email: 'o@optik.test', role: 'viewer' });
      expect((await get(other, '/projects/shop')).body.myRole).toBe('viewer');

      await member({ email: 'o@optik.test', role: 'reviewer' });
      expect((await get(other, '/projects/shop')).body.myRole).toBe('reviewer');

      const members = (await get(maintainer, '/projects/shop/members')).body;
      expect(members.map((m: any) => [m.email, m.role])).toEqual([
        ['m@optik.test', 'maintainer'],
        ['o@optik.test', 'reviewer'],
      ]);

      await call(`${t.api}/projects/shop/members/${added.body.userId}`, { method: 'DELETE', token: maintainer.jwt });
      expect((await get(other, '/projects/shop')).status).toBe(404);
    });
  });

  describe('user management', () => {
    it('applies role changes and removals immediately, without signing in again', async () => {
      const reviewer = await admin.inviteUser('r@optik.test', { projectSlug: 'shop', projectRole: 'reviewer' });
      const users = (await get(admin, '/users')).body;
      const id = users.find((u: any) => u.email === 'r@optik.test').id;

      await call(`${t.api}/users/${id}`, { method: 'PATCH', token: admin.jwt, json: { role: 'admin' } });
      expect((await get(reviewer, '/projects')).body).toHaveLength(2);

      await call(`${t.api}/users/${id}`, { method: 'DELETE', token: admin.jwt });
      expect((await get(reviewer, '/projects')).status).toBe(401);
    });

    it('keeps at least one admin and doesn’t let admins remove themselves', async () => {
      const [self] = (await get(admin, '/users')).body;
      expect((await call(`${t.api}/users/${self.id}`, { method: 'PATCH', token: admin.jwt, json: { role: 'member' } })).status).toBe(400);
      expect((await call(`${t.api}/users/${self.id}`, { method: 'DELETE', token: admin.jwt })).status).toBe(400);
    });

    it('is only for admins', async () => {
      const member = await admin.inviteUser('m@optik.test');
      expect((await get(member, '/users')).status).toBe(403);
      expect((await get(member, '/auth/me')).body).toMatchObject({ email: 'm@optik.test', role: 'member' });
    });
  });
});
