import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from './database/prisma.service';
import { StorageService } from './storage/storage.service';

/** Product version — the package.json next to dist/ in the image and in development. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../package.json') as { version: string };

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Liveness: the process is up. */
  @Get('health')
  @ApiOperation({ summary: 'Liveness check' })
  health() {
    return { status: 'ok', version };
  }

  /** Readiness: database and storage are reachable. */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness check (database and storage)' })
  async ready() {
    const checks = {
      database: await this.prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
      storage: await this.storage.ping(),
    };
    if (!checks.database || !checks.storage) {
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: 'ok', checks };
  }
}
