import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import type {
  CreatedInvitation,
  CreateInvitationDto,
  Invitation,
  ProjectRole,
} from '@optik/shared';
import type { Invitation as InvitationRow } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AccessService, CurrentUser } from '../access/access.service';
import { AuthService, SessionTokens } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../notifications/mailer.service';
import { publicUrl } from '../common/public-url';
import { projectRole } from '../projects/projects.service';
import { userRole } from './users.service';

const VALID_DAYS = 7;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

const hash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * Invitation links: an admin invites an email address (optionally into a
 * project); the link lets that person set a password and signs them in.
 * Only a hash of the link's token is stored.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly auth: AuthService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async create(admin: CurrentUser, dto: CreateInvitationDto): Promise<CreatedInvitation> {
    this.access.requireAdmin(admin);
    const email = dto?.email?.trim().toLowerCase() ?? '';
    if (!EMAIL.test(email)) throw new BadRequestException('A valid email address is required');
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException(`There already is an account for ${email}`);
    }

    let projectId: string | null = null;
    let role: ProjectRole | null = null;
    if (dto.projectSlug) {
      const project = await this.prisma.project.findUnique({ where: { slug: dto.projectSlug } });
      if (!project) throw new NotFoundException(`Project "${dto.projectSlug}" not found`);
      projectId = project.id;
      role = projectRole(dto.projectRole ?? 'viewer');
    }

    const token = randomBytes(32).toString('base64url');
    const row = await this.prisma.invitation.create({
      data: {
        email,
        tokenHash: hash(token),
        role: userRole(dto.role ?? 'member'),
        projectId,
        projectRole: role,
        invitedById: admin.id,
        expiresAt: new Date(Date.now() + VALID_DAYS * 24 * 3600 * 1000),
      },
      include: { project: { select: { slug: true } } },
    });
    const invitePath = `/invite/${token}`;
    const base = publicUrl(this.config, dto.baseUrl);
    const emailSent = base
      ? await this.mailer.send({
          to: email,
          subject: 'You are invited to optik',
          text: [
            `${admin.email} invited you to optik${row.project ? ` (project ${row.project.slug})` : ''}.`,
            `Choose a password to get started: ${base}${invitePath}`,
            `The link is valid for ${VALID_DAYS} days.`,
          ].join('\n\n'),
        })
      : false;
    return { ...toDto(row), invitePath, emailSent };
  }

  /** Invitations that are neither accepted nor expired. */
  async pending(admin: CurrentUser): Promise<Invitation[]> {
    this.access.requireAdmin(admin);
    const rows = await this.prisma.invitation.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      include: { project: { select: { slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async revoke(admin: CurrentUser, id: string): Promise<void> {
    this.access.requireAdmin(admin);
    await this.prisma.invitation.deleteMany({ where: { id, acceptedAt: null } });
  }

  /** What the invite page shows — public, the token is the credential. */
  async lookup(token: string): Promise<{ email: string; expiresAt: string }> {
    const row = await this.findValid(token);
    return { email: row.email, expiresAt: row.expiresAt.toISOString() };
  }

  async accept(token: string, password: string): Promise<SessionTokens> {
    if (!password || password.length < 8) {
      throw new BadRequestException('The password must have at least 8 characters');
    }
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({ where: { tokenHash: hash(token) } });
      if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
        throw new NotFoundException('This invitation is invalid or has expired');
      }
      if (await tx.user.findUnique({ where: { email: invitation.email } })) {
        throw new ConflictException(`There already is an account for ${invitation.email}`);
      }
      const created = await tx.user.create({
        data: { email: invitation.email, password: passwordHash, role: invitation.role },
      });
      if (invitation.projectId && invitation.projectRole) {
        await tx.projectMember.create({
          data: { projectId: invitation.projectId, userId: created.id, role: invitation.projectRole },
        });
      }
      await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      return created;
    });

    return this.auth.issueTokens(user);
  }

  private async findValid(token: string): Promise<InvitationRow> {
    const row = await this.prisma.invitation.findUnique({ where: { tokenHash: hash(token) } });
    if (!row || row.acceptedAt || row.expiresAt < new Date()) {
      throw new NotFoundException('This invitation is invalid or has expired');
    }
    return row;
  }
}

function toDto(r: InvitationRow & { project?: { slug: string } | null }): Invitation {
  return {
    id: r.id,
    email: r.email,
    role: r.role,
    projectSlug: r.project?.slug ?? null,
    projectRole: r.projectRole,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}
