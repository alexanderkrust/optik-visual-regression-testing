import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import type { CurrentUser } from '../access/access.service';

/**
 * Requires a valid access token. The user and their role are loaded from the
 * database on every request, so role changes and removed users take effect
 * immediately — not only when the access token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<any>();
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    let payload: { sub: string };
    try {
      payload = this.jwt.verify(authHeader.slice(7), {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new UnauthorizedException('This account no longer exists');

    request.user = user satisfies CurrentUser;
    return true;
  }
}
