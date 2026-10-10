// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProjectRole, ProjectTeam, SaveTeamDto, Team } from '@optik/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditTrail } from '../../audit/audit-trail';
import { projectRole } from '../../projects/projects.service';

const INCLUDE = {
  members: { include: { user: { select: { email: true } } }, orderBy: { user: { email: 'asc' } } },
  projects: { include: { project: { select: { slug: true, name: true } } }, orderBy: { project: { name: 'asc' } } },
} as const satisfies Prisma.TeamInclude;

type TeamRow = Prisma.TeamGetPayload<{ include: typeof INCLUDE }>;

/**
 * Teams: groups of users with roles in projects. A member's role in a project
 * is the highest of their own and their teams' (see AccessService).
 */
@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditTrail,
  ) {}

  async list(): Promise<Team[]> {
    const rows = await this.prisma.team.findMany({ include: INCLUDE, orderBy: { name: 'asc' } });
    return rows.map(toDto);
  }

  async create(dto: SaveTeamDto): Promise<Team> {
    const data = validate(dto);
    const row = await this.prisma.team.create({ data, include: INCLUDE }).catch(conflict(data.name));
    await this.audit.record({ action: 'team.created', target: { type: 'team', id: row.id, label: row.name } });
    return toDto(row);
  }

  async update(id: string, dto: SaveTeamDto): Promise<Team> {
    const before = await this.find(id);
    const data = validate(dto);
    const row = await this.prisma.team.update({ where: { id }, data, include: INCLUDE }).catch(conflict(data.name));
    await this.audit.record({
      action: 'team.updated',
      target: { type: 'team', id, label: row.name },
      details: before.name !== row.name ? { name: { from: before.name, to: row.name } } : {},
    });
    return toDto(row);
  }

  async remove(id: string): Promise<void> {
    const team = await this.find(id);
    await this.prisma.team.delete({ where: { id } });
    await this.audit.record({ action: 'team.removed', target: { type: 'team', id, label: team.name } });
  }

  async addMember(id: string, email: string): Promise<Team> {
    const team = await this.find(id);
    const user = await this.prisma.user.findUnique({ where: { email: email?.trim().toLowerCase() ?? '' } });
    if (!user) throw new NotFoundException(`No user with the email "${email}" — invite them first`);
    await this.join(team, user, {});
    return this.get(id);
  }

  async removeMember(id: string, userId: string): Promise<Team> {
    const team = await this.find(id);
    await this.leave(team, userId, {});
    return this.get(id);
  }

  /** Gives the team a role in a project, or takes it away (role null). */
  async setProjectRole(id: string, projectSlug: string, role: ProjectRole | null): Promise<Team> {
    const team = await this.find(id);
    const project = await this.prisma.project.findUnique({ where: { slug: projectSlug ?? '' } });
    if (!project) throw new NotFoundException(`Project "${projectSlug}" not found`);
    const key = { teamId_projectId: { teamId: id, projectId: project.id } };
    const before = await this.prisma.teamProject.findUnique({ where: key });
    if (role === null) {
      await this.prisma.teamProject.deleteMany({ where: { teamId: id, projectId: project.id } });
    } else {
      role = projectRole(role);
      await this.prisma.teamProject.upsert({
        where: key,
        create: { teamId: id, projectId: project.id, role },
        update: { role },
      });
    }
    if ((before?.role ?? null) !== role) {
      await this.audit.record({
        action: 'team.project_role_changed',
        project: { id: project.id, slug: project.slug },
        target: { type: 'team', id, label: team.name },
        details: { from: before?.role ?? null, to: role },
      });
    }
    return this.get(id);
  }

  /** Teams with access to a project — for its members page. */
  async forProject(projectId: string): Promise<ProjectTeam[]> {
    const rows = await this.prisma.teamProject.findMany({
      where: { projectId },
      include: { team: { select: { name: true, _count: { select: { members: true } } } } },
      orderBy: { team: { name: 'asc' } },
    });
    return rows.map((r) => ({ teamId: r.teamId, name: r.team.name, role: r.role, members: r.team._count.members }));
  }

  /**
   * Single sign-on: makes the user a member of exactly the `wanted` teams
   * among the `covered` ones (the teams the provider's mappings name).
   */
  async syncMemberships(
    user: { id: string; email: string },
    covered: string[],
    wanted: string[],
    details: Record<string, unknown>,
  ) {
    const teams = await this.prisma.team.findMany({
      where: { name: { in: covered } },
      include: { members: { where: { userId: user.id } } },
    });
    for (const team of teams) {
      const member = team.members.length > 0;
      if (wanted.includes(team.name) && !member) await this.join(team, user, details);
      if (!wanted.includes(team.name) && member) await this.leave(team, user.id, details);
    }
  }

  private async join(team: { id: string; name: string }, user: { id: string; email: string }, details: Record<string, unknown>) {
    const existing = await this.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: team.id, userId: user.id } } });
    if (existing) return;
    await this.prisma.teamMember.create({ data: { teamId: team.id, userId: user.id } });
    await this.audit.record({
      action: 'team.member_added',
      target: { type: 'team', id: team.id, label: team.name },
      details: { user: user.email, ...details },
    });
  }

  private async leave(team: { id: string; name: string }, userId: string, details: Record<string, unknown>) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId } },
      include: { user: { select: { email: true } } },
    });
    if (!member) return;
    await this.prisma.teamMember.delete({ where: { teamId_userId: { teamId: team.id, userId } } });
    await this.audit.record({
      action: 'team.member_removed',
      target: { type: 'team', id: team.id, label: team.name },
      details: { user: member.user.email, ...details },
    });
  }

  private async get(id: string): Promise<Team> {
    return toDto(await this.prisma.team.findUniqueOrThrow({ where: { id }, include: INCLUDE }));
  }

  private async find(id: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException(`Team "${id}" not found`);
    return team;
  }
}

function validate(dto: SaveTeamDto) {
  const name = typeof dto?.name === 'string' ? dto.name.trim() : '';
  if (!name || name.length > 100) throw new BadRequestException('A team needs a name (up to 100 characters)');
  const description = typeof dto.description === 'string' ? dto.description.trim().slice(0, 500) || null : null;
  return { name, description };
}

const conflict = (name: string) => (err: { code?: string }) => {
  if (err?.code === 'P2002') throw new ConflictException(`There already is a team called "${name}"`);
  throw err;
};

function toDto(r: TeamRow): Team {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    members: r.members.map((m) => ({ userId: m.userId, email: m.user.email })),
    projects: r.projects.map((p) => ({ projectId: p.projectId, slug: p.project.slug, name: p.project.name, role: p.role })),
  };
}
