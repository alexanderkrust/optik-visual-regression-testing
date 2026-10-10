import { Controller, Get, Headers, NotFoundException, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { MetricsService } from './metrics.service';

@ApiTags('health')
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Prometheus metrics',
    description: 'Off with METRICS_ENABLED=false; with METRICS_TOKEN set, scrapers send it as a bearer token.',
  })
  async scrape(@Headers('authorization') authorization: string | undefined, @Res() res: any) {
    if (this.config.get<string>('METRICS_ENABLED') === 'false') throw new NotFoundException();
    const token = this.config.get<string>('METRICS_TOKEN');
    if (token) {
      const given = Buffer.from(authorization?.replace(/^Bearer /, '') ?? '');
      const expected = Buffer.from(token);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new UnauthorizedException('Metrics need the METRICS_TOKEN');
      }
    }
    const { contentType, body } = await this.metrics.render();
    res.header('Content-Type', contentType).header('Cache-Control', 'no-store').send(body);
  }
}
