import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ImageUrlSigner } from './image-urls';
import { DEFAULT_SUITE } from '../runs/runs.service';
import { StorageService } from '../storage/storage.service';
import { computeDiff } from '@optik/core';
import type {
  Snapshot,
  SnapshotStatus,
  SubmittedSnapshot,
  UpdateSnapshotStatusDto,
} from '@optik/shared';
import type { Snapshot as PrismaSnapshot } from '@prisma/client';

/** Statuses of snapshots that differ from their baseline (and have a diff image). */
const CHANGE_STATUSES: SnapshotStatus[] = ['pending', 'approved', 'rejected'];

/** Statuses whose image is a valid baseline for later runs. */
const BASELINE_STATUSES: SnapshotStatus[] = ['new', 'approved'];

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly urls: ImageUrlSigner,
  ) {}

  async findByRun(runId: string): Promise<Snapshot[]> {
    const rows = await this.prisma.snapshot.findMany({
      where: { runId },
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
   * Stores a screenshot and compares it with the current baseline — the latest
   * `new` or `approved` snapshot of the same name in the run's suite (see findBaseline).
   *
   * - no baseline        → `new` (becomes the baseline)
   * - identical          → `unchanged` (image not stored — it equals the baseline)
   * - any pixel differs  → `pending` (needs review; adapters fail the test)
   */
  async submit(
    projectId: string,
    runId: string,
    name: string,
    image: Buffer,
  ): Promise<SubmittedSnapshot> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: { id: true, projectId: true, suite: true, project: { select: { slug: true } } },
    });
    // A token may only write to runs of its own project; don't reveal others
    if (!run || run.projectId !== projectId) {
      throw new NotFoundException(`Run "${runId}" not found`);
    }

    let baseline = await this.findBaseline(run.projectId, run.suite, name);

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

    const snapshot = await this.prisma.snapshot.create({
      data: { runId, name, status, diffScore, baselineId: baseline?.id ?? null },
    });

    if (status !== 'unchanged') await this.storage.put(imageKey(runId, snapshot.id), image);
    if (diffImage) await this.storage.put(diffKey(runId, snapshot.id), diffImage);

    return {
      ...this.toDto(snapshot),
      reviewPath: `/${run.project.slug}/${runId}?snapshot=${snapshot.id}`,
    };
  }

  /**
   * Latest accepted snapshot of this name in the suite. Runs from before suites
   * existed belong to the "default" suite; other suites fall back to it so
   * existing baselines (and their reviews) carry over.
   */
  private async findBaseline(projectId: string, suite: string, name: string) {
    for (const s of suite === DEFAULT_SUITE ? [suite] : [suite, DEFAULT_SUITE]) {
      const baseline = await this.prisma.snapshot.findFirst({
        where: {
          name,
          status: { in: BASELINE_STATUSES },
          run: { projectId, suite: s },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, runId: true },
      });
      if (baseline) return baseline;
    }
    return null;
  }

  /** Approve or reject a visual change. Only snapshots that differ from their baseline can be reviewed. */
  async updateStatus(id: string, dto: UpdateSnapshotStatusDto): Promise<Snapshot> {
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
      data: { status: dto.status },
    });
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
  private toDto(r: PrismaSnapshot): Snapshot {
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
    };
  }
}

function imageKey(runId: string, snapshotId: string) {
  return `runs/${runId}/${snapshotId}.png`;
}

function diffKey(runId: string, snapshotId: string) {
  return `runs/${runId}/${snapshotId}.diff.png`;
}
