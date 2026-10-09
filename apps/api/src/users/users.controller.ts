import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CreateInvitationDto, UserRole } from '@optik/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { CurrentUser } from '../access/access.service';
import { User } from '../access/current-user.decorator';
import { UsersService } from './users.service';
import { InvitationsService } from './invitations.service';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (admin)' })
  list(@User() user: CurrentUser) {
    return this.users.list(user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change a user’s instance role (admin)' })
  setRole(@User() user: CurrentUser, @Param('id') id: string, @Body() body: { role: UserRole }) {
    return this.users.setRole(user, id, body?.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a user (admin)' })
  async remove(@User() user: CurrentUser, @Param('id') id: string) {
    await this.users.remove(user, id);
  }
}

@ApiTags('users')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Invite someone by email (admin) — returns the invitation link once' })
  create(@User() user: CurrentUser, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(user, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Pending invitations (admin)' })
  pending(@User() user: CurrentUser) {
    return this.invitations.pending(user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an invitation (admin)' })
  async revoke(@User() user: CurrentUser, @Param('id') id: string) {
    await this.invitations.revoke(user, id);
  }

  @Get('token/:token')
  @ApiOperation({ summary: 'Look up an invitation link' })
  lookup(@Param('token') token: string) {
    return this.invitations.lookup(token);
  }

  @Post('token/:token/accept')
  @ApiOperation({ summary: 'Accept an invitation: set a password and sign in' })
  accept(@Param('token') token: string, @Body() body: { password: string }) {
    return this.invitations.accept(token, body?.password);
  }
}
