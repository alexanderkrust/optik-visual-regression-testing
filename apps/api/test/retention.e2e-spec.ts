import { existsSync } from 'fs';
import { join } from 'path';
import { LICENSE_KEYS } from '../src/license/public-keys';
import { LicenseService } from '../src/license/license.service';
import { MaintenanceService } from '../src/maintenance/maintenance.service';
import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';
import { testLicenseKey } from './license-keys';

const sha = (n: number) => n.toString(16).padStart(40, '0');

describe('retention and storage (Enterprise)', () => {
  const key = testLicenseKey();
  let t: TestApp;
  let admin: AdminClient;
  let adapter: AdapterClient;

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
    adapter = new AdapterClient(t.api, await admin.createToken('shop'));
  });

  const stored = (runId: string, id: string) => existsSync(join(process.env.STORAGE_DIR!, 'runs', runId, `${id}.png`));
  const age = (runId: string, days: number) =>
    t.prisma.$executeRawUnsafe(`UPDATE runs SET updated_at = now() - interval '${days} days' WHERE id = '${runId}'`);
  const setRetention = (days: unknown) =>
    call(`${t.api}/projects/shop/retention`, { method: 'PUT', token: admin.jwt, json: { days } });
  const runNow = () => call(`${t.api}/projects/shop/retention/run`, { method: 'POST', token: admin.jwt });
  const snapshotIds = async () => (await t.prisma.snapshot.findMany({ select: { id: true } })).map((s) => s.id).sort();

  /** A history on main: baselines, an accepted and a rejected change, and a recent run. */
  async function history() {
    const a = await adapter.fullRun({ Button: png(255), Card: png(255) }, 'main', sha(1));
    const b = await adapter.fullRun({ Button: png(0), Card: png(255) }, 'main', sha(2));
    await admin.review(b.snapshots.Button.id, 'approved');
    const c = await adapter.fullRun({ Button: png(128) }, 'main', sha(3));
    await admin.review(c.snapshots.Button.id, 'rejected');
    const d = await adapter.fullRun({ Card: png(64) }, 'main', sha(4)); // recent, compares with Card from run A
    for (const run of [a, b, c]) await age(run.runId, 60);
    return { a, b, c, d };
  }

  it('removes old runs and images, but keeps every baseline', async () => {
    const { a, b, c, d } = await history();
    await setRetention(30);
    const res = await runNow();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ runsDeleted: 1, snapshotsDeleted: 3 });
    expect(res.body.bytesFreed).toBeGreaterThan(0);

    // Kept: Button v2 (current baseline), Card v1 (baseline of the recent run D), and run D
    expect(await snapshotIds()).toEqual(
      [b.snapshots.Button.id, a.snapshots.Card.id, d.snapshots.Card.id].sort(),
    );
    expect(stored(a.runId, a.snapshots.Button.id)).toBe(false);
    expect(stored(c.runId, c.snapshots.Button.id)).toBe(false);
    expect(stored(b.runId, b.snapshots.Button.id)).toBe(true);
    expect((await admin.run(c.runId)).status).toBe(404);

    // The review still works as before: the accepted Button is the baseline
    const next = await adapter.fullRun({ Button: png(0) }, 'main', sha(5));
    expect(next.snapshots.Button.status).toBe('unchanged');

    const events = (await call(`${t.api}/audit-events?action=retention.applied`, { token: admin.jwt })).body.events;
    expect(events[0]).toMatchObject({ project: { slug: 'shop' }, details: { snapshotsDeleted: 3, retentionDays: 30 } });
  });

  it('keeps the baseline of every branch', async () => {
    const main = await adapter.fullRun({ Button: png(255) }, 'main', sha(1));
    const feature = await adapter.fullRun({ Button: png(0) }, 'feature/x', sha(2));
    await admin.review(feature.snapshots.Button.id, 'approved');
    await age(main.runId, 90);
    await age(feature.runId, 90);
    await setRetention(30);
    await runNow();
    expect(await snapshotIds()).toEqual([main.snapshots.Button.id, feature.snapshots.Button.id].sort());
  });

  it('runs daily for every project, on one instance at a time', async () => {
    await history();
    await setRetention(30);
    const maintenance = t.app.get(MaintenanceService);
    const [first, second] = await Promise.all([maintenance.runAll(), maintenance.runAll()]);
    expect([first, second].sort()).toEqual([false, true]);
    expect(await t.prisma.snapshot.count()).toBe(3);
    const events = (await call(`${t.api}/audit-events?action=retention.applied`, { token: admin.jwt })).body.events;
    expect(events[0].actor).toMatchObject({ type: 'anonymous', label: 'Retention policy' });
  });

  it('keeps everything without a retention period or license', async () => {
    await history();
    expect((await runNow()).status).toBe(400);
    await t.app.get(MaintenanceService).runAll();
    expect(await t.prisma.snapshot.count()).toBe(6);

    await call(`${t.api}/license`, { method: 'DELETE', token: admin.jwt });
    expect((await setRetention(30)).status).toBe(403);
  });

  it('validates the period and needs maintainers', async () => {
    for (const days of [0, 5000, 1.5, 'week']) expect((await setRetention(days)).status).toBe(400);
    expect((await setRetention(30)).body.retentionDays).toBe(30);
    expect((await setRetention(null)).body.retentionDays).toBeNull();
    const reviewer = await admin.inviteUser('r@optik.test', { projectSlug: 'shop', projectRole: 'reviewer' });
    const res = await call(`${t.api}/projects/shop/retention`, { method: 'PUT', token: reviewer.jwt, json: { days: 30 } });
    expect(res.status).toBe(403);
  });

  describe('storage', () => {
    it('shows what each project stores, and measures older images', async () => {
      const { b } = await history();
      const usage = (await call(`${t.api}/projects/shop/storage`, { token: admin.jwt })).body;
      expect(usage).toMatchObject({ slug: 'shop', runs: 4, snapshots: 6, unmeasured: 0 });
      expect(usage.bytes).toBeGreaterThan(0);
      expect(usage.images).toBeGreaterThan(0);

      // Images stored before optik recorded sizes are measured by the daily job
      await t.prisma.snapshot.update({ where: { id: b.snapshots.Button.id }, data: { imageBytes: null, diffBytes: null } });
      expect((await call(`${t.api}/projects/shop/storage`, { token: admin.jwt })).body.unmeasured).toBe(1);
      await t.app.get(MaintenanceService).runAll();
      const measured = (await call(`${t.api}/projects/shop/storage`, { token: admin.jwt })).body;
      expect(measured).toMatchObject({ unmeasured: 0, bytes: usage.bytes });

      const overview = (await call(`${t.api}/storage`, { token: admin.jwt })).body;
      expect(overview).toEqual([expect.objectContaining({ slug: 'shop', bytes: usage.bytes })]);
      const member = await admin.inviteUser('m@optik.test');
      expect((await call(`${t.api}/storage`, { token: member.jwt })).status).toBe(403);
    });
  });
});
