import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import type {
  ApiToken,
  CreateApiTokenDto,
  CreatedApiTokenDto,
} from '@optik/shared';
import type { ApiToken as TokenRow } from '@prisma/client';

/** Visible part of a token, e.g. "optik_3f9a1c" — enough to recognise it. */
const PREFIX_LENGTH = 12;

/**
 * Tokens are 256-bit random values, so a fast hash is enough: there is nothing
 * to brute-force. Only the hash is stored; the token is shown once on creation.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectSlug: string): Promise<ApiToken[]> {
    const rows = await this.prisma.apiToken.findMany({
      where: { project: { slug: projectSlug } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async create(
    projectSlug: string,
    dto: CreateApiTokenDto,
  ): Promise<CreatedApiTokenDto> {
    const project = await this.prisma.project.findUnique({
      where: { slug: projectSlug },
    });
    if (!project)
      throw new NotFoundException(`Project "${projectSlug}" not found`);

    const rawToken = `optik_${randomBytes(32).toString('hex')}`;
    const row = await this.prisma.apiToken.create({
      data: {
        projectId: project.id,
        name: dto.name,
        tokenHash: hashToken(rawToken),
        tokenPrefix: rawToken.slice(0, PREFIX_LENGTH),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    return { ...toDto(row), token: rawToken };
  }

  async revoke(projectSlug: string, tokenId: string): Promise<void> {
    const row = await this.prisma.apiToken.findFirst({
      where: { id: tokenId, project: { slug: projectSlug } },
    });
    if (!row) throw new NotFoundException(`Token "${tokenId}" not found`);
    await this.prisma.apiToken.delete({ where: { id: tokenId } });
  }

  async findByToken(
    token: string,
  ): Promise<{ projectId: string; projectSlug: string } | null> {
    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { project: { select: { slug: true } } },
    });
    if (!row) return null;
    if (row.expiresAt && row.expiresAt < new Date()) return null;
    return { projectId: row.projectId, projectSlug: row.project.slug };
  }
}

function toDto(r: TokenRow): ApiToken {
  return {
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    prefix: r.tokenPrefix,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}
