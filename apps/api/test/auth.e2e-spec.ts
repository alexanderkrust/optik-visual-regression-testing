import { AdminClient, call, resetDatabase, startApp, TestApp } from './helpers';

describe('health, setup and authentication', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.app.close());
  beforeEach(() => resetDatabase(t.prisma));

  describe('health', () => {
    it('sends security headers', async () => {
      const res = await call(`${t.api}/health`);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
      expect(res.headers.get('x-powered-by')).toBeNull();
    });

    it('reports liveness and readiness', async () => {
      expect((await call(`${t.api}/health`)).body).toEqual({
        status: 'ok',
        version: require('../package.json').version,
      });
      expect((await call(`${t.api}/ready`)).body).toEqual({
        status: 'ok',
        checks: { database: true, storage: true },
      });
    });
  });

  describe('first-run setup', () => {
    it('is required until the first user exists', async () => {
      expect((await call(`${t.api}/auth/setup`)).body).toEqual({ required: true });

      await AdminClient.setup(t.api);

      expect((await call(`${t.api}/auth/setup`)).body).toEqual({ required: false });
    });

    it('signs the new admin in', async () => {
      const res = await call(`${t.api}/auth/register`, {
        json: { email: 'admin@optik.test', password: 'correct-horse' },
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { email: 'admin@optik.test' },
      });
    });

    it('can only create one admin', async () => {
      await AdminClient.setup(t.api);
      const res = await call(`${t.api}/auth/register`, {
        json: { email: 'intruder@optik.test', password: 'correct-horse' },
      });
      expect(res.status).toBe(403);
    });

    it('creates only one admin when two setups race', async () => {
      const attempts = await Promise.all(
        ['a', 'b', 'c'].map((n) =>
          call(`${t.api}/auth/register`, {
            json: { email: `${n}@optik.test`, password: 'correct-horse' },
          }),
        ),
      );
      expect(attempts.map((r) => r.status).sort()).toEqual([201, 403, 403]);
      expect(await t.prisma.user.count()).toBe(1);
    });

    it.each([
      [{ email: 'not-an-email', password: 'correct-horse' }, 'valid email'],
      [{ email: 'admin@optik.test', password: 'short' }, 'at least 8 characters'],
      [{ email: 'admin@optik.test' }, 'at least 8 characters'],
    ])('rejects invalid input %j', async (body, message) => {
      const res = await call(`${t.api}/auth/register`, { json: body });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain(message);
      expect(await t.prisma.user.count()).toBe(0);
    });
  });

  describe('admin from the environment (automated installs)', () => {
    afterEach(() => {
      process.env.ADMIN_EMAIL = '';
      process.env.ADMIN_PASSWORD = '';
    });

    it('creates the admin from ADMIN_EMAIL / ADMIN_PASSWORD on start', async () => {
      process.env.ADMIN_EMAIL = 'ops@optik.test';
      process.env.ADMIN_PASSWORD = 'from-the-environment';
      const second = await startApp();
      try {
        const res = await call(`${second.api}/auth/login`, {
          json: { email: 'ops@optik.test', password: 'from-the-environment' },
        });
        expect(res.status).toBe(200);
        expect((await call(`${second.api}/auth/setup`)).body).toEqual({ required: false });
      } finally {
        await second.app.close();
      }
    });

    it('does not add it when users already exist', async () => {
      await AdminClient.setup(t.api);
      process.env.ADMIN_EMAIL = 'ops@optik.test';
      process.env.ADMIN_PASSWORD = 'from-the-environment';
      const second = await startApp();
      await second.app.close();
      expect(await t.prisma.user.count()).toBe(1);
    });
  });

  describe('limiting failed sign-ins', () => {
    let limited: TestApp;

    beforeAll(async () => {
      process.env.LOGIN_MAX_FAILURES = '3';
      limited = await startApp();
      delete process.env.LOGIN_MAX_FAILURES;
    });
    afterAll(() => limited.app.close());

    const login = (email: string, password: string) =>
      call(`${limited.api}/auth/login`, { json: { email, password } });

    // The limiter lives in memory for the app's lifetime, so each test uses its own account
    it('blocks an account after too many failures — even with the right password', async () => {
      await AdminClient.setup(limited.api, 'admin@optik.test', 'correct-horse');
      for (let i = 0; i < 3; i++) expect((await login('admin@optik.test', 'wrong')).status).toBe(401);

      const blocked = await login('admin@optik.test', 'correct-horse');
      expect(blocked.status).toBe(429);
      expect(blocked.body.retryAfter).toBeGreaterThan(0);

      // Case and whitespace don't get around it; other accounts are unaffected
      expect((await login(' ADMIN@optik.test', 'correct-horse')).status).toBe(429);
      expect((await login('someone@optik.test', 'wrong')).status).toBe(401);
    });

    it('resets the count on a successful sign-in', async () => {
      await AdminClient.setup(limited.api, 'reset@optik.test', 'correct-horse');
      for (let i = 0; i < 2; i++) await login('reset@optik.test', 'wrong');
      expect((await login('reset@optik.test', 'correct-horse')).status).toBe(200);
      for (let i = 0; i < 2; i++) await login('reset@optik.test', 'wrong');
      expect((await login('reset@optik.test', 'correct-horse')).status).toBe(200);
    });
  });

  describe('login, refresh and logout', () => {
    beforeEach(() => AdminClient.setup(t.api, 'admin@optik.test', 'correct-horse'));

    const login = (password: string) =>
      call(`${t.api}/auth/login`, { json: { email: 'admin@optik.test', password } });

    it('issues tokens for valid credentials', async () => {
      const res = await login('correct-horse');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('admin@optik.test');
    });

    it('rejects a wrong password and an unknown user alike', async () => {
      expect((await login('wrong-password')).status).toBe(401);
      const unknown = await call(`${t.api}/auth/login`, {
        json: { email: 'nobody@optik.test', password: 'correct-horse' },
      });
      expect(unknown.status).toBe(401);
    });

    it('refreshes the access token until logout', async () => {
      const { refreshToken } = (await login('correct-horse')).body;

      const refreshed = await call(`${t.api}/auth/refresh`, { json: { refreshToken } });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));

      expect((await call(`${t.api}/auth/logout`, { json: { refreshToken } })).status).toBe(204);
      expect((await call(`${t.api}/auth/refresh`, { json: { refreshToken } })).status).toBe(401);
    });

    it('protects admin endpoints with the access token', async () => {
      const { accessToken } = (await login('correct-horse')).body;

      expect((await call(`${t.api}/projects`)).status).toBe(401);
      expect((await call(`${t.api}/projects`, { token: 'garbage' })).status).toBe(401);
      expect((await call(`${t.api}/projects`, { token: accessToken })).status).toBe(200);
    });
  });
});
