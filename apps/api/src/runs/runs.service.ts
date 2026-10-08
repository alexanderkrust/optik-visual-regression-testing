import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import type { Run, CreateRunDto } from '@optik/shared';
import type { Run as PrismaRun, Snapshot as PrismaSnapshot } from '@prisma/client';

/** Snapshot statuses that mean the run had a visual change. */
const CHANGE_STATUSES = ['pending', 'approved', 'rejected'];

const INCLUDE = {
  project: { select: { slug: true } },
  _count: { select: { snapshots: true } },
  snapshots: { select: { status: true } },
} as const;

type RunWithCounts = PrismaRun & {
  project: { slug: string };
  _count: { snapshots: number };
  snapshots: Pick<PrismaSnapshot, 'status'>[];
};

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async findByProject(projectSlug: string): Promise<Run[]> {
    const project = await this.projectsService.findBySlug(projectSlug);
    const rows = await this.prisma.run.findMany({
      where: { projectId: project.id },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async findById(id: string): Promise<Run> {
    const row = await this.prisma.run.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException(`Run "${id}" not found`);
    return toDto(row);
  }

  async create(projectSlug: string, dto: CreateRunDto): Promise<Run> {
    const project = await this.projectsService.findBySlug(projectSlug);
    const row = await this.prisma.run.create({
      data: { projectId: project.id, branch: dto.branch, commitSha: dto.commitSha },
      include: INCLUDE,
    });
    return toDto(row);
  }

  /**
   * Marks a run complete. A run whose snapshots are all `unchanged` is merged
   * into the previous run of the same branch if that one had no visual changes
   * either: the new run is deleted and the previous one gets a bumped
   * `updatedAt`, `runCount` and `lastCommitSha`. Returns the run that remains.
   */
  async complete(id: string): Promise<Run> {
    const run = await this.prisma.run.findUnique({ where: { id }, include: INCLUDE });
    if (!run) throw new NotFoundException(`Run "${id}" not found`);

    const target = await this.findMergeTarget(run);
    if (target) {
      const [, , merged] = await this.prisma.$transaction([
        this.prisma.snapshot.deleteMany({ where: { runId: id } }),
        this.prisma.run.delete({ where: { id } }),
        this.prisma.run.update({
          where: { id: target.id },
          data: { runCount: { increment: 1 }, lastCommitSha: run.commitSha },
          include: INCLUDE,
        }),
      ]);
      return toDto(merged);
    }

    const row = await this.prisma.run.update({
      where: { id },
      data: { status: 'complete' },
      include: INCLUDE,
    });
    return toDto(row);
  }

  private async findMergeTarget(run: RunWithCounts) {
    const onlyUnchanged =
      run.snapshots.length > 0 && run.snapshots.every((s) => s.status === 'unchanged');
    if (!onlyUnchanged) return null;

    const previous = await this.prisma.run.findFirst({
      where: {
        projectId: run.projectId,
        branch: run.branch,
        createdAt: { lt: run.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });
    const previousIsClean =
      previous?.status === 'complete' &&
      previous.snapshots.length > 0 &&
      !previous.snapshots.some((s) => CHANGE_STATUSES.includes(s.status));
    return previousIsClean ? previous : null;
  }
}

function toDto(r: RunWithCounts): Run {
  return {
    id: r.id,
    projectId: r.projectId,
    projectSlug: r.project.slug,
    branch: r.branch,
    commitSha: r.commitSha,
    lastCommitSha: r.lastCommitSha,
    status: r.status as Run['status'],
    snapshotCount: r._count.snapshots,
    pendingCount: r.snapshots.filter((s) => s.status === 'pending').length,
    changedCount: r.snapshots.filter((s) => CHANGE_STATUSES.includes(s.status)).length,
    runCount: r.runCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
