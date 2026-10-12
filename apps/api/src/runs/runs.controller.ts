import { Controller, Get, Post, Param, Query, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RunsService } from './runs.service';
import type { CurrentUser } from '../access/access.service';
import { User } from '../access/current-user.decorator';
import { TokenGuard } from '../tokens/token.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { CompleteRunDto, CreateRunDto, TurboSnapBaseDto } from '@optik/shared';

@ApiTags('runs')
@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List test runs for a project' })
  @ApiQuery({ name: 'project', required: true })
  findByProject(@User() user: CurrentUser, @Query('project') project: string) {
    return this.runsService.findByProject(user, project);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a single run' })
  findById(@User() user: CurrentUser, @Param('id') id: string) {
    return this.runsService.findVisible(user, id);
  }

  @Post()
  @UseGuards(TokenGuard)
  @ApiOperation({ summary: 'Start a new run' })
  create(@Req() req: any, @Body() dto: CreateRunDto) {
    return this.runsService.create(req.projectSlug, dto);
  }

  @Post('turbosnap-base')
  @UseGuards(TokenGuard)
  @ApiOperation({
    summary: 'Commit to compare against for TurboSnap',
    description:
      'The newest run on one of the given commits (newest first) in the suite that completed with the same captureKey ' +
      'and has no open or rejected changes. commitSha is null when there is none — capture everything then.',
  })
  turboSnapBase(@Req() req: any, @Body() dto: TurboSnapBaseDto) {
    return this.runsService.turboSnapBase(req.projectId, dto);
  }

  @Post(':id/complete')
  @UseGuards(TokenGuard)
  @ApiOperation({
    summary: 'Mark run as complete',
    description:
      'A run without visual changes is merged into the previous run of the branch if that one had no changes either. Returns the remaining run. ' +
      'Optional body { captureKey } — the capture settings, only when nothing failed to capture (see turbosnap-base).',
  })
  complete(@Req() req: any, @Param('id') id: string, @Body() dto?: CompleteRunDto) {
    return this.runsService.complete(req.projectId, id, dto ?? {});
  }
}
