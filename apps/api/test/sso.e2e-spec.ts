import { LICENSE_KEYS } from '../src/license/public-keys';
import { LicenseService } from '../src/license/license.service';
import { AdminClient, call, resetDatabase, startApp, TestApp } from './helpers';
import { FakeOidc } from './fake-oidc';
import { testLicenseKey } from './license-keys';

describe('single sign-on (Enterprise)', () => {
  const key = testLicenseKey();
  let t: TestApp;
  let idp: FakeOidc;
  let admin: AdminClient;
  let base: string;

  beforeAll(async () => {
    idp = new FakeOidc();
    await idp.start();
    t = await startApp((b) => b.overrideProvider(LICENSE_KEYS).useValue(key.publicKeys));
    base = t.api.replace(/\/api$/, '');
  });
  afterAll(async () => {
    await t.app.close();
    await idp.stop();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.app.get(LicenseService).clearCache();
    idp.tamper = {};
    idp.userinfo = {};
    admin = await AdminClient.setup(t.api);
    await call(`${t.api}/license`, { method: 'PUT', token: admin.jwt, json: { key: key.license() } });
  });

  const addProvider = async (settings: Record<string, unknown> = {}) => {
    const res = await call(`${t.api}/sso/providers`, {
      token: admin.jwt,
      json: { name: 'Acme ID', issuer: idp.issuer, clientId: idp.clientId, clientSecret: idp.clientSecret, ...settings },
    });
    if (res.status !== 201) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  /** The browser's part: start, sign in at the provider, come back. Returns where optik sends it. */
  async function browserSignIn(providerId: string, claims: Record<string, unknown>, returnTo = '/') {
    const start = await fetch(`${t.api}/auth/sso/${providerId}/start?returnTo=${encodeURIComponent(returnTo)}`, {
      redirect: 'manual',
    });
    if (start.status !== 302) throw new Error(`start: ${start.status} ${await start.text()}`);
    const cookie = start.headers.get('set-cookie')!.split(';')[0];
    const { code, state, redirectUri } = idp.signIn(start.headers.get('location')!, claims);
    const back = await fetch(`${redirectUri}?code=${code}&state=${state}`, { redirect: 'manual', headers: { Cookie: cookie } });
    return new URL(back.headers.get('location')!);
  }

  /** Full sign-in through to a session, like the web UI does. */
  async function signIn(providerId: string, claims: Record<string, unknown>) {
    const landed = await browserSignIn(providerId, claims);
    if (landed.pathname !== '/login/sso') throw new Error(`failed: ${landed.searchParams.get('sso_error')}`);
    const session = await call(`${t.api}/auth/sso/exchange`, { json: { code: landed.searchParams.get('code') } });
    return session.body as { accessToken: string; user: { id: string; email: string } };
  }

  const me = (token: string) => call(`${t.api}/auth/me`, { token }).then((r) => r.body);
  const alice = { sub: 'alice-1', email: 'alice@acme.com', email_verified: true };

  it('is only offered with the Enterprise edition', async () => {
    const provider = await addProvider();
    expect((await call(`${t.api}/auth/sso/providers`)).body).toEqual([{ id: provider.id, name: 'Acme ID' }]);

    await call(`${t.api}/license`, { method: 'DELETE', token: admin.jwt });
    expect((await call(`${t.api}/auth/sso/providers`)).body).toEqual([]);
    expect((await call(`${t.api}/sso/providers`, { token: admin.jwt })).status).toBe(403);
    expect((await fetch(`${t.api}/auth/sso/${provider.id}/start`, { redirect: 'manual' })).status).toBe(403);
  });

  it('signs in with PKCE and creates the account', async () => {
    const provider = await addProvider();
    expect(provider).toMatchObject({
      clientSecretConfigured: true,
      redirectUri: `${base}/api/auth/sso/${provider.id}/callback`,
    });
    expect(JSON.stringify(provider)).not.toContain(idp.clientSecret);

    const landed = await browserSignIn(provider.id, alice, '/shop/runs');
    expect(landed.origin + landed.pathname).toBe(`${base}/login/sso`);
    expect(landed.searchParams.get('returnTo')).toBe('/shop/runs');
    // The client authenticated with its secret, and proved the PKCE verifier
    expect(idp.tokenRequests[0].authorization).toMatch(/^Basic /);
    expect(idp.tokenRequests[0].body.get('code_verifier')).toBeTruthy();

    const session = await call(`${t.api}/auth/sso/exchange`, { json: { code: landed.searchParams.get('code') } });
    expect(session.body.user).toMatchObject({ email: 'alice@acme.com' });
    expect(await me(session.body.accessToken)).toMatchObject({ email: 'alice@acme.com', role: 'member' });

    // The code works once
    expect((await call(`${t.api}/auth/sso/exchange`, { json: { code: landed.searchParams.get('code') } })).status).toBe(401);
  });

  it('maps groups to roles on every sign-in', async () => {
    await admin.createProject('shop');
    await admin.createProject('blog');
    const provider = await addProvider({
      roleMappings: [
        { group: 'optik-admins', project: null, role: 'admin' },
        { group: 'shop-dev', project: 'shop', role: 'reviewer' },
        { group: 'shop-leads', project: 'shop', role: 'maintainer' },
      ],
    });

    const first = await signIn(provider.id, { ...alice, groups: ['shop-dev', 'shop-leads'] });
    const members = () => call(`${t.api}/projects/shop/members`, { token: admin.jwt }).then((r) => r.body);
    expect(await me(first.accessToken)).toMatchObject({ role: 'member' });
    expect(await members()).toEqual([{ userId: first.user.id, email: 'alice@acme.com', role: 'maintainer' }]);

    // Blog isn't in the mapping: set by hand, it stays
    await call(`${t.api}/projects/blog/members`, { method: 'PUT', token: admin.jwt, json: { email: 'alice@acme.com', role: 'viewer' } });
    const second = await signIn(provider.id, { ...alice, groups: ['optik-admins'] });
    expect(await me(second.accessToken)).toMatchObject({ role: 'admin' });
    expect(await members()).toEqual([]);
    expect((await call(`${t.api}/projects/blog/members`, { token: admin.jwt })).body).toHaveLength(1);
  });

  it('reads groups from the userinfo endpoint and a custom claim', async () => {
    await admin.createProject('shop');
    const provider = await addProvider({
      groupsClaim: 'roles',
      roleMappings: [{ group: 'shop-dev', project: 'shop', role: 'reviewer' }],
    });
    idp.userinfo = { roles: ['shop-dev'] };
    const session = await signIn(provider.id, alice);
    expect((await call(`${t.api}/projects/shop/members`, { token: admin.jwt })).body).toEqual([
      expect.objectContaining({ userId: session.user.id, role: 'reviewer' }),
    ]);
  });

  it('links existing accounts by e-mail, then by subject', async () => {
    const provider = await addProvider();
    const invited = await admin.inviteUser('alice@acme.com');
    const invitedId = (await me(invited.jwt)).id;

    expect((await signIn(provider.id, alice)).user.id).toBe(invitedId);
    // A changed e-mail address at the provider still finds the account
    expect((await signIn(provider.id, { ...alice, email: 'alice.smith@acme.com' })).user.id).toBe(invitedId);
  });

  it('refuses sign-ins it cannot trust', async () => {
    const provider = await addProvider({ allowedDomains: ['acme.com'] });
    const error = async (claims: Record<string, unknown>) => {
      const landed = await browserSignIn(provider.id, claims);
      expect(landed.pathname).toBe('/login');
      return landed.searchParams.get('sso_error');
    };
    expect(await error({ ...alice, email: 'eve@evil.com' })).toContain('evil.com may not sign in');
    expect(await error({ ...alice, email_verified: false })).toContain('not verified');
    expect(await error({ sub: 'x' })).toContain('no subject or e-mail');

    idp.tamper = { nonce: 'replayed' };
    expect(await error(alice)).toContain('nonce');
    idp.tamper = { aud: 'another-app' };
    expect(await error(alice)).toMatch(/aud/);
    idp.tamper = {};

    // A callback without the browser's state cookie (e.g. a forged link)
    const start = await fetch(`${t.api}/auth/sso/${provider.id}/start`, { redirect: 'manual' });
    const { code, state, redirectUri } = idp.signIn(start.headers.get('location')!, alice);
    const forged = await fetch(`${redirectUri}?code=${code}&state=${state}`, { redirect: 'manual' });
    expect(new URL(forged.headers.get('location')!).searchParams.get('sso_error')).toContain('expired');
  });

  it('creates no accounts when told not to', async () => {
    const provider = await addProvider({ createUsers: false });
    const landed = await browserSignIn(provider.id, alice);
    expect(landed.searchParams.get('sso_error')).toContain('ask an admin to invite you');
  });

  it('only returns to paths inside optik', async () => {
    const provider = await addProvider();
    for (const target of ['//evil.com/x', 'https://evil.com', '/\\evil.com']) {
      expect((await browserSignIn(provider.id, alice, target)).searchParams.get('returnTo')).toBe('/');
    }
  });

  it('can keep passwords for admins only', async () => {
    expect((await call(`${t.api}/sso/settings`, { method: 'PUT', token: admin.jwt, json: { passwordLogin: 'admins' } })).status).toBe(400);
    await addProvider();
    await admin.inviteUser('m@optik.test');
    await call(`${t.api}/sso/settings`, { method: 'PUT', token: admin.jwt, json: { passwordLogin: 'admins' } });

    const login = (email: string) => call(`${t.api}/auth/login`, { json: { email, password: 'correct-horse' } });
    const member = await login('m@optik.test');
    expect(member.status).toBe(403);
    expect(member.body.message).toContain('single sign-on');
    expect((await login('admin@optik.test')).status).toBe(200);
  });

  it('drops the client secret when the issuer changes', async () => {
    const provider = await addProvider();
    const update = (changes: Record<string, unknown>) =>
      call(`${t.api}/sso/providers/${provider.id}`, {
        method: 'PUT',
        token: admin.jwt,
        json: { name: 'Acme ID', issuer: idp.issuer, clientId: idp.clientId, ...changes },
      });
    expect((await update({ name: 'Acme' })).body.clientSecretConfigured).toBe(true);
    expect((await update({ issuer: 'https://login.example.com' })).body.clientSecretConfigured).toBe(false);
  });

  it('validates providers and checks their discovery document', async () => {
    const create = (dto: Record<string, unknown>) => call(`${t.api}/sso/providers`, { token: admin.jwt, json: dto });
    const valid = { name: 'X', issuer: idp.issuer, clientId: 'c' };
    expect((await create({ ...valid, issuer: 'ftp://x' })).status).toBe(400);
    expect((await create({ ...valid, scopes: 'email' })).status).toBe(400);
    expect((await create({ ...valid, roleMappings: [{ group: 'g', project: null, role: 'viewer' }] })).status).toBe(400);
    expect((await create({ ...valid, roleMappings: [{ group: 'g', project: 'shop', role: 'owner' }] })).status).toBe(400);
    expect((await create({ ...valid, allowedDomains: ['not a domain'] })).status).toBe(400);

    const ok = (await create(valid)).body;
    expect((await call(`${t.api}/sso/providers/${ok.id}/check`, { method: 'POST', token: admin.jwt })).body).toMatchObject({ ok: true });
    const wrong = (await create({ ...valid, issuer: `${idp.issuer}/nope` })).body;
    expect((await call(`${t.api}/sso/providers/${wrong.id}/check`, { method: 'POST', token: admin.jwt })).body).toMatchObject({ ok: false });

    const member = await admin.inviteUser('m@optik.test');
    expect((await call(`${t.api}/sso/providers`, { token: member.jwt })).status).toBe(403);
  });
});
