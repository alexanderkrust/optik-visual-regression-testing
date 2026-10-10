import { LICENSE_KEYS } from '../src/license/public-keys';
import { LicenseService } from '../src/license/license.service';
import { AdminClient, call, resetDatabase, startApp, TestApp } from './helpers';
import { testLicenseKey } from './license-keys';

const USER = 'urn:ietf:params:scim:schemas:core:2.0:User';
const GROUP = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
const ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error';

describe('SCIM provisioning (Enterprise)', () => {
  const key = testLicenseKey();
  let t: TestApp;
  let admin: AdminClient;
  let token: string;

  beforeAll(async () => {
    t = await startApp((b) => b.overrideProvider(LICENSE_KEYS).useValue(key.publicKeys));
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.app.get(LicenseService).clearCache();
    admin = await AdminClient.setup(t.api);
    await call(`${t.api}/license`, { method: 'PUT', token: admin.jwt, json: { key: key.license() } });
    token = (await call(`${t.api}/scim/token`, { method: 'POST', token: admin.jwt })).body.token;
  });

  /** A request like an identity provider sends it. */
  const scim = (method: string, path: string, json?: unknown, auth = token) =>
    call(`${t.api}/scim/v2${path}`, {
      method,
      token: auth,
      ...(json !== undefined ? { json, headers: { 'Content-Type': 'application/scim+json' } } : {}),
    });
  const newUser = (userName: string, extra: Record<string, unknown> = {}) =>
    scim('POST', '/Users', {
      schemas: [USER],
      userName,
      externalId: `ext-${userName}`,
      active: true,
      emails: [{ value: userName, type: 'work', primary: true }],
      name: { givenName: 'Jane', familyName: 'Doe' },
      ...extra,
    });
  const signIn = (email: string) => call(`${t.api}/auth/login`, { json: { email, password: 'correct-horse' } });

  describe('token', () => {
    it('is shown once, needs admins and the Enterprise edition', async () => {
      const info = await call(`${t.api}/scim/token`, { token: admin.jwt });
      expect(info.body).toMatchObject({ configured: true, prefix: token.slice(0, 16), endpoint: expect.stringMatching(/\/api\/scim\/v2$/) });
      expect(JSON.stringify(info.body)).not.toContain(token);

      expect((await scim('GET', '/Users', undefined, 'optik_scim_wrong')).status).toBe(401);
      await call(`${t.api}/scim/token`, { method: 'DELETE', token: admin.jwt });
      expect((await scim('GET', '/Users')).status).toBe(401);

      const member = await admin.inviteUser('m@optik.test');
      expect((await call(`${t.api}/scim/token`, { method: 'POST', token: member.jwt })).status).toBe(403);
    });

    it('stops working without the license', async () => {
      await call(`${t.api}/license`, { method: 'DELETE', token: admin.jwt });
      const res = await scim('GET', '/Users');
      expect(res.status).toBe(403);
      expect(res.body.schemas).toEqual([ERROR]);
    });
  });

  describe('users', () => {
    it('provisions, finds and reads users', async () => {
      const created = await newUser('Jane@Acme.com');
      expect(created.status).toBe(201);
      expect(created.headers.get('content-type')).toContain('application/scim+json');
      expect(created.body).toMatchObject({
        schemas: [USER],
        userName: 'jane@acme.com',
        externalId: 'ext-Jane@Acme.com',
        active: true,
        emails: [{ value: 'jane@acme.com', primary: true }],
        meta: { resourceType: 'User' },
      });

      const found = await scim('GET', `/Users?filter=${encodeURIComponent('userName eq "jane@acme.com"')}`);
      expect(found.body).toMatchObject({ totalResults: 1, Resources: [{ id: created.body.id }] });
      const byExternal = await scim('GET', `/Users?filter=${encodeURIComponent('externalId eq "ext-Jane@Acme.com"')}`);
      expect(byExternal.body.totalResults).toBe(1);
      expect((await scim('GET', `/Users?filter=${encodeURIComponent('userName eq "nobody@acme.com"')}`)).body.totalResults).toBe(0);
      expect((await scim('GET', `/Users/${created.body.id}`)).body.userName).toBe('jane@acme.com');

      // Users exist in optik without a password (they sign in with SSO)
      const users = (await call(`${t.api}/users`, { token: admin.jwt })).body;
      expect(users.map((u: any) => u.email)).toContain('jane@acme.com');
    });

    it('deactivates and reactivates (Entra ID style)', async () => {
      const dev = await admin.inviteUser('dev@acme.com');
      const id = (await call(`${t.api}/auth/me`, { token: dev.jwt })).body.id;

      const off = await scim('PATCH', `/Users/${id}`, {
        schemas: [PATCH],
        Operations: [{ op: 'Replace', path: 'active', value: 'False' }],
      });
      expect(off.body.active).toBe(false);
      // The running session ends, and signing in is refused
      expect((await call(`${t.api}/auth/me`, { token: dev.jwt })).status).toBe(401);
      expect((await signIn('dev@acme.com')).status).toBe(403);
      expect((await call(`${t.api}/users`, { token: admin.jwt })).body.find((u: any) => u.id === id).active).toBe(false);

      await scim('PATCH', `/Users/${id}`, { schemas: [PATCH], Operations: [{ op: 'Replace', path: 'active', value: 'True' }] });
      expect((await signIn('dev@acme.com')).status).toBe(200);
    });

    it('applies Okta-style patches and replaces', async () => {
      const { body: user } = await newUser('okta@acme.com');
      const patched = await scim('PATCH', `/Users/${user.id}`, {
        schemas: [PATCH],
        Operations: [{ op: 'replace', value: { active: false, userName: 'okta.renamed@acme.com' } }],
      });
      expect(patched.body).toMatchObject({ active: false, userName: 'okta.renamed@acme.com' });

      const replaced = await scim('PUT', `/Users/${user.id}`, {
        schemas: [USER],
        userName: 'okta@acme.com',
        externalId: 'okta-1',
        active: true,
      });
      expect(replaced.body).toMatchObject({ active: true, userName: 'okta@acme.com', externalId: 'okta-1' });
    });

    it('answers errors in the SCIM format', async () => {
      await newUser('jane@acme.com');
      const conflict = await newUser('jane@acme.com');
      expect(conflict.status).toBe(409);
      expect(conflict.body).toMatchObject({ schemas: [ERROR], status: '409', scimType: 'uniqueness' });

      const missing = await scim('GET', '/Users/00000000-0000-0000-0000-000000000000');
      expect(missing.body).toMatchObject({ schemas: [ERROR], status: '404' });

      const filter = await scim('GET', `/Users?filter=${encodeURIComponent('name.givenName sw "J"')}`);
      expect(filter.body).toMatchObject({ status: '400', scimType: 'invalidFilter' });
      expect((await scim('POST', '/Users', { schemas: [USER], userName: 'no-email' })).body.scimType).toBe('invalidValue');
    });

    it('deletes users, but never the last admin', async () => {
      const { body: user } = await newUser('gone@acme.com');
      expect((await scim('DELETE', `/Users/${user.id}`)).status).toBe(204);
      expect((await scim('GET', `/Users/${user.id}`)).status).toBe(404);

      const adminId = (await call(`${t.api}/auth/me`, { token: admin.jwt })).body.id;
      expect((await scim('DELETE', `/Users/${adminId}`)).body.scimType).toBe('mutability');
      const deactivate = await scim('PATCH', `/Users/${adminId}`, { schemas: [PATCH], Operations: [{ op: 'replace', path: 'active', value: false }] });
      expect(deactivate.status).toBe(400);
    });

    it('pages lists', async () => {
      for (const n of [1, 2, 3]) await newUser(`u${n}@acme.com`);
      const page = await scim('GET', '/Users?startIndex=2&count=2');
      expect(page.body).toMatchObject({ totalResults: 4, startIndex: 2, itemsPerPage: 2 });
    });
  });

  describe('groups', () => {
    it('become teams with members', async () => {
      const { body: a } = await newUser('a@acme.com');
      const { body: b } = await newUser('b@acme.com');
      const created = await scim('POST', '/Groups', {
        schemas: [GROUP],
        displayName: 'Frontend',
        externalId: 'grp-1',
        members: [{ value: a.id }],
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ displayName: 'Frontend', externalId: 'grp-1', members: [{ value: a.id, display: 'a@acme.com' }] });

      // Entra ID: add and remove members
      await scim('PATCH', `/Groups/${created.body.id}`, {
        schemas: [PATCH],
        Operations: [{ op: 'Add', path: 'members', value: [{ value: b.id }] }],
      });
      await scim('PATCH', `/Groups/${created.body.id}`, {
        schemas: [PATCH],
        Operations: [{ op: 'Remove', path: `members[value eq "${a.id}"]` }],
      });
      const teams = (await call(`${t.api}/teams`, { token: admin.jwt })).body;
      expect(teams).toEqual([expect.objectContaining({ name: 'Frontend', members: [{ userId: b.id, email: 'b@acme.com' }] })]);

      // Okta: rename without a path
      const renamed = await scim('PATCH', `/Groups/${created.body.id}`, {
        schemas: [PATCH],
        Operations: [{ op: 'replace', value: { id: created.body.id, displayName: 'Web' } }],
      });
      expect(renamed.body.displayName).toBe('Web');

      const found = await scim('GET', `/Groups?filter=${encodeURIComponent('displayName eq "Web"')}&excludedAttributes=members`);
      expect(found.body.Resources).toEqual([expect.not.objectContaining({ members: expect.anything() })]);
      expect(found.body.totalResults).toBe(1);

      expect((await scim('DELETE', `/Groups/${created.body.id}`)).status).toBe(204);
      expect((await call(`${t.api}/teams`, { token: admin.jwt })).body).toEqual([]);
    });

    it('replaces members with PUT', async () => {
      const { body: a } = await newUser('a@acme.com');
      const { body: b } = await newUser('b@acme.com');
      const { body: group } = await scim('POST', '/Groups', { schemas: [GROUP], displayName: 'QA', members: [{ value: a.id }] });
      const replaced = await scim('PUT', `/Groups/${group.id}`, { schemas: [GROUP], displayName: 'QA', members: [{ value: b.id }] });
      expect(replaced.body.members).toEqual([{ value: b.id, display: 'b@acme.com' }]);
    });
  });

  it('records changes as made by SCIM', async () => {
    const { body: user } = await newUser('jane@acme.com');
    await scim('PATCH', `/Users/${user.id}`, { schemas: [PATCH], Operations: [{ op: 'replace', path: 'active', value: false }] });
    const events = (await call(`${t.api}/audit-events?q=jane`, { token: admin.jwt })).body.events.reverse();
    expect(events.map((e: any) => [e.action, e.actor.type, e.actor.label])).toEqual([
      ['user.provisioned', 'token', 'SCIM'],
      ['user.deactivated', 'token', 'SCIM'],
    ]);
  });

  it('lets admins deactivate accounts, but not their own', async () => {
    const dev = await admin.inviteUser('dev@acme.com');
    const id = (await call(`${t.api}/auth/me`, { token: dev.jwt })).body.id;
    const res = await call(`${t.api}/users/${id}`, { method: 'PATCH', token: admin.jwt, json: { active: false } });
    expect(res.body.active).toBe(false);
    expect((await call(`${t.api}/auth/me`, { token: dev.jwt })).status).toBe(401);

    const adminId = (await call(`${t.api}/auth/me`, { token: admin.jwt })).body.id;
    expect((await call(`${t.api}/users/${adminId}`, { method: 'PATCH', token: admin.jwt, json: { active: false } })).status).toBe(400);
  });
});
