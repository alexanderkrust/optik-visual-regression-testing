import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UpdateLicenseDto } from '@optik/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccessService, CurrentUser } from '../access/access.service';
import { User } from '../access/current-user.decorator';
import { LicenseService } from './license.service';

@ApiTags('license')
@Controller('license')
@UseGuards(JwtAuthGuard)
export class LicenseController {
  constructor(
    private readonly license: LicenseService,
    private readonly access: AccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Edition, license and reviewer count (admin)' })
  info(@User() user: CurrentUser) {
    this.access.requireAdmin(user);
    return this.license.info();
  }

  @Put()
  @ApiOperation({ summary: 'Install a license key (admin)' })
  set(@User() user: CurrentUser, @Body() dto: UpdateLicenseDto) {
    this.access.requireAdmin(user);
    return this.license.set(dto?.key);
  }

  @Delete()
  @ApiOperation({ summary: 'Remove the license key — back to Community (admin)' })
  remove(@User() user: CurrentUser) {
    this.access.requireAdmin(user);
    return this.license.remove();
  }
}
