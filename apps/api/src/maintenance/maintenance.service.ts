import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { diffKey, imageKey } from '../snapshots/storage-keys';

export interface MaintenanceTask {
  name: string;
  /** Returns what it did, for the log */
  run(): Promise<Record<string, unknown> | void>;
}

const LEASE_KEY = 'maintenance.lease';
const LEASE_MS = 30 * 60 * 1000;
const FIRST_RUN_MS = 60 * 1000;
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const MEASURE_BATCH = 1000;

/**
 * Daily housekeeping (storage measurement; retention in the Enterprise
 * edition). With several instances behind a load balancer only one runs it:
 * it takes a lease in the database, which expires if that instance dies.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly tasks: MaintenanceTask[] = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    this.register({ name: 'storage measurement', run: () => this.measureStorage() });
  }

  register(task: MaintenanceTask) {
    this.tasks.push(task);
  }

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    this.timers.push(setTimeout(() => void this.runAll(), FIRST_RUN_MS).unref());
    this.timers.push(setInterval(() => void this.runAll(), INTERVAL_MS).unref());
  }

  onModuleDestroy() {
    this.timers.forEach(clearTimeout);
  }

  /** Runs every task once, unless another instance is already at it. */
  async runAll(): Promise<boolean> {
    if (!(await this.acquireLease())) return false;
    try {
      for (const task of this.tasks) {
        try {
          const result = await task.run();
          if (result) this.logger.log(`${task.name}: ${JSON.stringify(result)}`);
        } catch (err) {
          this.logger.error(`${task.name} failed: ${(err as Error).message}`);
        }
      }
      return true;
    } finally {
      await this.releaseLease();
    }
  }

  private async acquireLease(): Promise<boolean> {
    const now = new Date();
    const rows = await this.prisma.$queryRaw<unknown[]>`
      INSERT INTO instance_settings (key, value) VALUES (${LEASE_KEY}, ${new Date(now.getTime() + LEASE_MS).toISOString()})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE instance_settings.value < ${now.toISOString()}
      RETURNING key`;
    return rows.length > 0;
  }

  private async releaseLease() {
    await this.prisma.instanceSetting.updateMany({
      where: { key: LEASE_KEY },
      data: { value: new Date(0).toISOString() },
    });
  }

  /**
   * Fills in the sizes of images stored before optik recorded them, a batch
   * per run. Missing images count as 0, so they aren't measured again.
   */
  private async measureStorage() {
    const rows = await this.prisma.snapshot.findMany({
      where: {
        OR: [
          { imageBytes: null, OR: [{ status: { not: 'unchanged' } }, { diffScore: { gt: 0 } }] },
          { diffBytes: null, OR: [{ status: { in: ['pending', 'approved', 'rejected'] } }, { diffScore: { gt: 0 } }] },
        ],
      },
      select: { id: true, runId: true, imageBytes: true, diffBytes: true },
      take: MEASURE_BATCH,
    });
    for (const row of rows) {
      const [image, diff] = await Promise.all([
        row.imageBytes === null ? this.storage.size(imageKey(row.runId, row.id)) : row.imageBytes,
        row.diffBytes === null ? this.storage.size(diffKey(row.runId, row.id)) : row.diffBytes,
      ]);
      await this.prisma.snapshot.update({
        where: { id: row.id },
        data: { imageBytes: image ?? 0, diffBytes: diff ?? 0 },
      });
    }
    return rows.length ? { measured: rows.length } : undefined;
  }
}
