import { LICENSE_KEYS } from '../src/license/public-keys';
import { LicenseService } from '../src/license/license.service';
import { AdminClient, call, resetDatabase, startApp, TestApp } from './helpers';
import { OTHER_KEY, SAML_IDP, samlResponse, ResponseOptions } from './fake-saml';
import { testLicenseKey } from './license-keys';

describe('single sign-on with SAML (Enterprise)', () => {
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
  });

  const addProvider = async (settings: Record<string, unknown> = {}) => {
    const res = await call(`${t.api}/sso/providers`, {
      token: admin.jwt,
      json: {
        name: 'Acme SAML',
        protocol: 'saml',
        issuer: SAML_IDP.entityId,
        samlEntryPoint: SAML_IDP.entryPoint,
        samlCertificate: SAML_IDP.certificate,
        ...settings,
      },
    });
    if (res.status !== 201) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  /** Starts a sign-in like the browser: returns the request ID (RelayState) and the cookie. */
  async function start(providerId: string, returnTo = '/') {
    const res = await fetch(`${t.api}/auth/sso/${providerId}/start?returnTo=${encodeURIComponent(returnTo)}`, {
      redirect: 'manual',
    });
    const location = new URL(res.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(SAML_IDP.entryPoint);
    expect(location.searchParams.get('SAMLRequest')).toBeTruthy();
    return { requestId: location.searchParams.get('RelayState')!, cookie: res.headers.get('set-cookie')!.split(';')[0] };
  }

  /** Posts a response to the ACS like the browser; returns where optik sends it. */
  async function post(provider: any, requestId: string, cookie: string | null, options: Partial<ResponseOptions> = {}) {
    const SAMLResponse = samlResponse({
      inResponseTo: requestId,
      acsUrl: provider.redirectUri,
      audience: provider.spEntityId,
      nameId: 'alice-1',
      attributes: { email: ['alice@acme.com'], groups: ['optik-admins'] },
      ...options,
    });
    const res = await fetch(provider.redirectUri, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
      body: new URLSearchParams({ SAMLResponse, RelayState: requestId }),
    });
    expect(res.status).toBe(303);
    return new URL(res.headers.get('location')!);
  }

  it('signs in with a signed assertion and maps groups', async () => {
    const provider = await addProvider({ roleMappings: [{ group: 'optik-admins', project: null, role: 'admin' }] });
    expect(provider).toMatchObject({ protocol: 'saml', clientId: null, spEntityId: expect.stringContaining('/api/auth/sso/') });

    const { requestId, cookie } = await start(provider.id, '/shop');
    expect(requestId.length).toBeLessThanOrEqual(80);
    const landed = await post(provider, requestId, cookie);
    expect(landed.pathname).toBe('/login/sso');
    expect(landed.searchParams.get('returnTo')).toBe('/shop');

    const session = (await call(`${t.api}/auth/sso/exchange`, { json: { code: landed.searchParams.get('code') } })).body;
    const me = (await call(`${t.api}/auth/me`, { token: session.accessToken })).body;
    expect(me).toMatchObject({ email: 'alice@acme.com', role: 'admin' });
  });

  it('refuses responses it cannot trust', async () => {
    const provider = await addProvider();
    const error = async (options: Partial<ResponseOptions>, sameRequest?: { requestId: string; cookie: string }) => {
      const { requestId, cookie } = sameRequest ?? (await start(provider.id));
      const landed = await post(provider, requestId, cookie, options);
      expect(landed.pathname).toBe('/login');
      return landed.searchParams.get('sso_error');
    };
    expect(await error({ key: OTHER_KEY.key })).toMatch(/signature/i);
    expect(await error({ signed: false })).toMatch(/signature/i);
    expect(await error({ audience: 'https://someone-else' })).toMatch(/audience/i);
    expect(await error({ issuer: 'https://evil.example.com' })).toContain('issued by "https://evil.example.com"');
    expect(await error({ validFor: -10 })).toMatch(/expired|NotOnOrAfter|subject confirmation/i);
    expect(await error({ inResponseTo: '_made-up' })).toMatch(/InResponseTo/);
  });

  it('accepts a response only once, and only from the browser that started', async () => {
    const provider = await addProvider();
    const first = await start(provider.id);
    expect((await post(provider, first.requestId, first.cookie)).pathname).toBe('/login/sso');
    // Replayed
    const replay = await post(provider, first.requestId, first.cookie);
    expect(replay.searchParams.get('sso_error')).toContain('expired or was not started here');

    const second = await start(provider.id);
    const other = await start(provider.id);
    const mismatch = await post(provider, second.requestId, other.cookie);
    expect(mismatch.searchParams.get('sso_error')).toContain('another browser');
  });

  it('publishes service provider metadata', async () => {
    const provider = await addProvider();
    const res = await fetch(provider.metadataUrl);
    expect(res.headers.get('content-type')).toContain('xml');
    const xml = await res.text();
    expect(xml).toContain(`entityID="${provider.spEntityId}"`);
    expect(xml).toContain(`Location="${provider.redirectUri}"`);
    expect(xml).toContain('urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST');
  });

  it('validates SAML providers', async () => {
    const create = (dto: Record<string, unknown>) => call(`${t.api}/sso/providers`, { token: admin.jwt, json: dto });
    const valid = {
      name: 'X',
      protocol: 'saml',
      issuer: 'urn:acme:idp',
      samlEntryPoint: SAML_IDP.entryPoint,
      samlCertificate: SAML_IDP.certificate,
    };
    expect((await create({ ...valid, samlCertificate: 'not a cert' })).status).toBe(400);
    expect((await create({ ...valid, samlEntryPoint: 'idp' })).status).toBe(400);
    expect((await create({ ...valid, protocol: 'ws-fed' })).status).toBe(400);

    // Certificates as bare base64 (as some providers show them) are accepted
    const bare = SAML_IDP.certificate.replace(/-----[^-]+-----|\s/g, '');
    const created = await create({ ...valid, samlCertificate: bare });
    expect(created.status).toBe(201);
    expect(created.body.samlCertificate).toContain('-----BEGIN CERTIFICATE-----');

    const check = await call(`${t.api}/sso/providers/${created.body.id}/check`, { method: 'POST', token: admin.jwt });
    expect(check.body).toMatchObject({ ok: true, message: expect.stringContaining('optik test saml-idp') });

    const update = await call(`${t.api}/sso/providers/${created.body.id}`, {
      method: 'PUT',
      token: admin.jwt,
      json: { ...valid, protocol: 'oidc', clientId: 'c' },
    });
    expect(update.status).toBe(400);
  });
});
