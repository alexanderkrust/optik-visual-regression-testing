import { execFileSync } from 'child_process';
import { join } from 'path';
import { Client } from 'pg';
import { testDatabaseUrl } from './test-db';

/** Creates the test database if needed and applies all migrations. */
export default async function globalSetup() {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }

  execFileSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: join(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: 'pipe',
    },
  );
}
