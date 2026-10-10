// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { Body, Controller, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { CurrentUser } from '../../access/access.service';
import { User } from '../../access/current-user.decorator';
import { RetentionService } from './retention.service';

@ApiTags('retention (Enterprise)')
@Controller('projects/:slug/retention')
@UseGuards(JwtAuthGuard)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Put()
  @ApiOperation({ summary: 'Keep runs for { days } (null keeps everything) — maintainer' })
  set(@User() user: CurrentUser, @Param('slug') slug: string, @Body() body: { days: number | null }) {
    return this.retention.setDays(user, slug, body?.days ?? null);
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply the retention period now — maintainer' })
  run(@User() user: CurrentUser, @Param('slug') slug: string) {
    return this.retention.applyNow(user, slug);
  }
}
