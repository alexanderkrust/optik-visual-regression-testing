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
import { CI_PROVIDERS, checkRepository, PROVIDERS } from '../ci/providers';

export interface SetProjectMemberDto {
  email: string;
  role: ProjectRole;
}
import type { Project as ProjectRow } from '@prisma/client';

const BRANCH_PATTERN = /^[^\s~^:?*[\\]{1,255}$/;

function apiUrl(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const url = value.trim().replace(/\/+$/, '');
  if (!url) return null;
  try {
    if (['http:', 'https:'].includes(new URL(url).protocol)) return url;
  } catch {
    // fall through
  }
  throw new BadRequestException('ciApiUrl must be an http(s) URL');
}

/** "" clears the setting, undefined leaves it unchanged. */
function optional(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() || null;
}

/**
 * The CI settings after applying `dto` to `current`. A stored token is only
 * kept while provider and API URL stay the same — so it is never sent to
 * another server than the one it was entered for.
 */
function ciSettings(current: ProjectRow, dto: UpdateProjectDto, encrypt: (token: string) => string) {
  if (dto.ciProvider === '') {
    return { ciProvider: null, ciRepository: null, ciApiUrl: null, ciTokenEncrypted: null };
  }
  if (dto.ciProvider !== undefined && !CI_PROVIDERS.includes(dto.ciProvider)) {
    throw new BadRequestException(`ciProvider must be one of ${CI_PROVIDERS.join(', ')}`);
  }
  const provider = dto.ciProvider ?? current.ciProvider;
  const repo = optional(dto.ciRepository);
  const repository = repo === undefined ? current.ciRepository : repo;
  const url = apiUrl(dto.ciApiUrl);
  const api = url === undefined ? current.ciApiUrl : url;

  if (repository && !provider) throw new BadRequestException('Choose the CI provider of the repository');
  if (provider && repository) {
    const problem = checkRepository(provider, repository);
    if (problem) throw new BadRequestException(problem);
    if (!api && !PROVIDERS[provider].defaultApiUrl) {
      throw new BadRequestException(`${PROVIDERS[provider].label} needs the API URL of your server`);
    }
  }

  const token = dto.ciToken?.trim();
  const moved = provider !== current.ciProvider || api !== current.ciApiUrl;
  return {
    ciProvider: provider,
    ciRepository: repository,
    ciApiUrl: api,
    ciTokenEncrypted:
      token === undefined ? (moved ? null : undefined) : token ? encrypt(token) : null,
  };
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
    const { project, role } = await this.access.requireProject(user, { slug }, 'maintainer');
    if (dto?.failTestsOnChanges !== undefined && typeof dto.failTestsOnChanges !== 'boolean') {
      throw new BadRequestException('failTestsOnChanges must be true or false');
    }
    const row = await this.prisma.project.update({
      where: { slug },
      data: {
        defaultBranch: branchName(dto?.defaultBranch),
        failTestsOnChanges: dto?.failTestsOnChanges,
        ...ciSettings(project, dto ?? {}, (token) => this.secrets.encrypt(token)),
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
    ciProvider: r.ciProvider,
    ciRepository: r.ciRepository,
    ciApiUrl: r.ciApiUrl,
    ciTokenConfigured: r.ciTokenEncrypted !== null,
    myRole,
    createdAt: r.createdAt.toISOString(),
  };
}
