import { LICENSE_KEYS, RELEASE_DATE } from '../src/license/public-keys';
import { AdminClient, call, resetDatabase, startApp, TestApp } from './helpers';
import { testLicenseKey } from './license-keys';

describe('license', () => {
  const key = testLicenseKey();
  let t: TestApp;
  let admin: AdminClient;

  beforeAll(async () => {
    t = await startApp((b) =>
      b.overrideProvider(LICENSE_KEYS).useValue(key.publicKeys).overrideProvider(RELEASE_DATE).useValue('2026-10-01'),
    );
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.prisma.instanceSetting.deleteMany({ where: { key: 'license' } });
    admin = await AdminClient.setup(t.api);
  });

  const info = (token = admin.jwt) => call(`${t.api}/license`, { token });
  const install = (licenseKey: string, token = admin.jwt) =>
    call(`${t.api}/license`, { method: 'PUT', token, json: { key: licenseKey } });

  it('runs as Community without a license', async () => {
    expect((await info()).body).toEqual({
      edition: 'community',
      license: null,
      source: null,
      maxReviewers: 5,
      reviewers: 1,
      releaseDate: '2026-10-01',
      problems: [],
      warnings: [],
    });
  });

  it('installs, shows and removes a license', async () => {
    const res = await install(key.license({ maxReviewers: 25 }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      edition: 'enterprise',
      source: 'settings',
      maxReviewers: 25,
      license: { licensee: 'ACME GmbH', edition: 'enterprise', updatesUntil: '2099-12-31' },
    });
    // Line breaks from copying the key are ignored
    expect((await install(key.license().replace(/(.{40})/g, '$1\n'))).status).toBe(200);

    const removed = await call(`${t.api}/license`, { method: 'DELETE', token: admin.jwt });
    expect(removed.body).toMatchObject({ edition: 'community', license: null });
  });

  it('refuses keys it cannot verify', async () => {
    expect((await install('optik1.nonsense.x')).status).toBe(400);
    expect((await install(testLicenseKey().license())).body.message).toContain('unknown key');
    expect((await info()).body.edition).toBe('community');
  });

  it('does not unlock this release when it came out after the update period', async () => {
    await install(key.license({ updatesUntil: '2026-09-30' }));
    expect((await info()).body).toMatchObject({
      edition: 'community',
      license: { updatesUntil: '2026-09-30' },
      problems: [expect.stringContaining('update period ended')],
    });
  });

  it('counts admins, maintainers and reviewers — not viewers', async () => {
    await admin.createProject('shop');
    await admin.inviteUser('r@optik.test', { projectSlug: 'shop', projectRole: 'reviewer' });
    await admin.inviteUser('m@optik.test', { projectSlug: 'shop', projectRole: 'maintainer' });
    await admin.inviteUser('v@optik.test', { projectSlug: 'shop', projectRole: 'viewer' });
    await admin.inviteUser('a@optik.test', { role: 'admin' });
    await admin.inviteUser('n@optik.test');
    expect((await info()).body.reviewers).toBe(4);
  });

  it('only warns when there are more reviewers than licensed', async () => {
    await install(key.license({ maxReviewers: 1 }));
    await admin.inviteUser('a@optik.test', { role: 'admin' });
    expect((await info()).body).toMatchObject({
      edition: 'enterprise',
      warnings: [expect.stringContaining('2 people can review changes, the license covers 1')],
    });
  });

  it('is for admins only', async () => {
    const member = await admin.inviteUser('m@optik.test');
    expect((await info(member.jwt)).status).toBe(403);
    expect((await install(key.license(), member.jwt)).status).toBe(403);
  });

  describe('from OPTIK_LICENSE', () => {
    beforeAll(() => {
      process.env.OPTIK_LICENSE = key.license({ edition: 'team', maxReviewers: 3 });
    });
    afterAll(() => {
      delete process.env.OPTIK_LICENSE;
    });

    it('takes precedence and cannot be changed in the UI', async () => {
      expect((await info()).body).toMatchObject({ edition: 'team', source: 'environment', maxReviewers: 3 });
      expect((await install(key.license())).status).toBe(409);
      expect((await call(`${t.api}/license`, { method: 'DELETE', token: admin.jwt })).status).toBe(409);
    });
  });
});
