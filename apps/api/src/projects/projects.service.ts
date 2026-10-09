import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Project, CreateProjectDto, UpdateProjectDto } from '@optik/shared';
import type { Project as ProjectRow } from '@prisma/client';

const BRANCH_PATTERN = /^[^\s~^:?*[\\]{1,255}$/;

function branchName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const branch = value.trim();
  if (!BRANCH_PATTERN.test(branch)) {
    throw new BadRequestException('defaultBranch must be a valid git branch name');
  }
  return branch;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async findBySlug(slug: string): Promise<Project> {
    const row = await this.prisma.project.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException(`Project "${slug}" not found`);
    return toDto(row);
  }

  async update(slug: string, dto: UpdateProjectDto): Promise<Project> {
    await this.findBySlug(slug);
    const row = await this.prisma.project.update({
      where: { slug },
      data: { defaultBranch: branchName(dto?.defaultBranch) },
    });
    return toDto(row);
  }

  async create(dto: CreateProjectDto): Promise<Project> {
    try {
      const row = await this.prisma.project.create({
        data: { name: dto.name, slug: dto.slug, defaultBranch: branchName(dto.defaultBranch) },
      });
      return toDto(row);
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new ConflictException(`Slug "${dto.slug}" already exists`);
      throw e;
    }
  }
}

function toDto(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    defaultBranch: r.defaultBranch,
    createdAt: r.createdAt.toISOString(),
  };
}
