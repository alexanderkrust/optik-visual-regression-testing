import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { PrismaService } from '../database/prisma.service';
import { LicenseService } from '../license/license.service';
import { diffQueueSize } from '../diff/diff.service';

/** One registry per process; tests start several apps in one process. */
const registry = new Registry();
collectDefaultMetrics({ register: registry });

const metric = <T>(name: string, create: () => T): T =>
  (registry.getSingleMetric(name) as T | undefined) ?? create();

/**
 * Prometheus metrics (GET /api/metrics): HTTP requests, snapshots, diffs,
 * reviews, notifications, commit statuses, open changes and the license —
 * plus Node.js process metrics.
 */
@Injectable()
export class MetricsService {
  readonly http = metric(
    'optik_http_request_duration_seconds',
    () =>
      new Histogram({
        name: 'optik_http_request_duration_seconds',
        help: 'HTTP requests by route pattern, method and status',
        labelNames: ['method', 'route', 'status'],
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        registers: [registry],
      }),
  );
  readonly snapshots = metric(
    'optik_snapshots_total',
    () => new Counter({ name: 'optik_snapshots_total', help: 'Submitted snapshots by result', labelNames: ['status'], registers: [registry] }),
  );
  readonly diffDuration = metric(
    'optik_diff_duration_seconds',
    () =>
      new Histogram({
        name: 'optik_diff_duration_seconds',
        help: 'Decoding, hashing and comparing a screenshot',
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
        registers: [registry],
      }),
  );
  readonly runs = metric(
    'optik_runs_completed_total',
    () =>
      new Counter({
        name: 'optik_runs_completed_total',
        help: 'Completed runs; merged = had no changes and was merged into the previous run',
        labelNames: ['merged'],
        registers: [registry],
      }),
  );
  readonly reviews = metric(
    'optik_reviews_total',
    () => new Counter({ name: 'optik_reviews_total', help: 'Accepted and rejected changes', labelNames: ['decision'], registers: [registry] }),
  );
  readonly notifications = metric(
    'optik_notifications_total',
    () =>
      new Counter({
        name: 'optik_notifications_total',
        help: 'Notification deliveries by channel type and result',
        labelNames: ['type', 'result'],
        registers: [registry],
      }),
  );
  readonly commitStatuses = metric(
    'optik_commit_statuses_total',
    () =>
      new Counter({
        name: 'optik_commit_statuses_total',
        help: 'Commit statuses sent to CI systems by provider and result',
        labelNames: ['provider', 'result'],
        registers: [registry],
      }),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly license: LicenseService,
  ) {
    // Measured when Prometheus scrapes, so they are always current
    metric(
      'optik_open_changes',
      () =>
        new Gauge({
          name: 'optik_open_changes',
          help: 'Visual changes waiting for review',
          registers: [registry],
          collect: async function () {
            this.set(await currentPrisma!.snapshot.count({ where: { status: 'pending' } }));
          },
        }),
    );
    metric(
      'optik_license_edition',
      () =>
        new Gauge({
          name: 'optik_license_edition',
          help: 'Edition in effect (1 for the current one)',
          labelNames: ['edition'],
          registers: [registry],
          collect: async function () {
            const edition = await currentLicense!.edition();
            for (const e of ['community', 'team', 'enterprise']) this.set({ edition: e }, e === edition ? 1 : 0);
          },
        }),
    );
    metric(
      'optik_diff_queue',
      () =>
        new Gauge({
          name: 'optik_diff_queue',
          help: 'Screenshots waiting for a diff worker',
          registers: [registry],
          collect: function () {
            this.set(diffQueueSize());
          },
        }),
    );
    // The gauges above are created once per process; point them at this app
    currentPrisma = prisma;
    currentLicense = license;
  }

  /** The text format Prometheus reads. */
  async render(): Promise<{ contentType: string; body: string }> {
    return { contentType: registry.contentType, body: await registry.metrics() };
  }
}

let currentPrisma: PrismaService | undefined;
let currentLicense: LicenseService | undefined;
