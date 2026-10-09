import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CreateNotificationChannelDto } from '@optik/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { CurrentUser } from '../access/access.service';
import { User } from '../access/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('projects/:slug/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notification channels of a project (maintainer)' })
  list(@User() user: CurrentUser, @Param('slug') slug: string) {
    return this.notifications.list(user, slug);
  }

  @Post()
  @ApiOperation({ summary: 'Add a Slack, Teams, webhook or e-mail channel (maintainer)' })
  create(@User() user: CurrentUser, @Param('slug') slug: string, @Body() dto: CreateNotificationChannelDto) {
    return this.notifications.create(user, slug, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a channel (maintainer)' })
  async remove(@User() user: CurrentUser, @Param('slug') slug: string, @Param('id') id: string) {
    await this.notifications.remove(user, slug, id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test notification (maintainer)' })
  test(@User() user: CurrentUser, @Param('slug') slug: string, @Param('id') id: string) {
    return this.notifications.test(user, slug, id);
  }
}
