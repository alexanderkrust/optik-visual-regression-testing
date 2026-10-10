import { LICENSE_KEYS } from '../src/license/public-keys';
import { MaintenanceService } from '../src/maintenance/maintenance.service';
import { AdminClient, call, resetDatabase, startApp, TestApp } from './helpers';
import { FakeOidc } from './fake-oidc';
import { SAML_IDP, samlResponse } from './fake-saml';
import { testLicenseKey } from './license-keys';

/** What the load balancer in front of both instances adds to every request. */
const LB = { 'X-Forwarded-Host': 'optik.example.com', 'X-Forwarded-Proto': 'https' };

/** Two optik instances on one database, as behind a load balancer. */
describe('several instances', () => {
  const key = testLicenseKey();
  let a: TestApp;
  let b: TestApp;
  let idp: FakeOidc;
  let admin: AdminClient;

  beforeAll(async () => {
    idp = new FakeOidc();
    await idp.start();
    const licensed = (builder: Parameters<NonNullable<Parameters<typeof startApp>[0]>>[0]) =>
      builder.overrideProvider(LICENSE_KEYS).useValue(key.publicKeys);
    a = await startApp(licensed);
    b = await startApp(licensed);
  });
  afterAll(async () => {
    await a.app.close();
    await b.app.close();
    await idp.stop();
  });
  beforeEach(async () => {
    await resetDatabase(a.prisma);
    admin = await AdminClient.setup(a.api);
    await call(`${a.api}/license`, { method: 'PUT', token: admin.jwt, json: { key: key.license() } });
  });

  it('accept each other\'s sessions', async () => {
    expect((await call(`${b.api}/auth/me`, { token: admin.jwt })).body.email).toBe('admin@optik.test');
  });

  it('share the limit for failed sign-ins', async () => {
    const attempt = (app: TestApp) => call(`${app.api}/auth/login`, { json: { email: 'admin@optik.test', password: 'wrong' } });
    for (let i = 0; i < 10; i++) await attempt(i % 2 ? a : b);
    expect((await attempt(a)).status).toBe(429);
    expect((await attempt(b)).status).toBe(429);
  });

  it('finish an OIDC sign-in on another instance than it started', async () => {
    const provider = (await call(`${a.api}/sso/providers`, {
      token: admin.jwt,
      json: { name: 'Acme', issuer: idp.issuer, clientId: idp.clientId, clientSecret: idp.clientSecret },
    })).body;
    const start = await fetch(`${a.api}/auth/sso/${provider.id}/start`, { redirect: 'manual', headers: LB });
    const cookie = start.headers.get('set-cookie')!.split(';')[0];
    const { code, state } = idp.signIn(start.headers.get('location')!, { sub: 's1', email: 'sso@acme.com' });
    // The provider redirects to the redirect URI A built — instance B answers it
    const back = await fetch(`${b.api}/auth/sso/${provider.id}/callback?code=${code}&state=${state}`, {
      redirect: 'manual',
      headers: { ...LB, Cookie: cookie },
    });
    const landed = new URL(back.headers.get('location')!);
    expect(landed.pathname).toBe('/login/sso');
    const session = await call(`${a.api}/auth/sso/exchange`, { json: { code: landed.searchParams.get('code') } });
    expect(session.body.user.email).toBe('sso@acme.com');
  });

  it('accept a SAML response on another instance than the request', async () => {
    const provider = (await call(`${a.api}/sso/providers`, {
      token: admin.jwt,
      headers: LB,
      json: { name: 'Acme SAML', protocol: 'saml', issuer: SAML_IDP.entityId, samlEntryPoint: SAML_IDP.entryPoint, samlCertificate: SAML_IDP.certificate },
    })).body;
    const start = await fetch(`${a.api}/auth/sso/${provider.id}/start`, { redirect: 'manual', headers: LB });
    const requestId = new URL(start.headers.get('location')!).searchParams.get('RelayState')!;
    const SAMLResponse = samlResponse({
      inResponseTo: requestId,
      acsUrl: provider.redirectUri,
      audience: provider.spEntityId,
      nameId: 'n1',
      attributes: { email: ['saml@acme.com'] },
    });
    const res = await fetch(`${b.api}/auth/sso/${provider.id}/callback`, {
      method: 'POST',
      redirect: 'manual',
      headers: { ...LB, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: start.headers.get('set-cookie')!.split(';')[0] },
      body: new URLSearchParams({ SAMLResponse, RelayState: requestId }),
    });
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login/sso');
  });

  it('run the daily maintenance on one instance at a time', async () => {
    const results = await Promise.all([a.app.get(MaintenanceService).runAll(), b.app.get(MaintenanceService).runAll()]);
    expect(results.sort()).toEqual([false, true]);
  });
});
