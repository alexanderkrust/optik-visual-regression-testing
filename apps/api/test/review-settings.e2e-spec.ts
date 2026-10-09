import { existsSync } from 'fs';
import { join } from 'path';
import { PNG } from 'pngjs';
import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';

const WHITE = png(255);

/** A white 10×10 PNG with a black block. */
function withBlock(x: number, y: number, width: number, height: number): Buffer {
  const image = PNG.sync.read(png(255));
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      const i = (row * 10 + col) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 0;
    }
  }
  return PNG.sync.write(image);
}

describe('ignore regions, thresholds and comments', () => {
  let t: TestApp;
  let admin: AdminClient;
  let adapter: AdapterClient;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.app.close());
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    admin = await AdminClient.setup(t.api);
    await admin.createProject('shop');
    adapter = new AdapterClient(t.api, await admin.createToken('shop'));
  });

  const snapshot = async (image: Buffer, suite?: string) =>
    (await adapter.fullRun({ Button: image }, 'main', 'abc1234', suite)).snapshots.Button;

  const setSettings = (id: string, settings: object, token = admin.jwt) =>
    call(`${t.api}/snapshots/${id}/settings`, { method: 'PUT', token, json: settings });

  describe('ignore regions', () => {
    it('resolves an open change inside the region and ignores it from then on', async () => {
      await snapshot(WHITE);
      const changed = await snapshot(withBlock(0, 0, 3, 3));
      expect(changed.status).toBe('pending');

      const res = await setSettings(changed.id, {
        ignoreRegions: [{ x: 0, y: 0, width: 3, height: 3 }],
        threshold: 0,
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'unchanged',
        settings: { ignoreRegions: [{ x: 0, y: 0, width: 3, height: 3 }], threshold: 0 },
      });
      expect((await admin.run(changed.runId)).body.pendingCount).toBe(0);
      // The resolved change still shows its own image
      const image = await call(`${t.api}/snapshots/${changed.id}/image`, { token: admin.jwt });
      expect(PNG.sync.read(image.body).data.equals(PNG.sync.read(withBlock(0, 0, 3, 3)).data)).toBe(true);

      expect((await snapshot(withBlock(1, 1, 2, 2))).status).toBe('unchanged');
      expect((await snapshot(withBlock(5, 5, 2, 2))).status).toBe('pending');
    });

    it('leaves changes outside the regions open', async () => {
      await snapshot(WHITE);
      const changed = await snapshot(withBlock(5, 5, 3, 3));
      const res = await setSettings(changed.id, {
        ignoreRegions: [{ x: 0, y: 0, width: 3, height: 3 }],
        threshold: 0,
      });
      expect(res.body.status).toBe('pending');
    });

    it('marks ignored regions in the diff image', async () => {
      await snapshot(WHITE);
      const first = await snapshot(withBlock(5, 5, 2, 2));
      await setSettings(first.id, { ignoreRegions: [{ x: 0, y: 0, width: 2, height: 2 }], threshold: 0 });
      const changed = await snapshot(withBlock(5, 5, 2, 2));
      const diff = await call(`${t.api}/snapshots/${changed.id}/diff`, { token: admin.jwt });
      const image = PNG.sync.read(diff.body);
      const [r, g, b] = image.data.subarray(0, 3);
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g);
    });
  });

  describe('thresholds', () => {
    it('lets a share of pixels change, but not the size', async () => {
      const first = await snapshot(WHITE);
      await setSettings(first.id, { ignoreRegions: [], threshold: 0.05 });

      expect((await snapshot(withBlock(0, 0, 2, 2))).status).toBe('unchanged'); // 4 %
      expect((await snapshot(withBlock(0, 0, 3, 3))).status).toBe('pending'); // 9 %
      expect((await snapshot(png(255, 10, 11))).status).toBe('pending');
    });

    it('keeps the image and diff of changes within the threshold', async () => {
      const first = await snapshot(WHITE);
      await setSettings(first.id, { ignoreRegions: [], threshold: 0.05 });
      const block = withBlock(0, 0, 2, 2);
      const { id: runId } = (await adapter.startRun()).body;
      const tolerated = (await adapter.submit(runId, 'Button', block)).body;
      expect(tolerated).toMatchObject({ status: 'unchanged', diffScore: 0.04 });
      expect(tolerated.diffUrl).not.toBeNull();

      const image = await call(`${t.api}/snapshots/${tolerated.id}/image`, { token: admin.jwt });
      expect(PNG.sync.read(image.body).data.equals(PNG.sync.read(block).data)).toBe(true);
      expect((await call(`${t.api}/snapshots/${tolerated.id}/diff`, { token: admin.jwt })).status).toBe(200);
    });

    it('deletes those images when the clean run is merged', async () => {
      const first = await snapshot(WHITE);
      await setSettings(first.id, { ignoreRegions: [], threshold: 0.05 });
      await snapshot(WHITE);
      const { runId, snapshots, completed } = await adapter.fullRun({ Button: withBlock(0, 0, 2, 2) });
      expect(completed.id).not.toBe(runId);
      const stored = join(process.env.STORAGE_DIR!, 'runs', runId, `${snapshots.Button.id}.png`);
      expect(existsSync(stored)).toBe(false);
      expect(existsSync(stored.replace('.png', '.diff.png'))).toBe(false);
    });

    it('applies only to the snapshot name and suite', async () => {
      await adapter.fullRun({ Button: WHITE, Card: WHITE });
      await snapshot(WHITE, 'playwright');
      const changed = (await adapter.fullRun({ Button: withBlock(0, 0, 2, 2), Card: withBlock(0, 0, 2, 2) }))
        .snapshots;
      await setSettings(changed.Button.id, { ignoreRegions: [], threshold: 0.05 });

      const snapshots = (await call(`${t.api}/snapshots?runId=${changed.Button.runId}`, { token: admin.jwt })).body;
      const status = Object.fromEntries(snapshots.map((s: any) => [s.name, s.status]));
      expect(status).toEqual({ Button: 'unchanged', Card: 'pending' });
      expect((await snapshot(withBlock(0, 0, 2, 2), 'playwright')).status).toBe('pending');
    });
  });

  describe('settings', () => {
    it('are part of every snapshot', async () => {
      const first = await snapshot(WHITE);
      expect(first.settings).toEqual({ ignoreRegions: [], threshold: 0 });
      await setSettings(first.id, { ignoreRegions: [{ x: 1.4, y: 2, width: 3, height: 4 }], threshold: 0.01 });
      const list = (await call(`${t.api}/snapshots?runId=${first.runId}`, { token: admin.jwt })).body;
      expect(list[0].settings).toEqual({
        ignoreRegions: [{ x: 1, y: 2, width: 3, height: 4 }],
        threshold: 0.01,
      });
    });

    it('rejects invalid settings', async () => {
      const { id } = await snapshot(WHITE);
      const invalid = [
        { ignoreRegions: [], threshold: 2 },
        { ignoreRegions: [], threshold: 'a lot' },
        { ignoreRegions: [{ x: -1, y: 0, width: 1, height: 1 }], threshold: 0 },
        { ignoreRegions: [{ x: 0, y: 0, width: 0, height: 1 }], threshold: 0 },
        { ignoreRegions: [{ x: 0, y: 0 }], threshold: 0 },
        { ignoreRegions: Array(51).fill({ x: 0, y: 0, width: 1, height: 1 }), threshold: 0 },
      ];
      for (const settings of invalid) expect((await setSettings(id, settings)).status).toBe(400);
    });

    it('need the reviewer role', async () => {
      const { id } = await snapshot(WHITE);
      const viewer = await admin.inviteUser('v@optik.test', { projectSlug: 'shop', projectRole: 'viewer' });
      const outsider = await admin.inviteUser('o@optik.test');
      const settings = { ignoreRegions: [], threshold: 0.1 };
      expect((await setSettings(id, settings, viewer.jwt)).status).toBe(403);
      expect((await setSettings(id, settings, outsider.jwt)).status).toBe(404);
    });
  });

  describe('comments', () => {
    const comments = (id: string, token = admin.jwt) => call(`${t.api}/snapshots/${id}/comments`, { token });
    const comment = (id: string, body: unknown, token = admin.jwt) =>
      call(`${t.api}/snapshots/${id}/comments`, { token, json: { body } });
    const remove = (id: string, commentId: string, token = admin.jwt) =>
      call(`${t.api}/snapshots/${id}/comments/${commentId}`, { method: 'DELETE', token });

    it('can be written by reviewers and read by everyone in the project', async () => {
      const { id, runId } = await snapshot(WHITE);
      const reviewer = await admin.inviteUser('r@optik.test', { projectSlug: 'shop', projectRole: 'reviewer' });
      const viewer = await admin.inviteUser('v@optik.test', { projectSlug: 'shop', projectRole: 'viewer' });
      const outsider = await admin.inviteUser('o@optik.test');

      const created = await comment(id, '  The shadow is intended.  ', reviewer.jwt);
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ author: 'r@optik.test', body: 'The shadow is intended.' });

      expect((await comment(id, 'me too', viewer.jwt)).status).toBe(403);
      expect((await comments(id, outsider.jwt)).status).toBe(404);
      const list = await comments(id, viewer.jwt);
      expect(list.body.map((c: any) => c.body)).toEqual(['The shadow is intended.']);

      const snapshots = (await call(`${t.api}/snapshots?runId=${runId}`, { token: viewer.jwt })).body;
      expect(snapshots[0].commentCount).toBe(1);
    });

    it('rejects empty and overlong comments', async () => {
      const { id } = await snapshot(WHITE);
      expect((await comment(id, '   ')).status).toBe(400);
      expect((await comment(id, 42)).status).toBe(400);
      expect((await comment(id, 'x'.repeat(5001))).status).toBe(400);
    });

    it('can be deleted by their author or a maintainer', async () => {
      const { id } = await snapshot(WHITE);
      const alice = await admin.inviteUser('a@optik.test', { projectSlug: 'shop', projectRole: 'reviewer' });
      const bob = await admin.inviteUser('b@optik.test', { projectSlug: 'shop', projectRole: 'reviewer' });
      const first = (await comment(id, 'first', alice.jwt)).body;
      const second = (await comment(id, 'second', alice.jwt)).body;

      expect((await remove(id, first.id, bob.jwt)).status).toBe(403);
      expect((await remove(id, first.id, alice.jwt)).status).toBe(204);
      expect((await remove(id, second.id, admin.jwt)).status).toBe(204);
      expect((await remove(id, second.id, admin.jwt)).status).toBe(404);
      expect((await comments(id)).body).toEqual([]);
    });
  });
});
