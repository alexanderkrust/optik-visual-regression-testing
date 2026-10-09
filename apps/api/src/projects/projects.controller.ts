import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { CreateProjectDto, UpdateProjectDto } from '@optik/shared';

@ApiTags('projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  findAll() {
    return this.projectsService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a project' })
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a project' })
  findOne(@Param('slug') slug: string) {
    return this.projectsService.findBySlug(slug);
  }

  @Patch(':slug')
  @ApiOperation({ summary: 'Update project settings (default branch)' })
  update(@Param('slug') slug: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(slug, dto);
  }
}
