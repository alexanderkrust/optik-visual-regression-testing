import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ImageUrlSigner } from './image-urls';
import { DEFAULT_SUITE } from '../runs/runs.service';
import { CommitStatusService } from '../ci/commit-status.service';
import { AccessService, CurrentUser } from '../access/access.service';

const WITH_REVIEWER = { reviewedBy: { select: { email: true } } } as const;
type SnapshotRow = PrismaSnapshot & { reviewedBy?: { email: string } | null };
import { StorageService } from '../storage/storage.service';
import { computeDiff, pixelHash } from '@optik/core';
import type {
  Snapshot,
  SnapshotStatus,
  SubmittedSnapshot,
  UpdateSnapshotStatusDto,
} from '@optik/shared';
import type { Prisma, Snapshot as PrismaSnapshot } from '@prisma/client';

/** Statuses of snapshots that differ from their baseline (and have a diff image). */
const CHANGE_STATUSES: SnapshotStatus[] = ['pending', 'approved', 'rejected'];

/** Statuses whose image is a valid baseline for later runs. */
/** Branch name the adapters report when they can't detect one. */
const UNKNOWN_BRANCH = 'unknown';

const BASELINE_STATUSES: SnapshotStatus[] = ['new', 'approved'];

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly urls: ImageUrlSigner,
    private readonly commitStatus: CommitStatusService,
    private readonly access: AccessService,
  ) {}

  async findByRun(user: CurrentUser, runId: string): Promise<Snapshot[]> {
    await this.access.requireRun(user, runId, 'viewer');
    const rows = await this.prisma.snapshot.findMany({
      where: { runId },
      include: WITH_REVIEWER,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async findById(id: string): Promise<Snapshot> {
    const row = await this.prisma.snapshot.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Snapshot "${id}" not found`);
    return this.toDto(row);
  }

  /**
   * Stores a screenshot and compares it with its baseline (see findBaseline).
   *
   * - no baseline        → `new` (becomes the baseline)
   * - identical          → `unchanged` (image not stored — it equals the baseline)
   * - any pixel differs  → `pending` (needs review; adapters fail the test),
   *   unless the exact same image was already approved → `approved` automatically
   */
  async submit(
    projectId: string,
    runId: string,
    name: string,
    image: Buffer,
  ): Promise<SubmittedSnapshot> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: {
        id: true,
        projectId: true,
        suite: true,
        branch: true,
        ancestors: true,
        project: { select: { slug: true, defaultBranch: true, failTestsOnChanges: true } },
      },
    });
    // A token may only write to runs of its own project; don't reveal others
    if (!run || run.projectId !== projectId) {
      throw new NotFoundException(`Run "${runId}" not found`);
    }

    let imageHash: string;
    try {
      imageHash = pixelHash(image);
    } catch {
      throw new BadRequestException(`Snapshot "${name}" is not a valid PNG`);
    }

    let baseline = await this.findBaseline(run, name);

    // A baseline whose image is gone (e.g. stored before the move to S3) can't be
    // compared against — treat the snapshot as new so it becomes the baseline.
    const baselineImage = baseline
      ? await this.storage
          .get(imageKey(baseline.runId, baseline.id))
          .catch((err) => (err instanceof NotFoundException ? null : Promise.reject(err)))
      : null;
    if (!baselineImage) baseline = null;

    let status: SnapshotStatus = 'new';
    let diffScore: number | null = null;
    let diffImage: Buffer | null = null;

    if (baseline && baselineImage) {
      let result: ReturnType<typeof computeDiff>;
      try {
        result = computeDiff(baselineImage, image);
      } catch {
        throw new BadRequestException(`Snapshot "${name}" is not a valid PNG`);
      }
      const changed = result.diffCount > 0 || result.sizeChanged;
      status = changed ? 'pending' : 'unchanged';
      diffScore = result.diffScore;
      if (changed) diffImage = result.diffBuffer;
    }

    // E.g. after a squash merge: the change was reviewed on its branch, but the
    // new commit on the default branch has no history linking it to that review.
    const approvedTwin =
      status === 'pending' ? await this.findApprovedTwin(run, name, imageHash) : null;
    if (approvedTwin) status = 'approved';

    const snapshot = await this.prisma.snapshot.create({
      data: {
        runId,
        name,
        status,
        diffScore,
        imageHash,
        baselineId: baseline?.id ?? null,
        autoApprovedFromId: approvedTwin?.id ?? null,
      },
    });

    if (status !== 'unchanged') await this.storage.put(imageKey(runId, snapshot.id), image);
    if (diffImage) await this.storage.put(diffKey(runId, snapshot.id), diffImage);

    return {
      ...this.toDto(snapshot),
      reviewPath: `/${run.project.slug}/${runId}?snapshot=${snapshot.id}`,
      failTest: status === 'pending' && run.project.failTestsOnChanges,
    };
  }

  /**
   * The baseline is the latest accepted (`new` or `approved`) snapshot of this
   * name, searched in this order:
   *
   * 1. on the run's commit and its git ancestors — so a branch compares against
   *    the state it was branched from, accepting a change on a branch affects
   *    only that branch, and merge commits carry accepted changes over. Runs
   *    from before optik recorded history (no ancestors) on this branch or the
   *    default branch count as well, the newest wins — so existing baselines
   *    carry over after upgrading;
   * 2. on the same branch — when the history isn't available (shallow clones,
   *    older adapters);
   * 3. on the project's default branch (or on runs whose branch wasn't
   *    detected) — e.g. the first run of a new branch.
   *
   * All of this within the run's suite first, then in the "default" suite of
   * runs from before suites existed.
   */
  private async findBaseline(run: BaselineSearchRun, name: string) {
    const suites = run.suite === DEFAULT_SUITE ? [DEFAULT_SUITE] : [run.suite, DEFAULT_SUITE];
    const mainline = [run.project.defaultBranch, UNKNOWN_BRANCH];

    for (const suite of suites) {
      const scopes: Prisma.RunWhereInput[] = [];
      if (run.ancestors.length > 0) {
        scopes.push({
          OR: [
            { commitSha: { in: run.ancestors } },
            { ancestors: { isEmpty: true }, branch: { in: [run.branch, ...mainline] } },
          ],
        });
      }
      scopes.push({ branch: run.branch });
      scopes.push({ branch: { in: mainline } });

      for (const scope of scopes) {
        const baseline = await this.prisma.snapshot.findFirst({
          where: {
            name,
            status: { in: BASELINE_STATUSES },
            run: { projectId: run.projectId, suite, ...scope },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, runId: true },
        });
        if (baseline) return baseline;
      }
    }
    return null;
  }

  /** An approved snapshot of this name with exactly the same pixels, if any. */
  private findApprovedTwin(run: BaselineSearchRun, name: string, imageHash: string) {
    return this.prisma.snapshot.findFirst({
      where: {
        name,
        imageHash,
        status: 'approved',
        run: { projectId: run.projectId, suite: { in: [run.suite, DEFAULT_SUITE] } },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
  }

  /** Approve or reject a visual change. Only snapshots that differ from their baseline can be reviewed. */
  async updateStatus(user: CurrentUser, id: string, dto: UpdateSnapshotStatusDto): Promise<Snapshot> {
    await this.access.requireSnapshot(user, id, 'reviewer');
    if (dto?.status !== 'approved' && dto?.status !== 'rejected') {
      throw new BadRequestException('status must be "approved" or "rejected"');
    }
    const snapshot = await this.findById(id);
    if (!CHANGE_STATUSES.includes(snapshot.status)) {
      throw new BadRequestException(
        `Snapshot "${snapshot.name}" has no visual changes to review`,
      );
    }
    const row = await this.prisma.snapshot.update({
      where: { id },
      data: { status: dto.status, reviewedById: user.id, reviewedAt: new Date() },
      include: WITH_REVIEWER,
    });
    // Accepting the last change turns the pull request's check green
    await this.commitStatus.reportRun(row.runId);
    return this.toDto(row);
  }

  async getImageBuffer(id: string): Promise<Buffer> {
    const snapshot = await this.findById(id);
    // Unchanged snapshots are identical to their baseline, which holds the image
    if (snapshot.status === 'unchanged' && snapshot.baselineId) {
      return this.getImageBuffer(snapshot.baselineId);
    }
    return this.storage.get(imageKey(snapshot.runId, id));
  }

  async getDiffBuffer(id: string): Promise<Buffer> {
    const snapshot = await this.findById(id);
    return this.storage.get(diffKey(snapshot.runId, id));
  }

  /** Snapshot as returned by the API, with signed image URLs for the web UI. */
  private toDto(r: SnapshotRow): Snapshot {
    const changed = CHANGE_STATUSES.includes(r.status as SnapshotStatus);
    return {
      id: r.id,
      runId: r.runId,
      name: r.name,
      status: r.status as Snapshot['status'],
      baselineId: r.baselineId,
      diffScore: r.diffScore,
      createdAt: r.createdAt.toISOString(),
      imageUrl: this.urls.url(r.id, 'image'),
      baselineImageUrl: r.baselineId ? this.urls.url(r.baselineId, 'image') : null,
      diffUrl: changed ? this.urls.url(r.id, 'diff') : null,
      autoApprovedFromId: r.autoApprovedFromId,
      reviewedBy: r.reviewedBy?.email ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    };
  }
}

type BaselineSearchRun = {
  projectId: string;
  suite: string;
  branch: string;
  ancestors: string[];
  project: { defaultBranch: string };
};

function imageKey(runId: string, snapshotId: string) {
  return `runs/${runId}/${snapshotId}.png`;
}

function diffKey(runId: string, snapshotId: string) {
  return `runs/${runId}/${snapshotId}.diff.png`;
}
