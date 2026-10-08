import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';
import { Pool } from 'pg';

const logger = new Logger('Config');

/**
 * Supports Docker / Kubernetes secrets: for every `NAME_FILE` variable, the
 * file's content becomes `NAME` (unless `NAME` is set explicitly).
 */
export function loadFileSecrets(env: NodeJS.ProcessEnv = process.env) {
  for (const [name, path] of Object.entries(env)) {
    if (!name.endsWith('_FILE') || !path) continue;
    const target = name.slice(0, -'_FILE'.length);
    if (env[target]) continue;
    env[target] = readFileSync(path, 'utf8').trim();
  }
}

/** Secrets optik generates on first start when they are not configured. */
const GENERATED_SECRETS = ['JWT_SECRET', 'SESSION_SECRET'] as const;

/** Values from .env.example that must never be used as real secrets. */
const PLACEHOLDER = /^replace-with/;

/**
 * Fills JWT_SECRET and SESSION_SECRET from the environment or, if missing,
 * from the database — generating and storing them on first start. Storing
 * them keeps sessions valid across restarts and multiple instances.
 */
export async function ensureSecrets(env: NodeJS.ProcessEnv = process.env) {
  const missing = GENERATED_SECRETS.filter(
    (name) => !env[name] || PLACEHOLDER.test(env[name]!),
  );
  if (missing.length === 0) return;

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    for (const name of missing) {
      const key = `secret.${name}`;
      // Insert-if-absent, so concurrently starting instances agree on one value
      await pool.query(
        'INSERT INTO instance_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
        [key, randomBytes(32).toString('hex')],
      );
      const { rows } = await pool.query<{ value: string }>(
        'SELECT value FROM instance_settings WHERE key = $1',
        [key],
      );
      env[name] = rows[0].value;
    }
    logger.log(`Using generated ${missing.join(', ')} (stored in the database)`);
  } finally {
    await pool.end();
  }
}
