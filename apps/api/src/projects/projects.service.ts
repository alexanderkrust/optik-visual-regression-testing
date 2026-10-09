import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SecretBox } from '../common/secret-box';
import type {
  CreateProjectDto,
  EffectiveProjectRole,
  Project,
  ProjectMember,
  ProjectRole,
  UpdateProjectDto,
} from '@optik/shared';
import { AccessService, CurrentUser } from '../access/access.service';

export interface SetProjectMemberDto {
  email: string;
  role: ProjectRole;
}
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
    private readonly access: AccessService,
  ) {}

  async findAll(user: CurrentUser): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({
      where: this.access.visibleProjects(user),
      include: { members: { where: { userId: user.id }, select: { role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => toDto(r, user.role === 'admin' ? 'admin' : r.members[0].role));
  }

  async findOne(user: CurrentUser, slug: string): Promise<Project> {
    const { project, role } = await this.access.requireProject(user, { slug }, 'viewer');
    return toDto(project, role);
  }

  /** Project id for internal use (no permission check). */
  async idBySlug(slug: string): Promise<string> {
    const row = await this.prisma.project.findUnique({ where: { slug }, select: { id: true } });
    if (!row) throw new NotFoundException(`Project "${slug}" not found`);
    return row.id;
  }

  async update(user: CurrentUser, slug: string, dto: UpdateProjectDto): Promise<Project> {
    const { role } = await this.access.requireProject(user, { slug }, 'maintainer');
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
    return toDto(row, role);
  }

  async create(user: CurrentUser, dto: CreateProjectDto): Promise<Project> {
    this.access.requireAdmin(user);
    try {
      const row = await this.prisma.project.create({
        data: { name: dto.name, slug: dto.slug, defaultBranch: branchName(dto.defaultBranch) },
      });
      return toDto(row, 'admin');
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new ConflictException(`Slug "${dto.slug}" already exists`);
      throw e;
    }
  }

  // ------------------------------------------------------------------ members

  async members(user: CurrentUser, slug: string): Promise<ProjectMember[]> {
    const { project } = await this.access.requireProject(user, { slug }, 'maintainer');
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId: project.id },
      include: { user: { select: { email: true } } },
      orderBy: { user: { email: 'asc' } },
    });
    return rows.map((m) => ({ userId: m.userId, email: m.user.email, role: m.role }));
  }

  /** Adds an existing user to the project or changes their role. */
  async setMember(user: CurrentUser, slug: string, dto: SetProjectMemberDto): Promise<ProjectMember> {
    const { project } = await this.access.requireProject(user, { slug }, 'maintainer');
    const role = projectRole(dto?.role);
    const member = await this.prisma.user.findUnique({
      where: { email: dto?.email?.trim() ?? '' },
      select: { id: true, email: true, role: true },
    });
    if (!member) {
      throw new NotFoundException(`No user with the email "${dto?.email}" — invite them first`);
    }
    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: member.id } },
      create: { projectId: project.id, userId: member.id, role },
      update: { role },
    });
    return { userId: member.id, email: member.email, role };
  }

  async removeMember(user: CurrentUser, slug: string, userId: string): Promise<void> {
    const { project } = await this.access.requireProject(user, { slug }, 'maintainer');
    await this.prisma.projectMember.deleteMany({ where: { projectId: project.id, userId } });
  }
}

const PROJECT_ROLES: ProjectRole[] = ['viewer', 'reviewer', 'maintainer'];

export function projectRole(value: unknown): ProjectRole {
  if (!PROJECT_ROLES.includes(value as ProjectRole)) {
    throw new BadRequestException(`role must be one of ${PROJECT_ROLES.join(', ')}`);
  }
  return value as ProjectRole;
}

function toDto(r: ProjectRow, myRole: EffectiveProjectRole): Project {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    defaultBranch: r.defaultBranch,
    failTestsOnChanges: r.failTestsOnChanges,
    githubRepo: r.githubRepo,
    githubApiUrl: r.githubApiUrl,
    githubTokenConfigured: r.githubTokenEncrypted !== null,
    myRole,
    createdAt: r.createdAt.toISOString(),
  };
}
