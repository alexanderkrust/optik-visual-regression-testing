import type { ConfigService } from '@nestjs/config';
import { PNG } from 'pngjs';
import { DiffService } from './diff.service';

const config = (workers: string) =>
  ({ get: (key: string) => (key === 'DIFF_WORKERS' ? workers : undefined) }) as unknown as ConfigService;

function png(gray: number, width = 10, height = 10): Buffer {
  const image = new PNG({ width, height });
  for (let i = 0; i < image.data.length; i += 4) {
    image.data.fill(gray, i, i + 3);
    image.data[i + 3] = 255;
  }
  return PNG.sync.write(image);
}

describe('DiffService', () => {
  const pooled = new DiffService(config('2'));
  const inline = new DiffService(config('0'));
  afterAll(() => pooled.onModuleDestroy());

  it('runs analysis in worker threads', () => {
    expect((pooled as any).pool).not.toBeNull();
    expect((inline as any).pool).toBeNull();
  });

  it('gives the same results in the pool and inline', async () => {
    const input = { image: png(0), baseline: png(255) };
    const [a, b] = await Promise.all([pooled.analyse(input), inline.analyse(input)]);
    expect(a.imageHash).toBe(b.imageHash);
    expect(a.diff).toMatchObject({ diffCount: 100, diffScore: 1, sizeChanged: false });
    expect(Buffer.isBuffer(a.diff!.diffImage)).toBe(true);
    expect(Buffer.from(a.diff!.diffImage).equals(Buffer.from(b.diff!.diffImage))).toBe(true);
  });

  it('only hashes when there is no baseline', async () => {
    expect((await pooled.analyse({ image: png(0), baseline: null })).diff).toBeNull();
  });

  it('rejects images that are not PNGs', async () => {
    await expect(pooled.analyse({ image: Buffer.from('nope'), baseline: null })).rejects.toThrow();
  });

  // Starting a second worker through ts-node takes a few seconds in tests
  it('runs several analyses in parallel', async () => {
    const pool = (pooled as any).pool;
    const big = { image: png(0, 600, 600), baseline: png(255, 600, 600) };
    await Promise.all([pooled.analyse(big), pooled.analyse(big), pooled.analyse(big)]);
    expect(pool.threads.length).toBe(2);
    expect(pool.completed).toBeGreaterThanOrEqual(3);
  }, 30_000);
});
