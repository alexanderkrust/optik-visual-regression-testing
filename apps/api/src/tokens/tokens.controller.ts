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

@ApiTags('tokens')
@Controller('projects/:slug/tokens')
@UseGuards(JwtAuthGuard)
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get()
  @ApiOperation({ summary: 'List tokens for a project' })
  findAll(@Param('slug') slug: string) {
    return this.tokensService.findByProject(slug);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new token' })
  create(@Param('slug') slug: string, @Body() dto: CreateApiTokenDto) {
    return this.tokensService.create(slug, dto);
  }

  @Delete(':tokenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a token' })
  async revoke(@Param('slug') slug: string, @Param('tokenId') tokenId: string) {
    await this.tokensService.revoke(slug, tokenId);
  }
}
