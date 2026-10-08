import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import type {
  ApiToken,
  CreateApiTokenDto,
  CreatedApiTokenDto,
} from '@optik/shared';

// expiresAt is optional so this compiles against both the stale and regenerated Prisma client
type TokenRow = {
  id: string;
  projectId: string;
  name: string;
  token?: string;
  expiresAt?: Date | null;
  createdAt: Date;
};

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProject(projectSlug: string): Promise<ApiToken[]> {
    const rows = await this.prisma.apiToken.findMany({
      where: { project: { slug: projectSlug } },
      orderBy: { createdAt: 'desc' },
    });
    return (rows as TokenRow[]).map(toDto);
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
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const row = (await this.prisma.apiToken.create({
      data: {
        projectId: project.id,
        name: dto.name,
        token: rawToken,
        ...(expiresAt ? { expiresAt } : {}),
      } as any,
    })) as TokenRow;
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
    const row = (await this.prisma.apiToken.findUnique({
      where: { token },
      include: { project: { select: { slug: true } } },
    })) as (TokenRow & { project: { slug: string } }) | null;
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
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}
