import { createServer, Server } from 'http';
import type { AddressInfo } from 'net';
import { LICENSE_KEYS } from '../src/license/public-keys';
import { LicenseService } from '../src/license/license.service';
import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';
import { FakeCi } from './fake-ci';
import { FakeOidc } from './fake-oidc';
import { FakeWebhooks } from './fake-receivers';
import { testLicenseKey } from './license-keys';

/** An "internal service" that answers anything with something secret. */
class InternalService {
  requests = 0;
  answer: { type: string; body: string } = { type: 'text/html', body: '<html>internal-secret</html>' };
  private server!: Server;
  url = '';

  async start() {
    this.server = createServer((_req, res) => {
      this.requests++;
      res.writeHead(200, { 'Content-Type': this.answer.type }).end(this.answer.body);
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop() {
    return new Promise((resolve) => this.server.close(resolve));
  }
}

/**
 * SSRF protection: optik only connects to the URLs people configure (webhooks,
 * CI APIs, identity providers) when they don't lead to loopback, link-local
 * or cloud metadata addresses — checked when connecting, not only when saving.
 * The fake servers listen on 127.0.0.1, which test/setup/env.ts allows.
 */
describe('outbound requests', () => {
  const key = testLicenseKey();
  let t: TestApp;
  let admin: AdminClient;
  let adapter: AdapterClient;
  let hooks: FakeWebhooks;
  let ci: FakeCi;
  let ciUrl: string;
  let idp: FakeOidc;
  let internal: InternalService;

  const allow = (hosts: string) => (process.env.OUTBOUND_ALLOWED_HOSTS = hosts);

  beforeAll(async () => {
    hooks = new FakeWebhooks();
    ci = new FakeCi();
    idp = new FakeOidc();
    internal = new InternalService();
    [ciUrl] = await Promise.all([ci.start(), hooks.start(), idp.start(), internal.start()]);
    t = await startApp((b) => b.overrideProvider(LICENSE_KEYS).useValue(key.publicKeys));
  });
  afterAll(async () => {
    allow('127.0.0.1');
    await t.app.close();
    await Promise.all([ci.stop(), hooks.stop(), idp.stop(), internal.stop()]);
  });
  beforeEach(async () => {
    allow('127.0.0.1');
    await resetDatabase(t.prisma);
    t.app.get(LicenseService).clearCache();
    hooks.requests.length = 0;
    ci.reset();
    internal.requests = 0;
    admin = await AdminClient.setup(t.api);
    await admin.createProject('shop');
    adapter = new AdapterClient(t.api, await admin.createToken('shop'));
  });

  const addChannel = (target: string) =>
    call(`${t.api}/projects/shop/notifications`, { token: admin.jwt, json: { type: 'webhook', target } });
  const sendTest = (id: string) =>
    call(`${t.api}/projects/shop/notifications/${id}/test`, { method: 'POST', token: admin.jwt });
  const configureCi = (ciApiUrl: string) =>
    call(`${t.api}/projects/shop`, {
      method: 'PATCH',
      token: admin.jwt,
      json: { ciProvider: 'github', ciRepository: 'acme/shop', ciApiUrl, ciToken: 'ghp_secret' },
    });
  const addProvider = async (issuer: string) => {
    await call(`${t.api}/license`, { method: 'PUT', token: admin.jwt, json: { key: key.license() } });
    return call(`${t.api}/sso/providers`, {
      token: admin.jwt,
      json: { name: 'Acme ID', issuer, clientId: idp.clientId, clientSecret: idp.clientSecret },
    });
  };
  const checkProvider = (id: string) =>
    call(`${t.api}/sso/providers/${id}/check`, { method: 'POST', token: admin.jwt }).then((r) => r.body);

  describe('settings', () => {
    it.each([
      ['http://169.254.169.254/latest/meta-data/', /169\.254\.169\.254: it is a link-local address/],
      ['http://[fd00:ec2::254]/latest/meta-data/', /it is a cloud metadata address/],
      ['http://[::ffff:127.0.0.2]:8080/', /it is a loopback address/],
      ['http://localhost:8080/hook', /localhost: it resolves to a loopback address/],
      ['http://0.0.0.0:8080/hook', /it is an unspecified address/],
    ])('refuses the webhook %s', async (target, message) => {
      const res = await addChannel(target);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(message);
    });

    it('refuses CI API URLs and OIDC issuers on refused addresses', async () => {
      const ciRes = await configureCi('http://169.254.169.254/api/v3');
      expect(ciRes.status).toBe(400);
      expect(ciRes.body.message).toMatch(/^ciApiUrl: optik does not connect to 169\.254\.169\.254/);

      const sso = await addProvider('http://127.0.0.2:8080/realm');
      expect(sso.status).toBe(400);
      expect(sso.body.message).toMatch(/^issuer: optik does not connect to 127\.0\.0\.2: it is a loopback address/);
    });

    it('accepts hosts on OUTBOUND_ALLOWED_HOSTS', async () => {
      allow('127.0.0.1, localhost');
      expect((await addChannel('http://localhost:8080/hook')).status).toBe(201);
      expect((await configureCi(ciUrl)).status).toBe(200);
    });
  });

  describe('when connecting', () => {
    it('does not deliver webhooks once their address is refused (e.g. after DNS rebinding)', async () => {
      const channel = (await addChannel(`${hooks.url}/hook`)).body;
      expect((await sendTest(channel.id)).body).toEqual({ delivered: true });
      expect(hooks.requests).toHaveLength(1);

      allow('');
      expect((await sendTest(channel.id)).body).toEqual({ delivered: false });
      expect(hooks.requests).toHaveLength(1);
    });

    it('does not report commit statuses to refused addresses', async () => {
      expect((await configureCi(ciUrl)).status).toBe(200);
      const run = async (commitSha: string) => {
        const started = await call(`${t.api}/runs`, {
          token: (adapter as any).token,
          json: { branch: 'main', commitSha, serverUrl: 'https://optik.example.com/' },
        });
        await adapter.submit(started.body.id, 'Button', png(255));
        await adapter.complete(started.body.id);
      };

      allow('');
      await run('1'.repeat(40));
      expect(ci.calls).toHaveLength(0);

      allow('127.0.0.1');
      await run('2'.repeat(40));
      expect(ci.calls.length).toBeGreaterThan(0);
    });

    it('does not fetch OIDC discovery documents from refused addresses', async () => {
      const provider = (await addProvider(idp.issuer)).body;
      expect(await checkProvider(provider.id)).toMatchObject({ ok: true });

      allow('');
      const result = await checkProvider(provider.id);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/optik does not connect to 127\.0\.0\.1: it is a loopback address/);
    });
  });

  describe('answers', () => {
    it('never shows what a server answered', async () => {
      const provider = (await addProvider(`${internal.url}/realm`)).body;

      const html = await checkProvider(provider.id);
      expect(internal.requests).toBe(1);
      expect(html).toMatchObject({ ok: false, message: expect.stringMatching(/did not answer with JSON$/) });
      expect(JSON.stringify(html)).not.toContain('internal-secret');

      internal.answer = { type: 'application/json', body: JSON.stringify({ secret: 'internal-secret' }) };
      const json = await checkProvider(provider.id);
      expect(json.message).toMatch(/is not an OpenID discovery document \(no issuer\)$/);
      expect(JSON.stringify(json)).not.toContain('internal-secret');

      internal.answer = {
        type: 'application/json',
        body: JSON.stringify({ issuer: 'internal-secret', authorization_endpoint: 'x', token_endpoint: 'x', jwks_uri: 'x' }),
      };
      const named = await checkProvider(provider.id);
      expect(named.message).toMatch(/calls itself something else/);
      expect(JSON.stringify(named)).not.toContain('internal-secret');
    });
  });
});
