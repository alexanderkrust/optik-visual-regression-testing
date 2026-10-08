import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { testDatabaseUrl } from './test-db';

// Set before the app (and its .env loading) starts — dotenv never overrides
// variables that already exist, so the root .env cannot leak into the tests.
Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl(),
  JWT_SECRET: 'test-jwt-secret',
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
  // Local file storage in a fresh temp directory instead of S3
  S3_BUCKET: '',
  STORAGE_DIR: mkdtempSync(join(tmpdir(), 'optik-test-')),
  // No admin from the environment: tests control user creation
  ADMIN_EMAIL: '',
  ADMIN_PASSWORD: '',
});
