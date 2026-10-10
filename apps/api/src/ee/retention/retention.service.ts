// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import type { Project, RetentionResult } from '@optik/shared';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AuditTrail } from '../../audit/audit-trail';
import { AccessService, CurrentUser } from '../../access/access.service';
import { LicenseService } from '../../license/license.service';
import { MaintenanceService } from '../../maintenance/maintenance.service';
import { ProjectsService } from '../../projects/projects.service';
import { diffKey, imageKey } from '../../snapshots/storage-keys';

const BATCH = 500;
const MAX_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;
const POLICY = { type: 'anonymous' as const, id: null, label: 'Retention policy' };

/**
 * Removes runs older than a project's retention period, with their images —
 * but never a baseline: the newest accepted snapshot per suite, branch and
 * name stays, and so does every baseline a newer run compares against.
 */
@Injectable()
export class RetentionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditTrail,
    private readonly access: AccessService,
    private readonly license: LicenseService,
    private readonly maintenance: MaintenanceService,
    private readonly projects: ProjectsService,
  ) {}

  onModuleInit() {
    this.maintenance.register({ name: 'retention', run: () => this.applyAll() });
  }

  async setDays(user: CurrentUser, slug: string, days: number | null): Promise<Project> {
    const { project } = await this.access.requireProject(user, { slug }, 'maintainer');
    await this.license.require('retention');
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > MAX_DAYS)) {
      throw new BadRequestException(`days must be a whole number from 1 to ${MAX_DAYS}, or null to keep everything`);
    }
    await this.prisma.project.update({ where: { id: project.id }, data: { retentionDays: days } });
    if (project.retentionDays !== days) {
      await this.audit.record({
        action: 'project.updated',
        project: { id: project.id, slug: project.slug },
        target: { type: 'project', id: project.id, label: project.name },
        details: { changes: { retentionDays: { from: project.retentionDays, to: days } } },
      });
    }
    return this.projects.findOne(user, slug);
  }

  /** Applies the policy to one project now (maintainers). */
  async applyNow(user: CurrentUser, slug: string): Promise<RetentionResult> {
    const { project } = await this.access.requireProject(user, { slug }, 'maintainer');
    await this.license.require('retention');
    if (project.retentionDays === null) throw new BadRequestException('This project keeps everything — set a retention period first');
    return this.apply(project, false);
  }

  /** Daily: every project with a retention period. */
  private async applyAll() {
    if (!(await this.license.has('retention'))) return;
    const projects = await this.prisma.project.findMany({ where: { retentionDays: { not: null } } });
    const totals: RetentionResult = { runsDeleted: 0, snapshotsDeleted: 0, bytesFreed: 0 };
    for (const project of projects) {
      const result = await this.apply(project, true);
      totals.runsDeleted += result.runsDeleted;
      totals.snapshotsDeleted += result.snapshotsDeleted;
      totals.bytesFreed += result.bytesFreed;
    }
    return totals.snapshotsDeleted || totals.runsDeleted ? { ...totals } : undefined;
  }

  async apply(
    project: { id: string; slug: string; retentionDays: number | null },
    scheduled: boolean,
  ): Promise<RetentionResult> {
    const result: RetentionResult = { runsDeleted: 0, snapshotsDeleted: 0, bytesFreed: 0 };
    if (project.retentionDays === null) return result;
    const cutoff = new Date(Date.now() - project.retentionDays * DAY_MS);

    const protectedIds = new Set(
      [
        // The current baseline of every suite, branch and name
        ...(await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT DISTINCT ON (r.suite, r.branch, s.name) s.id
          FROM snapshots s JOIN runs r ON r.id = s.run_id
          WHERE r.project_id = ${project.id} AND s.status IN ('new', 'approved')
          ORDER BY r.suite, r.branch, s.name, s.created_at DESC`),
        // Baselines that runs inside the retention period compare against
        ...(await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT DISTINCT s.baseline_id AS id
          FROM snapshots s JOIN runs r ON r.id = s.run_id
          WHERE r.project_id = ${project.id} AND (r.updated_at >= ${cutoff} OR r.status = 'running')
            AND s.baseline_id IS NOT NULL`),
      ].map((r) => r.id),
    );

    const oldRuns = { projectId: project.id, updatedAt: { lt: cutoff }, status: { not: 'running' as const } };
    let skip = 0;
    for (;;) {
      const batch = await this.prisma.snapshot.findMany({
        where: { run: oldRuns },
        select: { id: true, runId: true, imageBytes: true, diffBytes: true },
        orderBy: { id: 'asc' },
        skip,
        take: BATCH,
      });
      const doomed = batch.filter((s) => !protectedIds.has(s.id));
      skip += batch.length - doomed.length;
      if (doomed.length > 0) {
        await this.storage.delete(doomed.flatMap((s) => [imageKey(s.runId, s.id), diffKey(s.runId, s.id)]));
        await this.prisma.snapshot.deleteMany({ where: { id: { in: doomed.map((s) => s.id) } } });
        result.snapshotsDeleted += doomed.length;
        result.bytesFreed += doomed.reduce((sum, s) => sum + (s.imageBytes ?? 0) + (s.diffBytes ?? 0), 0);
      }
      if (batch.length < BATCH) break;
    }

    const { count } = await this.prisma.run.deleteMany({ where: { ...oldRuns, snapshots: { none: {} } } });
    result.runsDeleted = count;

    if (result.snapshotsDeleted || result.runsDeleted) {
      await this.audit.record({
        action: 'retention.applied',
        ...(scheduled ? { actor: POLICY } : {}),
        project: { id: project.id, slug: project.slug },
        details: { ...result, retentionDays: project.retentionDays, before: cutoff.toISOString() },
      });
    }
    return result;
  }
}
