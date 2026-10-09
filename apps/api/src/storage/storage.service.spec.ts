import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { StorageService } from './storage.service';

describe('StorageService with local files', () => {
  let storage: StorageService;

  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'optik-storage-'));
    // Only these values — Nest's ConfigService would prefer process.env
    const values: Record<string, string> = { STORAGE_DIR: dir };
    storage = new StorageService({ get: (key: string) => values[key] } as ConfigService);
    expect((storage as any).backend.constructor.name).toBe('FileBackend');
    await storage.onModuleInit();
  });

  it('stores and reads images by key', async () => {
    await storage.put('runs/r1/s1.png', Buffer.from('png-bytes'));
    expect((await storage.get('runs/r1/s1.png')).toString()).toBe('png-bytes');
  });

  it('throws NotFound for missing images', async () => {
    await expect(storage.get('runs/r1/missing.png')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes images and ignores missing ones', async () => {
    await storage.put('runs/r1/s2.png', Buffer.from('x'));
    await storage.delete(['runs/r1/s2.png', 'runs/r1/missing.png']);
    await expect(storage.get('runs/r1/s2.png')).rejects.toBeInstanceOf(NotFoundException);
    await expect(storage.delete(['../outside.png'])).rejects.toThrow(/Invalid storage key/);
  });

  it('is ready when the directory exists', async () => {
    expect(await storage.ping()).toBe(true);
  });

  it('refuses keys that escape the storage directory', async () => {
    await expect(storage.put('../outside.png', Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
    await expect(storage.get('runs/../../outside.png')).rejects.toThrow(/Invalid storage key/);
  });
});
