import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** Where snapshot and diff images are kept. */
interface StorageBackend {
  init(): Promise<void>;
  ping(): Promise<boolean>;
  put(key: string, body: Buffer): Promise<void>;
  /** Resolves to null if the object does not exist. */
  get(key: string): Promise<Buffer | null>;
  /** Removes the objects; missing ones are ignored. */
  delete(keys: string[]): Promise<void>;
  /** Bytes of an object, or null if it doesn't exist. */
  size(key: string): Promise<number | null>;
}

/**
 * Stores images in an S3-compatible bucket when S3_BUCKET is set, otherwise in
 * a local directory (STORAGE_DIR, default ./data) — so a small installation
 * needs no object storage at all.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly backend: StorageBackend;

  constructor(config: ConfigService) {
    const bucket = config.get<string>('S3_BUCKET');
    if (bucket) {
      this.backend = new S3Backend(bucket, config);
      this.logger.log(`Storing images in S3 bucket "${bucket}"`);
    } else {
      const dir = resolve(config.get<string>('STORAGE_DIR') ?? './data');
      this.backend = new FileBackend(dir);
      this.logger.log(`Storing images in ${dir}`);
    }
  }

  onModuleInit() {
    return this.backend.init();
  }

  /** True when the storage is reachable — used by the readiness check. */
  ping(): Promise<boolean> {
    return this.backend.ping();
  }

  put(key: string, body: Buffer): Promise<void> {
    return this.backend.put(key, body);
  }

  async get(key: string): Promise<Buffer> {
    const body = await this.backend.get(key);
    if (!body) throw new NotFoundException('Image not found');
    return body;
  }

  /** Removes images; missing ones are ignored. */
  async delete(keys: string[]): Promise<void> {
    if (keys.length > 0) await this.backend.delete(keys);
  }

  /** Bytes of a stored image, or null if it doesn't exist. */
  size(key: string): Promise<number | null> {
    return this.backend.size(key);
  }
}

class FileBackend implements StorageBackend {
  constructor(private readonly dir: string) {}

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  ping() {
    return access(this.dir).then(() => true, () => false);
  }

  async put(key: string, body: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  get(key: string) {
    return readFile(this.path(key)).catch((err) => {
      if (err.code === 'ENOENT') return null;
      throw err;
    });
  }

  async delete(keys: string[]) {
    await Promise.all(keys.map((key) => rm(this.path(key), { force: true })));
  }

  size(key: string) {
    return stat(this.path(key)).then(
      (s) => s.size,
      (err) => (err.code === 'ENOENT' ? null : Promise.reject(err)),
    );
  }

  private path(key: string) {
    const path = resolve(this.dir, key);
    // Keys are generated internally, but never allow escaping the storage dir
    if (!path.startsWith(this.dir + '/')) throw new Error(`Invalid storage key "${key}"`);
    return path;
  }
}

class S3Backend implements StorageBackend {
  private readonly logger = new Logger('S3Storage');
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    config: ConfigService,
  ) {
    this.client = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT') || undefined,
      region: config.get<string>('S3_REGION') ?? 'us-east-1',
      // Self-hosted S3 servers (SeaweedFS, Garage, MinIO, …) need path-style URLs
      forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE') !== 'false',
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  async init() {
    if (await this.ping()) return;
    this.logger.log(`Creating bucket "${this.bucket}"`);
    await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
  }

  ping() {
    return this.client
      .send(new HeadBucketCommand({ Bucket: this.bucket }))
      .then(() => true, () => false);
  }

  async put(key: string, body: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'image/png',
      }),
    );
  }

  async get(key: string) {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return Buffer.from(await res.Body!.transformToByteArray());
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      throw err;
    }
  }

  async size(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.ContentLength ?? 0;
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') return null;
      throw err;
    }
  }

  async delete(keys: string[]) {
    // DeleteObjects takes up to 1000 keys per request
    for (let i = 0; i < keys.length; i += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }
}
