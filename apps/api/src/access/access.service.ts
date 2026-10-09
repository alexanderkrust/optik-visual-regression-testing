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
      include: { members: { where: { userId: user.id }, select: { role: true } } },
    });
    const role: EffectiveRole | null =
      user.role === 'admin' ? 'admin' : (project?.members[0]?.role ?? null);
    if (!project || !role) {
      throw new NotFoundException(`Project "${'slug' in where ? where.slug : where.id}" not found`);
    }
    if (RANK[role] < RANK[min]) {
      throw new ForbiddenException(`This needs the ${min} role in project "${project.slug}"`);
    }
    const { members: _members, ...rest } = project;
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
    return user.role === 'admin' ? {} : { members: { some: { userId: user.id } } };
  }

  requireAdmin(user: CurrentUser) {
    if (user.role !== 'admin') throw new ForbiddenException('This needs the admin role');
  }
}
