import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { availableParallelism } from 'os';
import { join } from 'path';
import { Piscina } from 'piscina';
import { analyse, AnalyseInput, AnalyseResult } from './analyse';

/**
 * Runs image analysis (decode, hash, diff) in a pool of worker threads, so
 * large screenshots don't block the API's event loop and several diffs run in
 * parallel. DIFF_WORKERS sets the pool size (default: CPU cores, at most 4);
 * 0 runs them inline on the main thread.
 */
@Injectable()
export class DiffService implements OnModuleDestroy {
  private readonly logger = new Logger(DiffService.name);
  private readonly pool: Piscina | null;

  constructor(config: ConfigService) {
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
  }

  async analyse(input: AnalyseInput): Promise<AnalyseResult> {
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
