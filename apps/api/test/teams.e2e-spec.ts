import { LICENSE_KEYS } from '../src/license/public-keys';
import { LicenseService } from '../src/license/license.service';
import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';
import { testLicenseKey } from './license-keys';

describe('teams (Enterprise)', () => {
  const key = testLicenseKey();
  let t: TestApp;
  let admin: AdminClient;

  beforeAll(async () => {
    t = await startApp((b) => b.overrideProvider(LICENSE_KEYS).useValue(key.publicKeys));
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.app.get(LicenseService).clearCache();
    admin = await AdminClient.setup(t.api);
    await call(`${t.api}/license`, { method: 'PUT', token: admin.jwt, json: { key: key.license() } });
    await admin.createProject('shop');
    await admin.createProject('blog');
  });

  const createTeam = async (name: string) => (await call(`${t.api}/teams`, { token: admin.jwt, json: { name } })).body;
  const addMember = (id: string, email: string) =>
    call(`${t.api}/teams/${id}/members`, { token: admin.jwt, json: { email } });
  const setRole = (id: string, slug: string, role: string | null) =>
    call(`${t.api}/teams/${id}/projects/${slug}`, { method: 'PUT', token: admin.jwt, json: { role } });
  const myRole = async (token: string, slug: string) => (await call(`${t.api}/projects/${slug}`, { token })).body.myRole;

  it('gives members the team\'s roles in projects', async () => {
    const dev = await admin.inviteUser('dev@optik.test');
    expect((await call(`${t.api}/projects`, { token: dev.jwt })).body).toEqual([]);

    const team = await createTeam('Frontend');
    await addMember(team.id, 'dev@optik.test');
    const res = await setRole(team.id, 'shop', 'reviewer');
    expect(res.body).toMatchObject({
      name: 'Frontend',
      members: [{ email: 'dev@optik.test' }],
      projects: [{ slug: 'shop', role: 'reviewer' }],
    });

    expect((await call(`${t.api}/projects`, { token: dev.jwt })).body.map((p: any) => p.slug)).toEqual(['shop']);
    expect(await myRole(dev.jwt, 'shop')).toBe('reviewer');
    expect((await call(`${t.api}/projects/blog`, { token: dev.jwt })).status).toBe(404);

    // Reviewers through a team can review
    const adapter = new AdapterClient(t.api, await admin.createToken('shop'));
    await adapter.fullRun({ Button: png(255) });
    const { snapshots } = await adapter.fullRun({ Button: png(0) });
    const review = await call(`${t.api}/snapshots/${snapshots.Button.id}/status`, {
      method: 'PATCH',
      token: dev.jwt,
      json: { status: 'approved' },
    });
    expect(review.status).toBe(200);
  });

  it('uses the highest of a user\'s own and their teams\' roles', async () => {
    const dev = await admin.inviteUser('dev@optik.test', { projectSlug: 'shop', projectRole: 'viewer' });
    const leads = await createTeam('Leads');
    await addMember(leads.id, 'dev@optik.test');
    await setRole(leads.id, 'shop', 'maintainer');
    expect(await myRole(dev.jwt, 'shop')).toBe('maintainer');

    await setRole(leads.id, 'shop', null);
    expect(await myRole(dev.jwt, 'shop')).toBe('viewer');
  });

  it('takes the access away with the membership or the team', async () => {
    const dev = await admin.inviteUser('dev@optik.test');
    const devId = (await call(`${t.api}/auth/me`, { token: dev.jwt })).body.id;
    const team = await createTeam('Frontend');
    await addMember(team.id, 'dev@optik.test');
    await setRole(team.id, 'shop', 'viewer');

    await call(`${t.api}/teams/${team.id}/members/${devId}`, { method: 'DELETE', token: admin.jwt });
    expect((await call(`${t.api}/projects/shop`, { token: dev.jwt })).status).toBe(404);

    await addMember(team.id, 'dev@optik.test');
    await call(`${t.api}/teams/${team.id}`, { method: 'DELETE', token: admin.jwt });
    expect((await call(`${t.api}/projects/shop`, { token: dev.jwt })).status).toBe(404);
  });

  it('counts reviewers from teams, and keeps team access without the license', async () => {
    await admin.inviteUser('a@optik.test');
    await admin.inviteUser('b@optik.test');
    const viewers = await createTeam('Viewers');
    const reviewers = await createTeam('Reviewers');
    await addMember(viewers.id, 'a@optik.test');
    await addMember(reviewers.id, 'b@optik.test');
    await setRole(viewers.id, 'shop', 'viewer');
    await setRole(reviewers.id, 'shop', 'reviewer');
    expect((await call(`${t.api}/license`, { token: admin.jwt })).body.reviewers).toBe(2);

    await call(`${t.api}/license`, { method: 'DELETE', token: admin.jwt });
    const b = await call(`${t.api}/auth/login`, { json: { email: 'b@optik.test', password: 'correct-horse' } });
    expect(await myRole(b.body.accessToken, 'shop')).toBe('reviewer');
    expect((await call(`${t.api}/teams`, { token: admin.jwt })).status).toBe(403);
  });

  it('shows maintainers which teams have access to their project', async () => {
    const maintainer = await admin.inviteUser('m@optik.test', { projectSlug: 'shop', projectRole: 'maintainer' });
    const team = await createTeam('Frontend');
    await addMember(team.id, 'm@optik.test');
    await setRole(team.id, 'shop', 'reviewer');
    expect((await call(`${t.api}/projects/shop/teams`, { token: maintainer.jwt })).body).toEqual([
      { teamId: team.id, name: 'Frontend', role: 'reviewer', members: 1 },
    ]);
    expect((await call(`${t.api}/teams`, { token: maintainer.jwt })).status).toBe(403);
  });

  it('validates and records changes', async () => {
    expect((await call(`${t.api}/teams`, { token: admin.jwt, json: { name: ' ' } })).status).toBe(400);
    const team = await createTeam('Frontend');
    expect((await call(`${t.api}/teams`, { token: admin.jwt, json: { name: 'Frontend' } })).status).toBe(409);
    expect((await addMember(team.id, 'nobody@optik.test')).status).toBe(404);
    expect((await setRole(team.id, 'nope', 'viewer')).status).toBe(404);
    expect((await setRole(team.id, 'shop', 'owner')).status).toBe(400);

    await setRole(team.id, 'shop', 'viewer');
    const events = (await call(`${t.api}/audit-events?action=team.`, { token: admin.jwt })).body.events;
    expect(events.map((e: any) => e.action).reverse()).toEqual(['team.created', 'team.project_role_changed']);
  });
});
