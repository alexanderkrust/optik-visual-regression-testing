import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CommitStatusService } from '../ci/commit-status.service';
import { AccessService, CurrentUser } from '../access/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { MetricsService } from '../observability/metrics.service';
import { diffKey, imageKey } from '../snapshots/storage-keys';
import type { Run, CreateRunDto } from '@optik/shared';
import type { Run as PrismaRun, Snapshot as PrismaSnapshot } from '@prisma/client';

/** Snapshot statuses that mean the run had a visual change. */
const CHANGE_STATUSES = ['pending', 'approved', 'rejected'];

/** Suite of runs created before suites existed — other suites fall back to its baselines. */
export const DEFAULT_SUITE = 'default';

const SUITE_PATTERN = /^[A-Za-z0-9._/-]{1,64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;
const MAX_ANCESTORS = 1000;

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
    private readonly commitStatus: CommitStatusService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly metrics: MetricsService,
  ) {}

  async findByProject(user: CurrentUser, projectSlug: string): Promise<Run[]> {
    const { project } = await this.access.requireProject(user, { slug: projectSlug }, 'viewer');
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

  /** Readable by viewers of the run's project. */
  async findVisible(user: CurrentUser, id: string): Promise<Run> {
    await this.access.requireRun(user, id, 'viewer');
    return this.findById(id);
  }

  async create(projectSlug: string, dto: CreateRunDto): Promise<Run> {
    const project = { id: await this.projectsService.idBySlug(projectSlug) };
    const suite = dto.suite?.trim() || DEFAULT_SUITE;
    if (!SUITE_PATTERN.test(suite)) {
      throw new BadRequestException(
        'suite must be 1–64 characters: letters, digits, ".", "_", "/" or "-"',
      );
    }
    const ancestors = dto.ancestors ?? [];
    if (
      !Array.isArray(ancestors) ||
      ancestors.length > MAX_ANCESTORS ||
      !ancestors.every((sha) => typeof sha === 'string' && COMMIT_PATTERN.test(sha))
    ) {
      throw new BadRequestException(`ancestors must be up to ${MAX_ANCESTORS} commit SHAs`);
    }
    // The run's own commit counts too: e.g. a re-run after accepting a change
    const commits = COMMIT_PATTERN.test(dto.commitSha ?? '')
      ? [dto.commitSha, ...ancestors.filter((sha) => sha !== dto.commitSha)]
      : ancestors;

    const row = await this.prisma.run.create({
      data: {
        projectId: project.id,
        branch: dto.branch,
        commitSha: dto.commitSha,
        suite,
        ancestors: commits,
        serverUrl: validUrl(dto.serverUrl),
        // Only used to report statuses on the pull request; anything else is ignored
        pullRequest: /^\d{1,10}$/.test(String(dto.pullRequest ?? '')) ? String(dto.pullRequest) : null,
      },
      include: INCLUDE,
    });
    await this.commitStatus.reportRun(row.id);
    return toDto(row);
  }

  /**
   * Marks a run complete. A run whose snapshots are all `unchanged` is merged
   * into the previous run of the same suite and branch if that one had no visual changes
   * either: the new run is deleted and the previous one gets a bumped
   * `updatedAt`, `runCount` and `lastCommitSha`. Returns the run that remains.
   */
  async complete(projectId: string, id: string): Promise<Run> {
    const run = await this.prisma.run.findUnique({ where: { id }, include: INCLUDE });
    // A token may only complete runs of its own project; don't reveal others
    if (!run || run.projectId !== projectId) {
      throw new NotFoundException(`Run "${id}" not found`);
    }

    const target = await this.findMergeTarget(run);
    this.metrics.runs.inc({ merged: String(!!target) });
    if (target) {
      // The merged run disappears, but its commit still needs a (green) status
      const project = await this.prisma.project.findUniqueOrThrow({ where: { id: run.projectId } });
      await this.commitStatus.report({ ...run, project }, 'success', 'No visual changes', target.id);

      // Unchanged snapshots only have images when they differed within their threshold
      const stored = await this.prisma.snapshot.findMany({
        where: { runId: id, diffScore: { gt: 0 } },
        select: { id: true },
      });
      const [, , merged] = await this.prisma.$transaction([
        this.prisma.snapshot.deleteMany({ where: { runId: id } }),
        this.prisma.run.delete({ where: { id } }),
        this.prisma.run.update({
          where: { id: target.id },
          data: { runCount: { increment: 1 }, lastCommitSha: run.commitSha },
          include: INCLUDE,
        }),
      ]);
      await this.storage.delete(stored.flatMap((s) => [imageKey(id, s.id), diffKey(id, s.id)]));
      return toDto(merged);
    }

    const row = await this.prisma.run.update({
      where: { id },
      data: { status: 'complete' },
      include: INCLUDE,
    });
    await this.commitStatus.reportRun(id);
    const completed = toDto(row);
    if (completed.pendingCount > 0) await this.notifications.notifyRun(id, 'run.needs_review');
    return completed;
  }

  private async findMergeTarget(run: RunWithCounts) {
    const onlyUnchanged =
      run.snapshots.length > 0 && run.snapshots.every((s) => s.status === 'unchanged');
    if (!onlyUnchanged) return null;

    const previous = await this.prisma.run.findFirst({
      where: {
        projectId: run.projectId,
        suite: run.suite,
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

/** The optik URL the adapter used, if it is a plain http(s) URL. */
function validUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function toDto(r: RunWithCounts): Run {
  return {
    id: r.id,
    projectId: r.projectId,
    projectSlug: r.project.slug,
    branch: r.branch,
    suite: r.suite,
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
