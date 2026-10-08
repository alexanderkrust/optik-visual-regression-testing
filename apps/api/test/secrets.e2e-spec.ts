import { ensureSecrets } from '../src/bootstrap/env';
import { resetDatabase, startApp, TestApp } from './helpers';

describe('generated secrets', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.app.close());
  beforeEach(() => resetDatabase(t.prisma));

  const env = (vars: Record<string, string> = {}): NodeJS.ProcessEnv => ({
    DATABASE_URL: process.env.DATABASE_URL,
    ...vars,
  });

  it('generates missing secrets once and reuses them', async () => {
    const first = env();
    await ensureSecrets(first);
    expect(first.JWT_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(first.SESSION_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(first.JWT_SECRET).not.toBe(first.SESSION_SECRET);

    // A restart (or a second instance) gets the same values
    const second = env();
    await ensureSecrets(second);
    expect(second.JWT_SECRET).toBe(first.JWT_SECRET);
    expect(second.SESSION_SECRET).toBe(first.SESSION_SECRET);
  });

  it('agrees on one value when instances start at the same time', async () => {
    const instances = [env(), env(), env()];
    await Promise.all(instances.map((e) => ensureSecrets(e)));
    expect(new Set(instances.map((e) => e.JWT_SECRET)).size).toBe(1);
  });

  it('prefers configured secrets', async () => {
    const configured = env({ JWT_SECRET: 'from-env', SESSION_SECRET: 'also-from-env' });
    await ensureSecrets(configured);
    expect(configured).toMatchObject({ JWT_SECRET: 'from-env', SESSION_SECRET: 'also-from-env' });
    expect(await t.prisma.instanceSetting.count()).toBe(0);
  });

  it('never uses the placeholder from .env.example', async () => {
    const placeholder = env({ JWT_SECRET: 'replace-with-a-long-random-secret' });
    await ensureSecrets(placeholder);
    expect(placeholder.JWT_SECRET).toMatch(/^[0-9a-f]{64}$/);
  });
});
