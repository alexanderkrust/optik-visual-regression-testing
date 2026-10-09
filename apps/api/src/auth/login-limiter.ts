/**
 * Limits failed sign-in attempts per account (email), against password
 * guessing. Counted per email rather than per IP: sign-ins from the web UI all
 * reach the API from the web server's address, and client IPs behind proxies
 * can be spoofed.
 *
 * In memory, i.e. per optik instance — with several replicas an attacker gets
 * the limit once per replica, which still makes guessing impractical.
 */
export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
  ) {}

  /** Seconds until the next attempt is allowed, or 0 if it is allowed now. */
  retryAfter(email: string, now = Date.now()): number {
    const recent = this.recent(email, now);
    if (recent.length < this.maxFailures) return 0;
    return Math.ceil((recent[0] + this.windowMs - now) / 1000);
  }

  recordFailure(email: string, now = Date.now()) {
    this.failures.set(key(email), [...this.recent(email, now), now]);
  }

  reset(email: string) {
    this.failures.delete(key(email));
  }

  private recent(email: string, now: number): number[] {
    const recent = (this.failures.get(key(email)) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length === 0) this.failures.delete(key(email));
    return recent;
  }
}

const key = (email: string) => email.trim().toLowerCase();
