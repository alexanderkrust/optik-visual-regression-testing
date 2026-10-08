import { NotFoundException } from '@nestjs/common';
import { StorageService } from '../src/storage/storage.service';
import { fakeConfig } from './fake-config';

/**
 * Runs against a real S3-compatible server when TEST_S3_ENDPOINT is set, e.g.
 * the SeaweedFS of the dev stack: TEST_S3_ENDPOINT=http://localhost:8333
 * (credentials default to the dev stack's docker/seaweedfs/s3.json).
 */
const endpoint = process.env.TEST_S3_ENDPOINT;
const describeS3 = endpoint ? describe : describe.skip;

describeS3('StorageService with S3', () => {
  const config = (overrides: Record<string, string> = {}) =>
    fakeConfig({
      S3_ENDPOINT: endpoint,
      // A fixed bucket: some servers (e.g. SeaweedFS) reserve resources per bucket
      S3_BUCKET: process.env.TEST_S3_BUCKET ?? 'optik-test',
      S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID ?? 'optik',
      S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY ?? 'optik-secret',
      ...overrides,
    });

  it('creates the bucket and stores images', async () => {
    const storage = new StorageService(config());
    expect((storage as any).backend.constructor.name).toBe('S3Backend');
    await storage.onModuleInit();
    expect(await storage.ping()).toBe(true);

    await storage.put('runs/r1/s1.png', Buffer.from('png-bytes'));
    expect((await storage.get('runs/r1/s1.png')).toString()).toBe('png-bytes');
    await expect(storage.get('runs/r1/missing.png')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is not ready with wrong credentials', async () => {
    const storage = new StorageService(config({ S3_SECRET_ACCESS_KEY: 'wrong' }));
    expect(await storage.ping()).toBe(false);
  });
});
