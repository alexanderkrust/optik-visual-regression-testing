import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ImageUrlSigner } from './image-urls';
import { DEFAULT_SUITE } from '../runs/runs.service';
import { CommitStatusService } from '../ci/commit-status.service';
import { AccessService, CurrentUser } from '../access/access.service';

const WITH_REVIEWER = {
  reviewedBy: { select: { email: true } },
  _count: { select: { comments: true } },
} as const;
type SnapshotRow = PrismaSnapshot & {
  reviewedBy?: { email: string } | null;
  _count?: { comments: number };
};
import { StorageService } from '../storage/storage.service';
import { diffKey, imageKey } from './storage-keys';
import { DiffService } from '../diff/diff.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditTrail } from '../audit/audit-trail';
import type {
  IgnoreRegion,
  Snapshot,
  SnapshotSettings,
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

const DEFAULT_SETTINGS: SnapshotSettings = { ignoreRegions: [], threshold: 0 };
const MAX_REGIONS = 50;

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly urls: ImageUrlSigner,
    private readonly commitStatus: CommitStatusService,
    private readonly access: AccessService,
    private readonly diff: DiffService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditTrail,
  ) {}

  async findByRun(user: CurrentUser, runId: string): Promise<Snapshot[]> {
    await this.access.requireRun(user, runId, 'viewer');
    const run = await this.prisma.run.findUniqueOrThrow({
      where: { id: runId },
      select: { projectId: true, suite: true },
    });
    const rows = await this.prisma.snapshot.findMany({
      where: { runId },
      include: WITH_REVIEWER,
      orderBy: { createdAt: 'asc' },
    });
    const settings = await this.settingsFor(run.projectId, run.suite, rows.map((r) => r.name));
    return rows.map((row) => this.toDto(row, settings.get(row.name)));
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

    let baseline = await this.findBaseline(run, name);

    // A baseline whose image is gone (e.g. stored before the move to S3) can't be
    // compared against — treat the snapshot as new so it becomes the baseline.
    const baselineImage = baseline
      ? await this.storage
          .get(imageKey(baseline.runId, baseline.id))
          .catch((err) => (err instanceof NotFoundException ? null : Promise.reject(err)))
      : null;
    if (!baselineImage) baseline = null;

    const settings = (await this.settingsFor(run.projectId, run.suite, [name])).get(name) ?? DEFAULT_SETTINGS;

    // Decoding, hashing and diffing run in a worker thread (see DiffService)
    let analysis: Awaited<ReturnType<DiffService['analyse']>>;
    try {
      analysis = await this.diff.analyse({
        image,
        baseline: baselineImage,
        ignoreRegions: settings.ignoreRegions,
      });
    } catch {
      throw new BadRequestException(`Snapshot "${name}" is not a valid PNG`);
    }
    const { imageHash } = analysis;

    let status: SnapshotStatus = 'new';
    let diffScore: number | null = null;
    let diffImage: Buffer | null = null;

    if (analysis.diff) {
      const changed = exceeds(analysis.diff, settings.threshold);
      status = changed ? 'pending' : 'unchanged';
      diffScore = analysis.diff.diffScore;
      // Changes within the threshold keep their images, so reviewers see what was tolerated
      if (analysis.diff.diffCount > 0 || changed) diffImage = Buffer.from(analysis.diff.diffImage);
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
        imageBytes: status !== 'unchanged' || diffImage ? image.length : null,
        diffBytes: diffImage?.length ?? null,
      },
    });

    if (status !== 'unchanged' || diffImage) await this.storage.put(imageKey(runId, snapshot.id), image);
    if (diffImage) await this.storage.put(diffKey(runId, snapshot.id), diffImage);

    return {
      ...this.toDto(snapshot, settings),
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
    const { project } = await this.access.requireSnapshot(user, id, 'reviewer');
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
      include: { ...WITH_REVIEWER, run: { select: { branch: true, suite: true, commitSha: true } } },
    });
    await this.audit.record({
      action: dto.status === 'approved' ? 'snapshot.approved' : 'snapshot.rejected',
      project: { id: project.id, slug: project.slug },
      target: { type: 'snapshot', id, label: row.name },
      details: {
        runId: row.runId,
        branch: row.run.branch,
        suite: row.run.suite,
        commit: row.run.commitSha,
        previousStatus: snapshot.status,
        diffScore: row.diffScore,
      },
    });
    // Accepting the last change turns the pull request's check green
    await this.commitStatus.reportRun(row.runId);
    // … and tells the team the review is done
    if (snapshot.status === 'pending') await this.notifyIfReviewed(row.runId);
    return this.dtoWithSettings(row);
  }

  private async notifyIfReviewed(runId: string) {
    const open = await this.prisma.snapshot.count({ where: { runId, status: 'pending' } });
    if (open === 0) await this.notifications.notifyRun(runId, 'run.reviewed');
  }

  /**
   * Saves the review settings of a snapshot's name (in its project and suite)
   * and applies them to its open changes right away: a change that is now
   * ignored or within the threshold becomes `unchanged` — the commit status
   * turns green without re-running CI. Changes that still exceed them stay as
   * they are; the settings apply to them from the next run on.
   */
  async updateSettings(user: CurrentUser, id: string, dto: SnapshotSettings): Promise<Snapshot> {
    const { project } = await this.access.requireSnapshot(user, id, 'reviewer');
    const settings = validateSettings(dto);
    const snapshot = await this.prisma.snapshot.findUniqueOrThrow({
      where: { id },
      select: { name: true, run: { select: { projectId: true, suite: true } } },
    });
    const { projectId, suite } = snapshot.run;
    const name = snapshot.name;
    await this.prisma.snapshotSetting.upsert({
      where: { projectId_suite_name: { projectId, suite, name } },
      create: { projectId, suite, name, ...settings, ignoreRegions: settings.ignoreRegions as object[] },
      update: { ...settings, ignoreRegions: settings.ignoreRegions as object[] },
    });

    const open = await this.prisma.snapshot.findMany({
      where: { name, status: 'pending', baselineId: { not: null }, run: { projectId, suite } },
      select: { id: true, runId: true, baselineId: true },
    });
    for (const change of open) await this.reevaluate(change, settings);
    await this.audit.record({
      action: 'snapshot.settings_updated',
      project: { id: project.id, slug: project.slug },
      target: { type: 'snapshot', id, label: name },
      details: { suite, ignoreRegions: settings.ignoreRegions.length, threshold: settings.threshold },
    });

    const row = await this.prisma.snapshot.findUniqueOrThrow({ where: { id }, include: WITH_REVIEWER });
    return this.toDto(row, settings);
  }

  private async reevaluate(
    change: { id: string; runId: string; baselineId: string | null },
    settings: SnapshotSettings,
  ) {
    const [image, baseline] = await Promise.all([
      this.storage.get(imageKey(change.runId, change.id)),
      this.getImageBuffer(change.baselineId!),
    ]).catch(() => [null, null]);
    if (!image || !baseline) return;
    const { diff } = await this.diff.analyse({ image, baseline, ignoreRegions: settings.ignoreRegions });
    if (!diff || exceeds(diff, settings.threshold)) return;

    await this.prisma.snapshot.update({
      where: { id: change.id },
      data: { status: 'unchanged', diffScore: diff.diffScore, diffBytes: diff.diffImage.length },
    });
    await this.storage.put(diffKey(change.runId, change.id), Buffer.from(diff.diffImage));
    await this.commitStatus.reportRun(change.runId);
    await this.notifyIfReviewed(change.runId);
  }

  /** Review settings per snapshot name, for the names that have any. */
  private async settingsFor(projectId: string, suite: string, names: string[]) {
    const rows = await this.prisma.snapshotSetting.findMany({
      where: { projectId, suite, name: { in: names } },
    });
    return new Map<string, SnapshotSettings>(
      rows.map((r) => [
        r.name,
        { ignoreRegions: r.ignoreRegions as unknown as IgnoreRegion[], threshold: r.threshold },
      ]),
    );
  }

  private async dtoWithSettings(row: SnapshotRow): Promise<Snapshot> {
    const run = await this.prisma.run.findUniqueOrThrow({
      where: { id: row.runId },
      select: { projectId: true, suite: true },
    });
    const settings = await this.settingsFor(run.projectId, run.suite, [row.name]);
    return this.toDto(row, settings.get(row.name));
  }

  async getImageBuffer(id: string): Promise<Buffer> {
    const snapshot = await this.findById(id);
    // Unchanged snapshots usually equal their baseline, which holds the image.
    // Those that differed within their threshold, or were changes resolved by
    // new settings, keep their own.
    if (snapshot.status === 'unchanged' && snapshot.baselineId) {
      const own = await this.storage
        .get(imageKey(snapshot.runId, id))
        .catch((err) => (err instanceof NotFoundException ? null : Promise.reject(err)));
      return own ?? this.getImageBuffer(snapshot.baselineId);
    }
    return this.storage.get(imageKey(snapshot.runId, id));
  }

  async getDiffBuffer(id: string): Promise<Buffer> {
    const snapshot = await this.findById(id);
    return this.storage.get(diffKey(snapshot.runId, id));
  }

  /** Snapshot as returned by the API, with signed image URLs for the web UI. */
  private toDto(r: SnapshotRow, settings: SnapshotSettings = DEFAULT_SETTINGS): Snapshot {
    const changed = CHANGE_STATUSES.includes(r.status as SnapshotStatus) || hasOwnDiff(r);
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
      settings,
      commentCount: r._count?.comments ?? 0,
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

/**
 * Unchanged snapshots that differed within their threshold (or were resolved
 * by new settings) keep their own image and diff.
 */
function hasOwnDiff(s: { status: string; diffScore: number | null }) {
  return s.status === 'unchanged' && (s.diffScore ?? 0) > 0;
}

/** Whether a comparison counts as a change: a new size, or more changed pixels than allowed. */
function exceeds(diff: { diffCount: number; diffScore: number; sizeChanged: boolean }, threshold: number) {
  return diff.sizeChanged || (diff.diffCount > 0 && diff.diffScore > threshold);
}

function validateSettings(dto: SnapshotSettings): SnapshotSettings {
  const threshold = dto?.threshold ?? 0;
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new BadRequestException('threshold must be a number between 0 and 1');
  }
  const regions = dto?.ignoreRegions ?? [];
  if (!Array.isArray(regions) || regions.length > MAX_REGIONS) {
    throw new BadRequestException(`ignoreRegions must be a list of at most ${MAX_REGIONS} regions`);
  }
  const ignoreRegions = regions.map((r) => {
    const values = [r?.x, r?.y, r?.width, r?.height];
    if (!values.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100_000)) {
      throw new BadRequestException('Each ignore region needs x, y, width and height in pixels');
    }
    const [x, y, width, height] = values.map(Math.round);
    if (width < 1 || height < 1) throw new BadRequestException('Ignore regions must not be empty');
    return { x, y, width, height };
  });
  return { ignoreRegions, threshold };
}

