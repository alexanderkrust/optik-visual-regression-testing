// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import {
  ArgumentsHost,
  Body,
  CanActivate,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  ExecutionContext,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { publicUrl } from '../../common/public-url';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AccessService, CurrentUser } from '../../access/access.service';
import { User } from '../../access/current-user.decorator';
import { LicenseService } from '../../license/license.service';
import { SCHEMA, ScimService } from './scim.service';

const SCIM_JSON = 'application/scim+json';

/** The bearer token from SCIM settings; Enterprise edition. */
@Injectable()
export class ScimGuard implements CanActivate {
  constructor(
    private readonly scim: ScimService,
    private readonly license: LicenseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? '';
    if (!header.startsWith('Bearer ') || !(await this.scim.tokenValid(header.slice(7)))) {
      throw new UnauthorizedException('Invalid SCIM token');
    }
    await this.license.require('scim');
    // Changes appear in the audit log as made by "SCIM"
    req.apiToken = { id: 'scim', name: 'SCIM' };
    return true;
  }
}

/** Errors in the SCIM format (RFC 7644 §3.12). */
@Catch(HttpException)
export class ScimExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const status = exception.getStatus();
    const body = exception.getResponse();
    const detail = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
    res
      .status(status)
      .header('Content-Type', SCIM_JSON)
      .send({
        schemas: [SCHEMA.error],
        status: String(status),
        detail: Array.isArray(detail) ? detail.join(', ') : detail,
        ...('scimType' in exception ? { scimType: (exception as { scimType: string }).scimType } : {}),
      });
  }
}

const base = (config: ConfigService, req: any) => publicUrl(config) ?? `${req.protocol}://${req.hostname}`;

/** SCIM 2.0 service provider — for identity providers, not people. */
@ApiExcludeController()
@Controller('scim/v2')
@UseGuards(ScimGuard)
@UseFilters(ScimExceptionFilter)
export class ScimController {
  constructor(
    private readonly scim: ScimService,
    private readonly config: ConfigService,
  ) {}

  @Get('ServiceProviderConfig')
  @Header('Content-Type', SCIM_JSON)
  serviceProviderConfig() {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer token', description: 'Token from optik → Single sign-on → SCIM' }],
    };
  }

  @Get('ResourceTypes')
  @Header('Content-Type', SCIM_JSON)
  resourceTypes() {
    const type = (name: string, endpoint: string, schema: string) => ({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
      id: name,
      name,
      endpoint,
      schema,
    });
    return {
      schemas: [SCHEMA.list],
      totalResults: 2,
      Resources: [type('User', '/Users', SCHEMA.user), type('Group', '/Groups', SCHEMA.group)],
    };
  }

  @Get('Users')
  @Header('Content-Type', SCIM_JSON)
  listUsers(@Query() query: Record<string, string>, @Req() req: any) {
    return this.scim.listUsers(base(this.config, req), query);
  }

  @Get('Users/:id')
  @Header('Content-Type', SCIM_JSON)
  getUser(@Param('id') id: string, @Req() req: any) {
    return this.scim.getUser(base(this.config, req), id);
  }

  @Post('Users')
  @HttpCode(HttpStatus.CREATED)
  @Header('Content-Type', SCIM_JSON)
  createUser(@Body() body: any, @Req() req: any) {
    return this.scim.createUser(base(this.config, req), body);
  }

  @Put('Users/:id')
  @Header('Content-Type', SCIM_JSON)
  replaceUser(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.scim.replaceUser(base(this.config, req), id, body);
  }

  @Patch('Users/:id')
  @Header('Content-Type', SCIM_JSON)
  patchUser(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.scim.patchUser(base(this.config, req), id, body);
  }

  @Delete('Users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('id') id: string) {
    await this.scim.deleteUser(id);
  }

  @Get('Groups')
  @Header('Content-Type', SCIM_JSON)
  listGroups(@Query() query: Record<string, string>, @Req() req: any) {
    return this.scim.listGroups(base(this.config, req), query);
  }

  @Get('Groups/:id')
  @Header('Content-Type', SCIM_JSON)
  getGroup(@Param('id') id: string, @Query('excludedAttributes') excluded: string, @Req() req: any) {
    return this.scim.getGroup(base(this.config, req), id, excluded);
  }

  @Post('Groups')
  @HttpCode(HttpStatus.CREATED)
  @Header('Content-Type', SCIM_JSON)
  createGroup(@Body() body: any, @Req() req: any) {
    return this.scim.createGroup(base(this.config, req), body);
  }

  @Put('Groups/:id')
  @Header('Content-Type', SCIM_JSON)
  replaceGroup(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.scim.replaceGroup(base(this.config, req), id, body);
  }

  @Patch('Groups/:id')
  @Header('Content-Type', SCIM_JSON)
  patchGroup(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.scim.patchGroup(base(this.config, req), id, body);
  }

  @Delete('Groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGroup(@Param('id') id: string) {
    await this.scim.deleteGroup(id);
  }
}

/** Setting up provisioning — admins, Enterprise edition. */
@ApiTags('SCIM provisioning (Enterprise)')
@Controller('scim/token')
@UseGuards(JwtAuthGuard)
export class ScimTokenController {
  constructor(
    private readonly scim: ScimService,
    private readonly access: AccessService,
    private readonly license: LicenseService,
    private readonly config: ConfigService,
  ) {}

  private async authorize(user: CurrentUser) {
    this.access.requireAdmin(user);
    await this.license.require('scim');
  }

  @Get()
  @ApiOperation({ summary: 'Whether a SCIM token exists, and the endpoint URL' })
  async info(@User() user: CurrentUser, @Req() req: any) {
    await this.authorize(user);
    return this.scim.tokenInfo(base(this.config, req));
  }

  @Post()
  @ApiOperation({ summary: 'Create a SCIM token (replaces the old one; shown once)' })
  async create(@User() user: CurrentUser, @Req() req: any) {
    await this.authorize(user);
    return this.scim.createToken(base(this.config, req));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the SCIM token' })
  async revoke(@User() user: CurrentUser) {
    await this.authorize(user);
    await this.scim.revokeToken();
  }
}
