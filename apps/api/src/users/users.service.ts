import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { User, UserRole } from '@optik/shared';
import { PrismaService } from '../database/prisma.service';
import { AccessService, CurrentUser } from '../access/access.service';
import { AuditTrail } from '../audit/audit-trail';

const USER_ROLES: UserRole[] = ['admin', 'member'];

export function userRole(value: unknown): UserRole {
  if (!USER_ROLES.includes(value as UserRole)) {
    throw new BadRequestException(`role must be one of ${USER_ROLES.join(', ')}`);
  }
  return value as UserRole;
}

/** Instance user management — admins only. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditTrail,
  ) {}

  async list(admin: CurrentUser): Promise<User[]> {
    this.access.requireAdmin(admin);
    const rows = await this.prisma.user.findMany({ orderBy: { email: 'asc' } });
    return rows.map(toDto);
  }

  async setRole(admin: CurrentUser, id: string, role: UserRole): Promise<User> {
    this.access.requireAdmin(admin);
    role = userRole(role);
    const user = await this.find(id);
    if (user.role === 'admin' && role !== 'admin') await this.assertNotLastAdmin();
    const updated = await this.prisma.user.update({ where: { id }, data: { role } });
    if (user.role !== role) {
      await this.audit.record({
        action: 'user.role_changed',
        target: { type: 'user', id, label: user.email },
        details: { from: user.role, to: role },
      });
    }
    return toDto(updated);
  }

  /** Removes the account; its reviews stay, without a reviewer. */
  async remove(admin: CurrentUser, id: string): Promise<void> {
    this.access.requireAdmin(admin);
    if (id === admin.id) throw new BadRequestException('You cannot remove your own account');
    const user = await this.find(id);
    await this.prisma.user.delete({ where: { id } });
    await this.audit.record({ action: 'user.removed', target: { type: 'user', id, label: user.email } });
  }

  private async find(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User "${id}" not found`);
    return user;
  }

  private async assertNotLastAdmin() {
    if ((await this.prisma.user.count({ where: { role: 'admin' } })) <= 1) {
      throw new BadRequestException('optik needs at least one admin');
    }
  }
}

function toDto(r: { id: string; email: string; role: UserRole; createdAt: Date }): User {
  return { id: r.id, email: r.email, role: r.role, createdAt: r.createdAt.toISOString() };
}
