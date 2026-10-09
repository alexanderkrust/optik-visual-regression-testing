import { existsSync } from 'fs';
import { join } from 'path';
import { PNG } from 'pngjs';
import {
  AdapterClient,
  AdminClient,
  call,
  png,
  resetDatabase,
  startApp,
  TestApp,
} from './helpers';

const WHITE = png(255);
const BLACK = png(0);
const GRAY = png(128);

describe('snapshot comparison and review', () => {
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

  /** Submits one snapshot named "Button" in a fresh, completed run. */
  const snapshot = async (image: Buffer) =>
    (await adapter.fullRun({ Button: image })).snapshots.Button;

  /**
   * Same, but leaves the run open. A completed run with only unchanged
   * snapshots is merged into the previous run and deleted, so tests that look
   * at an unchanged snapshot afterwards use an open run.
   */
  const snapshotInOpenRun = async (image: Buffer) => {
    const { id } = (await adapter.startRun()).body;
    return (await adapter.submit(id, 'Button', image)).body;
  };

  describe('comparison with the baseline', () => {
    it('makes the first snapshot the baseline', async () => {
      const first = await snapshot(WHITE);
      expect(first).toMatchObject({ status: 'new', baselineId: null, diffScore: null });
    });

    it('marks an identical snapshot as unchanged', async () => {
      const first = await snapshot(WHITE);
      const second = await snapshot(WHITE);
      expect(second).toMatchObject({ status: 'unchanged', baselineId: first.id, diffScore: 0 });
    });

    it('marks a different snapshot as pending with a review link', async () => {
      await snapshot(WHITE);
      const changed = await snapshot(BLACK);
      expect(changed).toMatchObject({ status: 'pending', diffScore: 1 });
      expect(changed.reviewPath).toBe(`/shop/${changed.runId}?snapshot=${changed.id}`);
    });

    it('treats a size change as a visual change', async () => {
      await snapshot(WHITE);
      const taller = await snapshot(png(255, 10, 20));
      expect(taller.status).toBe('pending');
      expect(taller.diffScore).toBeCloseTo(0.5);
    });

    it('compares each snapshot name separately', async () => {
      await adapter.fullRun({ Button: WHITE, Card: BLACK });
      const next = await adapter.fullRun({ Button: WHITE, Card: WHITE });
      expect(next.snapshots.Button.status).toBe('unchanged');
      expect(next.snapshots.Card.status).toBe('pending');
    });
  });

  describe('review', () => {
    it('keeps failing while a change is not reviewed', async () => {
      await snapshot(WHITE);
      await snapshot(BLACK);
      expect((await snapshot(BLACK)).status).toBe('pending');
    });

    it('accepting a change makes it the new baseline', async () => {
      await snapshot(WHITE);
      const changed = await snapshot(BLACK);

      const res = await admin.review(changed.id, 'approved');
      expect(res.body.status).toBe('approved');

      const next = await snapshot(BLACK);
      expect(next).toMatchObject({ status: 'unchanged', baselineId: changed.id });
      expect((await snapshot(WHITE)).status).toBe('pending');
    });

    it('rejecting a change keeps the previous baseline', async () => {
      const first = await snapshot(WHITE);
      const changed = await snapshot(BLACK);
      await admin.review(changed.id, 'rejected');

      expect((await snapshot(BLACK)).status).toBe('pending');
      expect(await snapshot(WHITE)).toMatchObject({ status: 'unchanged', baselineId: first.id });
    });

    it('lets a reviewer change their decision', async () => {
      await snapshot(WHITE);
      const changed = await snapshot(BLACK);
      await admin.review(changed.id, 'rejected');
      expect((await admin.review(changed.id, 'approved')).body.status).toBe('approved');
    });

    it('uses the most recently accepted change as baseline', async () => {
      await snapshot(WHITE);
      await admin.review((await snapshot(BLACK)).id, 'approved');
      const gray = await snapshot(GRAY);
      await admin.review(gray.id, 'approved');

      expect(await snapshot(GRAY)).toMatchObject({ status: 'unchanged', baselineId: gray.id });
    });

    it('only allows reviewing snapshots with visual changes', async () => {
      const first = await snapshot(WHITE);
      const same = await snapshotInOpenRun(WHITE);
      expect((await admin.review(first.id, 'approved')).status).toBe(400);
      expect((await admin.review(same.id, 'rejected')).status).toBe(400);
    });

    it('only accepts "approved" or "rejected"', async () => {
      await snapshot(WHITE);
      const changed = await snapshot(BLACK);
      expect((await admin.review(changed.id, 'pending' as any)).status).toBe(400);
      expect((await admin.review(changed.id, undefined as any)).status).toBe(400);
    });

    it('requires a signed-in user', async () => {
      await snapshot(WHITE);
      const changed = await snapshot(BLACK);
      const res = await call(`${t.api}/snapshots/${changed.id}/status`, {
        method: 'PATCH',
        json: { status: 'approved' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('images', () => {
    /** Signed URLs in the DTOs are relative to the server (they start with /api). */
    const fetchUrl = (url: string, token?: string) =>
      call<Buffer>(new URL(url, t.api).toString(), { token });
    const unsigned = (id: string, kind: 'image' | 'diff' = 'image', token?: string) =>
      call<Buffer>(`${t.api}/snapshots/${id}/${kind}`, { token });

    it('serves the screenshot, the baseline and, for changes, the diff via signed URLs', async () => {
      const first = await snapshot(WHITE);
      const changed = await snapshot(BLACK);
      expect(first.diffUrl).toBeNull();

      const img = await fetchUrl(changed.imageUrl);
      expect(img.status).toBe(200);
      expect(img.headers.get('content-type')).toBe('image/png');
      expect(img.body.equals(BLACK)).toBe(true);

      expect((await fetchUrl(changed.baselineImageUrl)).body.equals(WHITE)).toBe(true);

      const diff = await fetchUrl(changed.diffUrl);
      expect(diff.status).toBe(200);
      expect(PNG.sync.read(diff.body).width).toBe(10);
    });

    it('keeps images private without a valid signature or sign-in', async () => {
      await snapshot(WHITE);
      const changed = await snapshot(BLACK);
      const other = await snapshot(GRAY);

      expect((await unsigned(changed.id)).status).toBe(401);
      expect((await unsigned(changed.id, 'diff')).status).toBe(401);

      // A signature only fits its own snapshot and kind
      const query = new URL(changed.imageUrl, t.api).search;
      expect((await fetchUrl(`/api/snapshots/${other.id}/image${query}`)).status).toBe(401);
      expect((await fetchUrl(`/api/snapshots/${changed.id}/diff${query}`)).status).toBe(401);
      expect((await fetchUrl(changed.imageUrl.replace(/signature=./, 'signature=x'))).status).toBe(401);

      // Project tokens are for adapters, not for reading images
      expect((await unsigned(changed.id, 'image', (adapter as any).token)).status).toBe(401);
    });

    it('also serves images to signed-in users (JWT)', async () => {
      await snapshot(WHITE);
      const changed = await snapshot(BLACK);
      expect((await unsigned(changed.id, 'image', admin.jwt)).status).toBe(200);
    });

    it('returns fresh signed URLs after a review', async () => {
      await snapshot(WHITE);
      const changed = await snapshot(BLACK);
      const reviewed = (await admin.review(changed.id, 'approved')).body;
      expect((await fetchUrl(reviewed.imageUrl)).status).toBe(200);
      expect((await fetchUrl(reviewed.diffUrl)).status).toBe(200);
    });

    it('serves the baseline image for unchanged snapshots without storing a copy', async () => {
      await snapshot(WHITE);
      const same = await snapshotInOpenRun(WHITE);
      expect(same.status).toBe('unchanged');

      const img = await fetchUrl(same.imageUrl);
      expect(img.status).toBe(200);
      expect(img.body.equals(WHITE)).toBe(true);

      const stored = join(process.env.STORAGE_DIR!, 'runs', same.runId, `${same.id}.png`);
      expect(existsSync(stored)).toBe(false);
    });

    it('returns 404 for unknown snapshots', async () => {
      expect((await unsigned('00000000-0000-0000-0000-000000000000', 'image', admin.jwt)).status).toBe(404);
    });
  });

  describe('invalid submissions', () => {
    it('rejects a missing file or name', async () => {
      const { id } = (await adapter.startRun()).body;
      const form = new FormData();
      form.append('runId', id);
      const res = await call(`${t.api}/snapshots`, {
        token: (adapter as any).token,
        form,
      });
      expect(res.status).toBe(400);
    });

    it('rejects an unknown run', async () => {
      const res = await adapter.submit('00000000-0000-0000-0000-000000000000', 'Button', WHITE);
      expect(res.status).toBe(404);
    });

    it('rejects something that is not a PNG once there is a baseline', async () => {
      const { id } = (await adapter.startRun()).body;
      await adapter.submit(id, 'Button', WHITE);
      const res = await adapter.submit(id, 'Button', Buffer.from('not a png'));
      expect(res.status).toBe(400);
    });
  });
});
