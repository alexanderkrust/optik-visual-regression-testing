import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Project, ProjectRole, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/** The signed-in user, as the JWT guard puts it on the request. */
export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
}

/** A user's effective role in a project; instance admins count as "admin". */
export type EffectiveRole = ProjectRole | 'admin';

const RANK: Record<EffectiveRole, number> = { viewer: 1, reviewer: 2, maintainer: 3, admin: 4 };

/** Prisma include for a project: the user's own membership and their teams' roles. */
export function rolesOf(userId: string) {
  return {
    members: { where: { userId }, select: { role: true } },
    teams: { where: { team: { members: { some: { userId } } } }, select: { role: true } },
  } as const;
}

/**
 * A user's role in a project: the highest of their own membership and the
 * roles of their teams (Enterprise). Team access keeps working without the
 * license — only managing teams needs it.
 */
export function effectiveRole(project: {
  members: { role: ProjectRole }[];
  teams: { role: ProjectRole }[];
}): ProjectRole | null {
  const roles = [...project.members, ...project.teams].map((m) => m.role);
  return roles.sort((a, b) => RANK[b] - RANK[a])[0] ?? null;
}

/**
 * Who may do what in a project. Projects a user has no access to are reported
 * as "not found", so their existence isn't revealed; too low a role is
 * "forbidden".
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The project and the user's role in it, if they need at least `min`. */
  async requireProject(
    user: CurrentUser,
    where: { slug: string } | { id: string },
    min: ProjectRole,
  ): Promise<{ project: Project; role: EffectiveRole }> {
    const project = await this.prisma.project.findUnique({
      where,
      include: rolesOf(user.id),
    });
    const role: EffectiveRole | null =
      user.role === 'admin' ? 'admin' : project ? effectiveRole(project) : null;
    if (!project || !role) {
      throw new NotFoundException(`Project "${'slug' in where ? where.slug : where.id}" not found`);
    }
    if (RANK[role] < RANK[min]) {
      throw new ForbiddenException(`This needs the ${min} role in project "${project.slug}"`);
    }
    const { members: _members, teams: _teams, ...rest } = project;
    return { project: rest, role };
  }

  /** Same, for the project a run belongs to. */
  async requireRun(user: CurrentUser, runId: string, min: ProjectRole) {
    const run = await this.prisma.run.findUnique({ where: { id: runId }, select: { projectId: true } });
    if (!run) throw new NotFoundException(`Run "${runId}" not found`);
    return this.requireProject(user, { id: run.projectId }, min).catch((err) => {
      throw err instanceof NotFoundException ? new NotFoundException(`Run "${runId}" not found`) : err;
    });
  }

  /** Same, for the project a snapshot belongs to. */
  async requireSnapshot(user: CurrentUser, snapshotId: string, min: ProjectRole) {
    const snapshot = await this.prisma.snapshot.findUnique({
      where: { id: snapshotId },
      select: { runId: true },
    });
    if (!snapshot) throw new NotFoundException(`Snapshot "${snapshotId}" not found`);
    return this.requireRun(user, snapshot.runId, min).catch((err) => {
      throw err instanceof NotFoundException ? new NotFoundException(`Snapshot "${snapshotId}" not found`) : err;
    });
  }

  /** Filter for the projects a user may see. */
  visibleProjects(user: CurrentUser) {
    return user.role === 'admin'
      ? {}
      : {
          OR: [
            { members: { some: { userId: user.id } } },
            { teams: { some: { team: { members: { some: { userId: user.id } } } } } },
          ],
        };
  }

  requireAdmin(user: CurrentUser) {
    if (user.role !== 'admin') throw new ForbiddenException('This needs the admin role');
  }
}
