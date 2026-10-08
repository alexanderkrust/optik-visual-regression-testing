import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';

// Local type aliases — the Prisma client may not have generated these yet
type UserRow = {
  id: string;
  email: string;
  password: string;
  createdAt: Date;
};

type RefreshTokenRow = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');

    if (!email || !password) return;

    const count = await (this.prisma as any).user.count();
    if (count > 0) return;

    const hash = await bcrypt.hash(password, 10);
    await (this.prisma as any).user.create({ data: { email, password: hash } });
    this.logger.log(`Initial admin user created: ${email}`);
  }

  // ------------------------------------------------------------------ register
  async register(
    email: string,
    password: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
  }> {
    const count = await (this.prisma as any).user.count();
    if (count > 0) {
      throw new ForbiddenException('Initial setup already complete');
    }
    const hash = await bcrypt.hash(password, 10);
    const user = (await (this.prisma as any).user.create({
      data: { email, password: hash },
    })) as UserRow;

    return this.issueTokens(user);
  }

  // --------------------------------------------------------------------- login
  async login(
    email: string,
    password: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
  }> {
    const user = (await (this.prisma as any).user.findUnique({
      where: { email },
    })) as UserRow | null;

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user);
  }

  // ------------------------------------------------------------------- refresh
  async refresh(rawToken: string): Promise<{ accessToken: string }> {
    const row = (await (this.prisma as any).refreshToken.findUnique({
      where: { token: rawToken },
      include: { user: true },
    })) as (RefreshTokenRow & { user: UserRow }) | null;

    if (!row || row.expiresAt < new Date()) {
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
      where: { token: rawToken },
    });
  }

  // ------------------------------------------------------------------ helpers
  private async issueTokens(user: UserRow) {
    const accessToken = this.signAccess(user);

    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES', '7d');
    const expiresAt = this.parseExpiry(refreshExpires);
    const rawRefresh = randomBytes(32).toString('hex');

    await (this.prisma as any).refreshToken.create({
      data: {
        userId: user.id,
        token: rawRefresh,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      user: { id: user.id, email: user.email },
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
