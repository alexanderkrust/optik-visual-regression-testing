import { PNG } from 'pngjs';
import { AdapterClient, AdminClient, call, png, resetDatabase, startApp, TestApp } from './helpers';

const WHITE = png(255);
const GRAY = png(128);

/** A white 10×10 PNG with a black 3×3 block in the top left corner. */
function withBlock(): Buffer {
  const image = PNG.sync.read(png(255));
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const i = (row * 10 + col) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 0;
    }
  }
  return PNG.sync.write(image);
}

type Variant = { browser?: string; viewport?: string };

describe('browsers and viewports', () => {
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

  /** One run with the given variants of "Button"; returns the submitted snapshots in order. */
  async function run(shots: [Variant, Buffer][]) {
    const started = (await adapter.startRun('main', 'abc1234')).body;
    const results = [];
    for (const [variant, image] of shots) {
      const res = await adapter.submit(started.id, 'Button', image, variant);
      expect(res.status).toBe(201);
      results.push(res.body);
    }
    await adapter.complete(started.id);
    return results;
  }

  const chromium = { browser: 'chromium', viewport: '1280x720' };
  const firefox = { browser: 'firefox', viewport: '1280x720' };
  const mobile = { browser: 'chromium', viewport: '375x667' };

  it('compares each browser and viewport with its own baseline', async () => {
    const first = await run([
      [chromium, WHITE],
      [firefox, GRAY],
      [mobile, WHITE],
    ]);
    expect(first.map((s) => s.status)).toEqual(['new', 'new', 'new']);
    expect(first[1]).toMatchObject({ name: 'Button', browser: 'firefox', viewport: '1280x720' });

    // Firefox renders differently from Chromium — that is not a change
    const same = await run([
      [chromium, WHITE],
      [firefox, GRAY],
      [mobile, WHITE],
    ]);
    expect(same.map((s) => s.status)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    expect(same.map((s) => s.baselineId)).toEqual(first.map((s) => s.id));

    // Only the mobile viewport changed
    const changed = await run([
      [chromium, WHITE],
      [firefox, GRAY],
      [mobile, GRAY],
    ]);
    expect(changed.map((s) => s.status)).toEqual(['unchanged', 'unchanged', 'pending']);

    const listed = await call(`${t.api}/snapshots?runId=${changed[0].runId}`, { token: admin.jwt });
    expect(listed.body.map((s: { browser: string; viewport: string }) => `${s.browser} ${s.viewport}`)).toEqual([
      'chromium 1280x720',
      'firefox 1280x720',
      'chromium 375x667',
    ]);
  });

  it('carries baselines without a variant over when adapters start sending one', async () => {
    const [legacy] = await run([[{}, WHITE]]);
    expect(legacy).toMatchObject({ browser: '', viewport: '' });

    // After upgrading the adapter: the old baseline still counts …
    const [upgraded] = await run([[chromium, WHITE]]);
    expect(upgraded).toMatchObject({ status: 'unchanged', baselineId: legacy.id });

    // … until the variant has a baseline of its own
    const [changed] = await run([[chromium, GRAY]]);
    expect(changed.status).toBe('pending');
    expect((await admin.review(changed.id, 'approved')).status).toBe(200);
    const [next] = await run([[chromium, GRAY]]);
    expect(next).toMatchObject({ status: 'unchanged', baselineId: changed.id });
  });

  it('auto-approves an identical image only within the same variant', async () => {
    await run([[chromium, WHITE], [firefox, WHITE]]);
    const [changed] = await run([[chromium, GRAY]]);
    await admin.review(changed.id, 'approved');

    // The same pixels in another browser were not reviewed there
    const [other] = await run([[firefox, GRAY]]);
    expect(other.status).toBe('pending');
  });

  it('applies ignore regions per viewport, to every browser', async () => {
    await run([[chromium, WHITE], [firefox, WHITE], [mobile, WHITE]]);
    const changed = await run([[chromium, withBlock()], [firefox, withBlock()], [mobile, withBlock()]]);
    expect(changed.map((s) => s.status)).toEqual(['pending', 'pending', 'pending']);

    const res = await call(`${t.api}/snapshots/${changed[0].id}/settings`, {
      method: 'PUT',
      token: admin.jwt,
      json: { ignoreRegions: [{ x: 0, y: 0, width: 3, height: 3 }], threshold: 0 },
    });
    expect(res.status).toBe(200);

    // Chromium and Firefox at 1280x720 are resolved; the mobile viewport is not
    const listed = (await call(`${t.api}/snapshots?runId=${changed[0].runId}`, { token: admin.jwt })).body;
    expect(listed.map((s: { status: string }) => s.status)).toEqual(['unchanged', 'unchanged', 'pending']);
    expect(listed[1].settings.ignoreRegions).toHaveLength(1);
    expect(listed[2].settings.ignoreRegions).toHaveLength(0);
  });

  it('uses settings saved without a viewport for viewports without their own', async () => {
    const [legacy] = await run([[{}, WHITE]]);
    await call(`${t.api}/snapshots/${legacy.id}/settings`, {
      method: 'PUT',
      token: admin.jwt,
      json: { ignoreRegions: [{ x: 0, y: 0, width: 3, height: 3 }], threshold: 0 },
    });
    const [upgraded] = await run([[mobile, withBlock()]]);
    expect(upgraded.status).toBe('unchanged');
    expect(upgraded.settings.ignoreRegions).toHaveLength(1);
  });

  it('rejects malformed variants', async () => {
    const started = (await adapter.startRun()).body;
    const badViewport = await adapter.submit(started.id, 'Button', WHITE, { viewport: 'wide' });
    expect(badViewport.status).toBe(400);
    expect(badViewport.body.message).toMatch(/1280x720/);
    const badBrowser = await adapter.submit(started.id, 'Button', WHITE, { browser: '<script>' });
    expect(badBrowser.status).toBe(400);
    // Case and spaces don't make a different variant
    const ok = await adapter.submit(started.id, 'Button', WHITE, { browser: ' Chromium ', viewport: '1280X720' });
    expect(ok.body).toMatchObject({ browser: 'chromium', viewport: '1280x720' });
  });
});
