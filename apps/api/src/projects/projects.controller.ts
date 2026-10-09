import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CreateProjectDto, UpdateProjectDto } from '@optik/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { CurrentUser } from '../access/access.service';
import { User } from '../access/current-user.decorator';
import { ProjectsService, SetProjectMemberDto } from './projects.service';

@ApiTags('projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List the projects the signed-in user can see' })
  findAll(@User() user: CurrentUser) {
    return this.projectsService.findAll(user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a project (admin)' })
  create(@User() user: CurrentUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user, dto);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a project (viewer)' })
  findOne(@User() user: CurrentUser, @Param('slug') slug: string) {
    return this.projectsService.findOne(user, slug);
  }

  @Patch(':slug')
  @ApiOperation({ summary: 'Update project settings (maintainer)' })
  update(@User() user: CurrentUser, @Param('slug') slug: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(user, slug, dto);
  }

  @Get(':slug/members')
  @ApiOperation({ summary: 'List project members (maintainer)' })
  members(@User() user: CurrentUser, @Param('slug') slug: string) {
    return this.projectsService.members(user, slug);
  }

  @Put(':slug/members')
  @ApiOperation({ summary: 'Add an existing user or change their role (maintainer)' })
  setMember(@User() user: CurrentUser, @Param('slug') slug: string, @Body() dto: SetProjectMemberDto) {
    return this.projectsService.setMember(user, slug, dto);
  }

  @Delete(':slug/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a project member (maintainer)' })
  async removeMember(@User() user: CurrentUser, @Param('slug') slug: string, @Param('userId') userId: string) {
    await this.projectsService.removeMember(user, slug, userId);
  }
}
