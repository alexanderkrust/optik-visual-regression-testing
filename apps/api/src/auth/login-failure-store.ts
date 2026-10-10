import { PrismaService } from '../database/prisma.service';
import type { FailureStore } from './login-limiter';

/** Failed sign-ins in the database, shared by all instances. */
export class DatabaseFailureStore implements FailureStore {
  constructor(private readonly prisma: PrismaService) {}

  async recent(email: string, since: number) {
    const row = await this.prisma.loginFailure.findUnique({ where: { email } });
    return (row?.failedAt ?? []).map(Number).filter((t) => t > since);
  }

  /** Atomic, so concurrent failures on different instances all count. */
  async add(email: string, at: number, since: number) {
    await this.prisma.$executeRaw`
      INSERT INTO login_failures (email, failed_at) VALUES (${email}, ARRAY[${BigInt(at)}::bigint])
      ON CONFLICT (email) DO UPDATE SET failed_at = array_append(
        ARRAY(SELECT t FROM unnest(login_failures.failed_at) AS t WHERE t > ${BigInt(since)}),
        ${BigInt(at)}::bigint
      )`;
  }

  async clear(email: string) {
    await this.prisma.loginFailure.deleteMany({ where: { email } });
  }

  /** Housekeeping: rows whose failures are all older than `since`. */
  async prune(since: number) {
    return this.prisma.$executeRaw`
      DELETE FROM login_failures WHERE NOT EXISTS (SELECT 1 FROM unnest(failed_at) AS t WHERE t > ${BigInt(since)})`;
  }
}
