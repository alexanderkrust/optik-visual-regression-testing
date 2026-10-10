import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { LoginLimiter } from './login-limiter';
import { AuditTrail } from '../audit/audit-trail';
import { LoginPolicy } from './login-policy';
import { DatabaseFailureStore } from './login-failure-store';
import { MaintenanceService } from '../maintenance/maintenance.service';

// Compared against when the email is unknown, so the response time doesn't
// reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('optik-timing-equaliser', 10);

// Local type aliases — the Prisma client may not have generated these yet
type UserRow = {
  id: string;
  email: string;
  password: string | null;
  role: 'admin' | 'member';
  deactivatedAt: Date | null;
  createdAt: Date;
};

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: 'admin' | 'member' };
}

/** Refresh tokens are 256-bit random values; only their SHA-256 is stored. */
const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

type RefreshTokenRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly loginLimiter: LoginLimiter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditTrail,
    private readonly policy: LoginPolicy,
    maintenance: MaintenanceService,
  ) {
    const windowMs = Number(config.get('LOGIN_LOCKOUT_MINUTES') ?? 15) * 60_000;
    const store = new DatabaseFailureStore(prisma);
    this.loginLimiter = new LoginLimiter(Number(config.get('LOGIN_MAX_FAILURES') ?? 10), windowMs, store);
    maintenance.register({
      name: 'sign-in failures',
      run: async () => {
        const pruned = await store.prune(Date.now() - windowMs);
        return pruned ? { pruned } : undefined;
      },
    });
  }

  async onModuleInit() {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');

    if (!email || !password) return;

    const count = await (this.prisma as any).user.count();
    if (count > 0) return;

    const hash = await bcrypt.hash(password, 10);
    await (this.prisma as any).user.create({ data: { email, password: hash, role: 'admin' } });
    this.logger.log(`Initial admin user created: ${email}`);
  }

  // ------------------------------------------------------------------ register
  /** True until the first user exists — the web UI then shows the setup page. */
  async setupRequired(): Promise<boolean> {
    return (await (this.prisma as any).user.count()) === 0;
  }

  async register(
    email: string,
    password: string,
  ): Promise<SessionTokens> {
    email = email?.trim() ?? '';
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email address is required');
    }
    if (!password || password.length < 8) {
      throw new BadRequestException('The password must have at least 8 characters');
    }
    const hash = await bcrypt.hash(password, 10);

    const user = (await this.prisma.$transaction(async (tx) => {
      // Serialise concurrent setup attempts so only one admin can be created
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(482113)`;
      if ((await tx.user.count()) > 0) {
        throw new ForbiddenException('Initial setup already complete');
      }
      // The first user administers the instance
      return tx.user.create({ data: { email, password: hash, role: 'admin' } });
    })) as UserRow;

    await this.audit.record({
      action: 'auth.setup',
      actor: { type: 'user', id: user.id, label: user.email },
      target: { type: 'user', id: user.id, label: user.email },
    });
    return this.issueTokens(user);
  }

  // --------------------------------------------------------------------- login
  async login(
    email: string,
    password: string,
  ): Promise<SessionTokens> {
    email = email?.trim() ?? '';
    const retryAfter = await this.loginLimiter.retryAfter(email);
    if (retryAfter > 0) {
      await this.loginFailed(email, 'blocked');
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many failed sign-in attempts. Try again later.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = (await (this.prisma as any).user.findUnique({
      where: { email },
    })) as UserRow | null;

    const valid = await bcrypt.compare(password ?? '', user?.password ?? DUMMY_HASH);
    if (!user || !valid) {
      await this.loginLimiter.recordFailure(email);
      await this.loginFailed(email, user ? 'wrong_password' : 'unknown_user');
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.loginLimiter.reset(email);
    if (user.deactivatedAt) {
      await this.loginFailed(email, 'deactivated');
      throw new ForbiddenException('This account is deactivated');
    }
    const denied = await this.policy.passwordLoginDenied(user);
    if (denied) {
      await this.loginFailed(email, 'sso_required');
      throw new ForbiddenException(denied);
    }
    await this.audit.record({
      action: 'auth.login',
      actor: { type: 'user', id: user.id, label: user.email },
      target: { type: 'user', id: user.id, label: user.email },
    });
    return this.issueTokens(user);
  }

  private loginFailed(
    email: string,
    reason: 'wrong_password' | 'unknown_user' | 'blocked' | 'sso_required' | 'deactivated',
  ) {
    return this.audit.record({
      action: 'auth.login_failed',
      actor: { type: 'anonymous', id: null, label: email.slice(0, 254) || null },
      details: { reason },
    });
  }

  // ------------------------------------------------------------------- refresh
  async refresh(rawToken: string): Promise<{ accessToken: string }> {
    const row = (await (this.prisma as any).refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken ?? '') },
      include: { user: true },
    })) as (RefreshTokenRow & { user: UserRow }) | null;

    if (!row || row.expiresAt < new Date() || row.user.deactivatedAt) {
      if (row) {
        await (this.prisma as any).refreshToken.delete({
          where: { id: row.id },
        });
      }
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    const accessToken = this.signAccess(row.user);
    return { accessToken };
  }

  // -------------------------------------------------------------------- logout
  async logout(rawToken: string): Promise<void> {
    await (this.prisma as any).refreshToken.deleteMany({
      where: { tokenHash: hashToken(rawToken ?? '') },
    });
  }

  // ------------------------------------------------------------------ helpers
  /** Signs the user in: a short-lived access token and a refresh token. */
  async issueTokens(user: UserRow): Promise<SessionTokens> {
    const accessToken = this.signAccess(user);

    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES', '7d');
    const expiresAt = this.parseExpiry(refreshExpires);
    const rawRefresh = randomBytes(32).toString('hex');

    // Housekeeping: drop the user's expired refresh tokens
    await (this.prisma as any).refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    await (this.prisma as any).refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawRefresh),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  private signAccess(user: UserRow): string {
    return this.jwt.sign(
      { sub: user.id, email: user.email },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES', '15m') as any,
      },
    );
  }

  private parseExpiry(expiry: string): Date {
    const now = Date.now();
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return new Date(now + 7 * 24 * 60 * 60 * 1000);
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const ms: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return new Date(now + amount * ms[unit]);
  }
}
