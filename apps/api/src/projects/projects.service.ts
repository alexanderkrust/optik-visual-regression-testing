import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SecretBox } from '../common/secret-box';
import type { Project, CreateProjectDto, UpdateProjectDto } from '@optik/shared';
import type { Project as ProjectRow } from '@prisma/client';

const BRANCH_PATTERN = /^[^\s~^:?*[\\]{1,255}$/;

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/** "" clears the setting, undefined leaves it unchanged. */
function githubRepo(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const repo = value.trim();
  if (!repo) return null;
  if (!REPO_PATTERN.test(repo)) {
    throw new BadRequestException('githubRepo must look like "owner/repo"');
  }
  return repo;
}

function apiUrl(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const url = value.trim().replace(/\/+$/, '');
  if (!url) return null;
  try {
    if (['http:', 'https:'].includes(new URL(url).protocol)) return url;
  } catch {
    // fall through
  }
  throw new BadRequestException('githubApiUrl must be an http(s) URL');
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
  ) {}

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
    if (dto?.failTestsOnChanges !== undefined && typeof dto.failTestsOnChanges !== 'boolean') {
      throw new BadRequestException('failTestsOnChanges must be true or false');
    }
    const token = dto?.githubToken?.trim();
    const row = await this.prisma.project.update({
      where: { slug },
      data: {
        defaultBranch: branchName(dto?.defaultBranch),
        failTestsOnChanges: dto?.failTestsOnChanges,
        githubRepo: githubRepo(dto?.githubRepo),
        githubApiUrl: apiUrl(dto?.githubApiUrl),
        githubTokenEncrypted:
          token === undefined ? undefined : token ? this.secrets.encrypt(token) : null,
      },
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
    failTestsOnChanges: r.failTestsOnChanges,
    githubRepo: r.githubRepo,
    githubApiUrl: r.githubApiUrl,
    githubTokenConfigured: r.githubTokenEncrypted !== null,
    createdAt: r.createdAt.toISOString(),
  };
}
