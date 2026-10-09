import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TokensService } from './tokens.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { CreateApiTokenDto } from '@optik/shared';
import { AccessService, CurrentUser } from '../access/access.service';
import { User } from '../access/current-user.decorator';

@ApiTags('tokens')
@Controller('projects/:slug/tokens')
@UseGuards(JwtAuthGuard)
export class TokensController {
  constructor(
    private readonly tokensService: TokensService,
    private readonly access: AccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tokens for a project (maintainer)' })
  async findAll(@User() user: CurrentUser, @Param('slug') slug: string) {
    await this.access.requireProject(user, { slug }, 'maintainer');
    return this.tokensService.findByProject(slug);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new token (maintainer)' })
  async create(@User() user: CurrentUser, @Param('slug') slug: string, @Body() dto: CreateApiTokenDto) {
    await this.access.requireProject(user, { slug }, 'maintainer');
    return this.tokensService.create(slug, dto);
  }

  @Delete(':tokenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a token (maintainer)' })
  async revoke(@User() user: CurrentUser, @Param('slug') slug: string, @Param('tokenId') tokenId: string) {
    await this.access.requireProject(user, { slug }, 'maintainer');
    await this.tokensService.revoke(slug, tokenId);
  }
}
