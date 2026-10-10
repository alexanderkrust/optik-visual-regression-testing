import { LoginLimiter } from './login-limiter';

describe('LoginLimiter', () => {
  const minute = 60_000;

  it('allows attempts until the limit of failures is reached', async () => {
    const limiter = new LoginLimiter(3, 15 * minute);
    for (let i = 0; i < 2; i++) await limiter.recordFailure('a@b.c', 0);
    expect(await limiter.retryAfter('a@b.c', 0)).toBe(0);
    await limiter.recordFailure('a@b.c', 0);
    expect(await limiter.retryAfter('a@b.c', minute)).toBe(14 * 60);
  });

  it('counts per account, case-insensitively', async () => {
    const limiter = new LoginLimiter(1, minute);
    await limiter.recordFailure('Admin@Example.com', 0);
    expect(await limiter.retryAfter('admin@example.com', 0)).toBeGreaterThan(0);
    expect(await limiter.retryAfter('other@example.com', 0)).toBe(0);
  });

  it('forgets failures after the window and on success', async () => {
    const limiter = new LoginLimiter(1, minute);
    await limiter.recordFailure('a@b.c', 0);
    expect(await limiter.retryAfter('a@b.c', minute + 1)).toBe(0);

    await limiter.recordFailure('a@b.c', 0);
    await limiter.reset('a@b.c');
    expect(await limiter.retryAfter('a@b.c', 0)).toBe(0);
  });
});
