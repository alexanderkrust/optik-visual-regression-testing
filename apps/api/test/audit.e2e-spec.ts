import { LICENSE_KEYS } from '../src/license/public-keys';
import { LicenseService } from '../src/license/license.service';
import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';
import { testLicenseKey } from './license-keys';

describe('audit log (Enterprise)', () => {
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
  });

  const enterprise = () =>
    call(`${t.api}/license`, { method: 'PUT', token: admin.jwt, json: { key: key.license() } });
  const events = async (query = '', token = admin.jwt) => {
    const res = await call(`${t.api}/audit-events${query}`, { token });
    if (res.status !== 200) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
    return res.body.events as any[];
  };
  const actions = async (query = '') => (await events(query)).map((e) => e.action).reverse();

  it('needs the Enterprise edition, and records nothing without it', async () => {
    await admin.createProject('shop');
    expect((await call(`${t.api}/audit-events`, { token: admin.jwt })).status).toBe(403);

    await enterprise();
    await call(`${t.api}/license`, {
      method: 'PUT',
      token: admin.jwt,
      json: { key: key.license({ edition: 'team' }) },
    });
    expect((await call(`${t.api}/audit-events`, { token: admin.jwt })).status).toBe(403);
    await enterprise();
    expect(await actions()).toEqual(['license.installed', 'license.installed']);
  });

  it('records who did what, from where', async () => {
    await enterprise();
    const project = await admin.createProject('shop');
    const adapter = new AdapterClient(t.api, await admin.createToken('shop'));
    await adapter.fullRun({ Button: png(255) });
    const { snapshots } = await adapter.fullRun({ Button: png(0) });
    await call(`${t.api}/snapshots/${snapshots.Button.id}/status`, {
      method: 'PATCH',
      token: admin.jwt,
      json: { status: 'approved' },
      headers: { 'X-Forwarded-For': '203.0.113.7', 'User-Agent': 'Firefox/140' },
    });

    const [approved] = await events('?action=snapshot.approved');
    expect(approved).toMatchObject({
      action: 'snapshot.approved',
      actor: { type: 'user', label: 'admin@optik.test' },
      project: { id: project.id, slug: 'shop' },
      target: { type: 'snapshot', id: snapshots.Button.id, label: 'Button' },
      details: { branch: 'main', previousStatus: 'pending', diffScore: 1 },
      ip: '203.0.113.7',
      userAgent: 'Firefox/140',
    });
    expect(await actions()).toEqual(['license.installed', 'project.created', 'token.created', 'snapshot.approved']);
  });

  it('records sign-ins and failed attempts', async () => {
    await enterprise();
    await call(`${t.api}/auth/login`, { json: { email: 'admin@optik.test', password: 'wrong' } });
    await call(`${t.api}/auth/login`, { json: { email: 'nobody@optik.test', password: 'wrong' } });
    await call(`${t.api}/auth/login`, { json: { email: 'admin@optik.test', password: 'correct-horse' } });

    const recorded = (await events('?action=auth.')).reverse();
    expect(recorded.map((e) => [e.action, e.actor.label, e.details.reason])).toEqual([
      ['auth.login_failed', 'admin@optik.test', 'wrong_password'],
      ['auth.login_failed', 'nobody@optik.test', 'unknown_user'],
      ['auth.login', 'admin@optik.test', undefined],
    ]);
  });

  it('records permissions, settings and tokens — never secrets', async () => {
    await enterprise();
    await admin.createProject('shop');
    const member = await admin.inviteUser('m@optik.test', { projectSlug: 'shop', projectRole: 'viewer' });
    const userId = (await call(`${t.api}/auth/me`, { token: member.jwt })).body.id;
    const members = `${t.api}/projects/shop/members`;
    await call(members, { method: 'PUT', token: admin.jwt, json: { email: 'm@optik.test', role: 'reviewer' } });
    await call(`${members}/${userId}`, { method: 'DELETE', token: admin.jwt });
    await call(`${t.api}/users/${userId}`, { method: 'PATCH', token: admin.jwt, json: { role: 'admin' } });
    await call(`${t.api}/projects/shop`, {
      method: 'PATCH',
      token: admin.jwt,
      json: { ciProvider: 'github', ciRepository: 'acme/shop', ciToken: 'ghp_topsecret' },
    });
    const tokens = `${t.api}/projects/shop/tokens`;
    const token = (await call(tokens, { token: admin.jwt, json: { name: 'ci' } })).body;
    await call(`${tokens}/${token.id}`, { method: 'DELETE', token: admin.jwt });

    const all = await events();
    expect(all.map((e) => e.action).reverse()).toEqual([
      'license.installed',
      'project.created',
      'invitation.created',
      'invitation.accepted',
      'member.role_changed',
      'member.removed',
      'user.role_changed',
      'project.updated',
      'token.created',
      'token.revoked',
    ]);
    expect(all.find((e) => e.action === 'project.updated').details.changes).toEqual({
      ciProvider: { from: null, to: 'github' },
      ciRepository: { from: null, to: 'acme/shop' },
      ciToken: 'set',
    });
    expect(all.find((e) => e.action === 'invitation.accepted').actor.label).toBe('m@optik.test');
    expect(JSON.stringify(all)).not.toContain('ghp_topsecret');
    expect(JSON.stringify(all)).not.toContain(token.token);
  });

  it('searches, filters and pages', async () => {
    await enterprise();
    for (const slug of ['shop', 'blog', 'docs']) await admin.createProject(slug);
    expect((await events('?project=blog')).map((e) => e.project.slug)).toEqual(['blog']);
    expect((await events('?q=DOCS')).map((e) => e.target.label)).toEqual(['docs']);
    expect(await events('?from=2000-01-01&to=2000-01-02')).toEqual([]);

    const first = await call(`${t.api}/audit-events?limit=2`, { token: admin.jwt });
    expect(first.body.events).toHaveLength(2);
    const second = await call(`${t.api}/audit-events?limit=2&before=${first.body.nextCursor}`, { token: admin.jwt });
    expect(second.body.events.map((e: any) => e.action)).toEqual(['project.created', 'license.installed']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('shows maintainers the events of their project only', async () => {
    await enterprise();
    await admin.createProject('shop');
    await admin.createProject('blog');
    const maintainer = await admin.inviteUser('m@optik.test', { projectSlug: 'shop', projectRole: 'maintainer' });
    expect((await events('?project=shop', maintainer.jwt)).length).toBeGreaterThan(0);
    expect((await call(`${t.api}/audit-events`, { token: maintainer.jwt })).status).toBe(403);
    expect((await call(`${t.api}/audit-events?project=blog`, { token: maintainer.jwt })).status).toBe(404);
    expect((await call(`${t.api}/audit-events/verify`, { token: maintainer.jwt })).status).toBe(403);
  });

  it('exports CSV and JSON Lines, with spreadsheet formulas defused', async () => {
    await enterprise();
    await admin.createProject('shop');
    await call(`${t.api}/projects/shop/tokens`, { token: admin.jwt, json: { name: '=HYPERLINK("x")' } });

    const csv = await call(`${t.api}/audit-events/export?format=csv`, { token: admin.jwt });
    expect(csv.headers.get('content-disposition')).toMatch(/attachment; filename="optik-audit-.*\.csv"/);
    const lines = (csv.body as string).trim().split('\n');
    expect(lines[0]).toBe('seq,created_at,action,actor_type,actor_id,actor,project,target_type,target_id,target,details,ip,user_agent');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain(`"'=HYPERLINK(""x"")"`);

    const jsonl = await call(`${t.api}/audit-events/export?format=jsonl&action=token.`, { token: admin.jwt });
    const exported = (jsonl.body as string).trim().split('\n').map((l) => JSON.parse(l));
    expect(exported.map((e) => e.action)).toEqual(['token.created']);
  });

  it('cannot be changed, and detects changes made around the trigger', async () => {
    await enterprise();
    await admin.createProject('shop');
    await admin.createProject('blog');
    expect((await call(`${t.api}/audit-events/verify`, { token: admin.jwt })).body).toEqual({
      valid: true,
      checked: 3,
      firstInvalidSeq: null,
    });

    await expect(t.prisma.$executeRawUnsafe(`UPDATE audit_events SET actor_label = 'someone else'`)).rejects.toThrow(
      /cannot be changed or deleted/,
    );
    await expect(t.prisma.$executeRawUnsafe(`DELETE FROM audit_events`)).rejects.toThrow(/cannot be changed/);

    // A database owner can switch the trigger off — the hash chain still notices
    const [, second] = (await events()).reverse();
    await t.prisma.$executeRawUnsafe(`ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only`);
    await t.prisma.$executeRawUnsafe(`UPDATE audit_events SET target_label = 'tampered' WHERE seq = ${second.seq}`);
    await t.prisma.$executeRawUnsafe(`ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only`);
    expect((await call(`${t.api}/audit-events/verify`, { token: admin.jwt })).body).toEqual({
      valid: false,
      checked: 1,
      firstInvalidSeq: second.seq,
    });
  });
});
