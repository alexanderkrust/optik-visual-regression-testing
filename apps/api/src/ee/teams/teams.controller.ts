// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ProjectRole, SaveTeamDto } from '@optik/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccessService, CurrentUser } from '../../access/access.service';
import { User } from '../../access/current-user.decorator';
import { LicenseService } from '../../license/license.service';
import { TeamsService } from './teams.service';

/** Managing teams — admins, Enterprise edition. */
@ApiTags('teams (Enterprise)')
@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(
    private readonly teams: TeamsService,
    private readonly access: AccessService,
    private readonly license: LicenseService,
  ) {}

  private async authorize(user: CurrentUser) {
    this.access.requireAdmin(user);
    await this.license.require('teams');
  }

  @Get()
  async list(@User() user: CurrentUser) {
    await this.authorize(user);
    return this.teams.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a team' })
  async create(@User() user: CurrentUser, @Body() dto: SaveTeamDto) {
    await this.authorize(user);
    return this.teams.create(dto);
  }

  @Put(':id')
  async update(@User() user: CurrentUser, @Param('id') id: string, @Body() dto: SaveTeamDto) {
    await this.authorize(user);
    return this.teams.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a team — its members lose the access it gave them' })
  async remove(@User() user: CurrentUser, @Param('id') id: string) {
    await this.authorize(user);
    await this.teams.remove(id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a user by e-mail' })
  async addMember(@User() user: CurrentUser, @Param('id') id: string, @Body() body: { email: string }) {
    await this.authorize(user);
    return this.teams.addMember(id, body?.email);
  }

  @Delete(':id/members/:userId')
  async removeMember(@User() user: CurrentUser, @Param('id') id: string, @Param('userId') userId: string) {
    await this.authorize(user);
    return this.teams.removeMember(id, userId);
  }

  @Put(':id/projects/:slug')
  @ApiOperation({ summary: "Set the team's role in a project ({ role }; null removes it)" })
  async setProjectRole(
    @User() user: CurrentUser,
    @Param('id') id: string,
    @Param('slug') slug: string,
    @Body() body: { role: ProjectRole | null },
  ) {
    await this.authorize(user);
    return this.teams.setProjectRole(id, slug, body?.role ?? null);
  }
}

/**
 * Teams with access to a project, for its maintainers. Works without the
 * license, because team access does too.
 */
@ApiTags('teams (Enterprise)')
@Controller('projects/:slug/teams')
@UseGuards(JwtAuthGuard)
export class ProjectTeamsController {
  constructor(
    private readonly teams: TeamsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@User() user: CurrentUser, @Param('slug') slug: string) {
    const { project } = await this.access.requireProject(user, { slug }, 'maintainer');
    return this.teams.forProject(project.id);
  }
}
