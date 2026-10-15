import { AdapterClient, AdminClient, png, pngClaiming, resetDatabase, startApp, TestApp } from './helpers';

/**
 * Screenshots are checked against MAX_IMAGE_PIXELS before they are decoded:
 * a small PNG can claim dimensions whose pixels take gigabytes.
 */
describe('image size limits', () => {
  let t: TestApp;
  let adapter: AdapterClient;

  const setup = async (maxPixels?: string) => {
    if (maxPixels === undefined) delete process.env.MAX_IMAGE_PIXELS;
    else process.env.MAX_IMAGE_PIXELS = maxPixels;
    t = await startApp();
  };
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    const admin = await AdminClient.setup(t.api);
    await admin.createProject('shop');
    adapter = new AdapterClient(t.api, await admin.createToken('shop'));
  });
  afterAll(() => delete process.env.MAX_IMAGE_PIXELS);

  describe('by default', () => {
    beforeAll(() => setup());
    afterAll(() => t.app.close());

    it('rejects a PNG that claims 10 gigapixels, without decoding it', async () => {
      const bomb = pngClaiming(100_000, 100_000);
      expect(bomb.length).toBeLessThan(100);
      const { id } = (await adapter.startRun()).body;
      const res = await adapter.submit(id, 'Bomb', bomb);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'Snapshot "Bomb": The image is 100000×100000 pixels (10000 megapixels); ' +
          'at most 50 megapixels are allowed (MAX_IMAGE_PIXELS)',
      );
    });

    it('accepts screenshots below 50 megapixels', async () => {
      const { id } = (await adapter.startRun()).body;
      expect((await adapter.submit(id, 'Page', png(255, 1280, 2000))).status).toBe(201);
    });
  });

  describe('with MAX_IMAGE_PIXELS', () => {
    beforeAll(() => setup('2500'));
    afterAll(() => t.app.close());

    it('applies the configured limit', async () => {
      const { id } = (await adapter.startRun()).body;
      expect((await adapter.submit(id, 'Square', png(255, 50, 50))).status).toBe(201);
      const res = await adapter.submit(id, 'Wide', png(255, 60, 50));
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'Snapshot "Wide": The image is 60×50 pixels (3000 pixels); at most 2500 pixels are allowed (MAX_IMAGE_PIXELS)',
      );
    });

    it('applies it to the comparison with the baseline', async () => {
      await adapter.fullRun({ Button: png(255, 51, 25) });
      const { id } = (await adapter.startRun()).body;
      // 25×50 is fine, but its comparison with the 51×25 baseline covers 51×50
      const res = await adapter.submit(id, 'Button', png(0, 25, 50));
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/The comparison with the baseline is 51×50 pixels \(2550 pixels\)/);
    });
  });
});
