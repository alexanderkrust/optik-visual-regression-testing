// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SaveIdentityProviderDto, SsoSettings } from '@optik/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccessService, CurrentUser } from '../../access/access.service';
import { User } from '../../access/current-user.decorator';
import { LicenseService } from '../../license/license.service';
import { RequestInfo, SsoService } from './sso.service';

const requestInfo = (req: any): RequestInfo => ({
  protocol: req.protocol,
  hostname: req.hostname,
  cookieHeader: req.headers?.cookie,
});

/** Setting up identity providers — admins, Enterprise edition. */
@ApiTags('single sign-on (Enterprise)')
@Controller('sso')
@UseGuards(JwtAuthGuard)
export class SsoAdminController {
  constructor(
    private readonly sso: SsoService,
    private readonly access: AccessService,
    private readonly license: LicenseService,
  ) {}

  private async authorize(user: CurrentUser) {
    this.access.requireAdmin(user);
    await this.license.require('sso');
  }

  @Get('providers')
  @ApiOperation({ summary: 'Identity providers' })
  async list(@User() user: CurrentUser, @Req() req: any) {
    await this.authorize(user);
    return this.sso.list(requestInfo(req));
  }

  @Post('providers')
  @ApiOperation({ summary: 'Add an OpenID Connect provider' })
  async create(@User() user: CurrentUser, @Body() dto: SaveIdentityProviderDto, @Req() req: any) {
    await this.authorize(user);
    return this.sso.create(dto, requestInfo(req));
  }

  @Put('providers/:id')
  @ApiOperation({ summary: 'Change a provider' })
  async update(@User() user: CurrentUser, @Param('id') id: string, @Body() dto: SaveIdentityProviderDto, @Req() req: any) {
    await this.authorize(user);
    return this.sso.update(id, dto, requestInfo(req));
  }

  @Delete('providers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a provider — its users keep their accounts' })
  async remove(@User() user: CurrentUser, @Param('id') id: string) {
    await this.authorize(user);
    await this.sso.remove(id);
  }

  @Post('providers/:id/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Read the provider's discovery document" })
  async check(@User() user: CurrentUser, @Param('id') id: string) {
    await this.authorize(user);
    return this.sso.check(id);
  }

  @Get('settings')
  async settings(@User() user: CurrentUser) {
    await this.authorize(user);
    return this.sso.settings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Who may still sign in with a password ("all" or "admins")' })
  async updateSettings(@User() user: CurrentUser, @Body() dto: SsoSettings) {
    await this.authorize(user);
    return this.sso.updateSettings(dto);
  }
}

/** The sign-in itself — public. */
@ApiTags('single sign-on (Enterprise)')
@Controller('auth/sso')
export class SsoLoginController {
  constructor(private readonly sso: SsoService) {}

  @Get('providers')
  @ApiOperation({ summary: 'Sign-in options for the sign-in page' })
  providers() {
    return this.sso.loginOptions();
  }

  @Get(':id/start')
  @ApiOperation({ summary: 'Redirects the browser to the provider' })
  async start(@Param('id') id: string, @Query('returnTo') returnTo: string, @Req() req: any, @Res() res: any) {
    const { url, cookie } = await this.sso.start(id, returnTo, requestInfo(req));
    res.header('Set-Cookie', cookie).header('Cache-Control', 'no-store').redirect(302, url);
  }

  @Get(':id/callback')
  @ApiOperation({ summary: 'Where the provider sends the browser back' })
  async callback(@Param('id') id: string, @Query() query: Record<string, string>, @Req() req: any, @Res() res: any) {
    const { redirect, clearCookie } = await this.sso.callback(id, query, requestInfo(req));
    res.header('Set-Cookie', clearCookie).header('Cache-Control', 'no-store').redirect(302, redirect);
  }

  @Post(':id/callback')
  @ApiOperation({ summary: 'Where a SAML provider posts its response (assertion consumer service)' })
  async samlCallback(@Param('id') id: string, @Body() body: Record<string, string>, @Req() req: any, @Res() res: any) {
    const { redirect, clearCookie } = await this.sso.samlCallback(id, body, requestInfo(req));
    res.header('Set-Cookie', clearCookie).header('Cache-Control', 'no-store').redirect(303, redirect);
  }

  @Get(':id/metadata')
  @ApiOperation({ summary: "optik's SAML service provider metadata" })
  async metadata(@Param('id') id: string, @Req() req: any, @Res() res: any) {
    res.header('Content-Type', 'application/samlmetadata+xml').send(await this.sso.metadata(id, requestInfo(req)));
  }

  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trade the one-time code for a session (web UI server)' })
  exchange(@Body() body: { code: string }) {
    return this.sso.exchange(body?.code);
  }
}
