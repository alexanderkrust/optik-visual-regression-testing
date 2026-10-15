import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { availableParallelism } from 'os';
import { join } from 'path';
import { Piscina } from 'piscina';
import { checkPngPixels, DEFAULT_MAX_PIXELS } from '@optik/core';
import { analyse, AnalyseInput, AnalyseResult } from './analyse';

/**
 * Runs image analysis (decode, hash, diff) in a pool of worker threads, so
 * large screenshots don't block the API's event loop and several diffs run in
 * parallel. DIFF_WORKERS sets the pool size (default: CPU cores, at most 4);
 * 0 runs them inline on the main thread.
 *
 * MAX_IMAGE_PIXELS (default 50 megapixels) limits screenshots and
 * comparisons; larger ones throw ImageTooLargeError before they are decoded.
 */
/** Screenshots waiting for a worker thread (for the optik_diff_queue metric). */
export let diffQueueSize = () => 0;

@Injectable()
export class DiffService implements OnModuleDestroy {
  private readonly logger = new Logger(DiffService.name);
  private readonly pool: Piscina | null;
  readonly maxPixels: number;

  constructor(config: ConfigService) {
    const limit = config.get<string>('MAX_IMAGE_PIXELS');
    this.maxPixels = limit ? Number(limit) : DEFAULT_MAX_PIXELS;
    if (!Number.isFinite(this.maxPixels) || this.maxPixels < 1) {
      throw new Error(`MAX_IMAGE_PIXELS must be a positive number of pixels, not "${limit}"`);
    }

    const configured = config.get<string>('DIFF_WORKERS');
    const size =
      configured !== undefined && configured !== ''
        ? Math.max(0, Number(configured))
        : Math.min(4, availableParallelism());

    if (size === 0) {
      this.pool = null;
      return;
    }

    // Compiled: diff.worker.js. In tests the sources run through ts-node.
    const compiled = __filename.endsWith('.js');
    this.pool = new Piscina({
      filename: join(__dirname, `diff.worker.${compiled ? 'js' : 'ts'}`),
      // All workers start right away, so the first upload doesn't wait for one
      maxThreads: size,
      minThreads: size,
      execArgv: compiled ? [] : ['-r', 'ts-node/register/transpile-only'],
    });
    this.logger.log(`Diffing in ${size} worker thread${size === 1 ? '' : 's'}`);
    const pool = this.pool;
    diffQueueSize = () => pool.queueSize;
  }

  async analyse(input: AnalyseInput): Promise<AnalyseResult> {
    // Here too, not only in the worker: errors from worker threads lose their class
    checkPngPixels(input.image, input.baseline, this.maxPixels);
    input = { ...input, maxPixels: this.maxPixels };
    if (!this.pool) return analyse(input);
    const result = (await this.pool.run(input)) as AnalyseResult;
    // Typed arrays come back as plain Uint8Arrays — hand out Buffers again
    if (result.diff) result.diff.diffImage = Buffer.from(result.diff.diffImage);
    return result;
  }

  async onModuleDestroy() {
    await this.pool?.destroy();
  }
}
