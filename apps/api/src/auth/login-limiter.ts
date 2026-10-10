/**
 * Limits failed sign-in attempts per account (email), against password
 * guessing. Counted per email rather than per IP: sign-ins from the web UI all
 * reach the API from the web server's address, and client IPs behind proxies
 * can be spoofed.
 *
 * The failures live in a FailureStore — the database in production, so all
 * instances behind a load balancer share one limit.
 */
export class LoginLimiter {
  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly store: FailureStore = new MemoryFailureStore(),
  ) {}

  /** Seconds until the next attempt is allowed, or 0 if it is allowed now. */
  async retryAfter(email: string, now = Date.now()): Promise<number> {
    const recent = await this.store.recent(key(email), now - this.windowMs);
    if (recent.length < this.maxFailures) return 0;
    return Math.ceil((Math.min(...recent) + this.windowMs - now) / 1000);
  }

  recordFailure(email: string, now = Date.now()): Promise<void> {
    return this.store.add(key(email), now, now - this.windowMs);
  }

  reset(email: string): Promise<void> {
    return this.store.clear(key(email));
  }
}

/** Failure timestamps (ms) per account. */
export interface FailureStore {
  /** Failures after `since` */
  recent(email: string, since: number): Promise<number[]>;
  /** Adds a failure and forgets those before `since` */
  add(email: string, at: number, since: number): Promise<void>;
  clear(email: string): Promise<void>;
}

/** For tests and single instances. */
export class MemoryFailureStore implements FailureStore {
  private readonly failures = new Map<string, number[]>();

  async recent(email: string, since: number) {
    return (this.failures.get(email) ?? []).filter((t) => t > since);
  }

  async add(email: string, at: number, since: number) {
    this.failures.set(email, [...(await this.recent(email, since)), at]);
  }

  async clear(email: string) {
    this.failures.delete(email);
  }
}

const key = (email: string) => email.trim().toLowerCase();
