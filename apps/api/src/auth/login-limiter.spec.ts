import { LoginLimiter } from './login-limiter';

describe('LoginLimiter', () => {
  const minute = 60_000;

  it('allows attempts until the limit of failures is reached', () => {
    const limiter = new LoginLimiter(3, 15 * minute);
    for (let i = 0; i < 2; i++) limiter.recordFailure('a@b.c', 0);
    expect(limiter.retryAfter('a@b.c', 0)).toBe(0);
    limiter.recordFailure('a@b.c', 0);
    expect(limiter.retryAfter('a@b.c', minute)).toBe(14 * 60);
  });

  it('counts per account, case-insensitively', () => {
    const limiter = new LoginLimiter(1, minute);
    limiter.recordFailure('Admin@Example.com', 0);
    expect(limiter.retryAfter('admin@example.com', 0)).toBeGreaterThan(0);
    expect(limiter.retryAfter('other@example.com', 0)).toBe(0);
  });

  it('forgets failures after the window and on success', () => {
    const limiter = new LoginLimiter(1, minute);
    limiter.recordFailure('a@b.c', 0);
    expect(limiter.retryAfter('a@b.c', minute + 1)).toBe(0);

    limiter.recordFailure('a@b.c', 0);
    limiter.reset('a@b.c');
    expect(limiter.retryAfter('a@b.c', 0)).toBe(0);
  });
});
