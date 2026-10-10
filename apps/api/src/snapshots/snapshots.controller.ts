import {
  BadRequestException,
  Controller,
  Headers,
  UnauthorizedException,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Body,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { TokenGuard } from '../tokens/token.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SnapshotsService } from './snapshots.service';
import { ImageKind, ImageUrlSigner } from './image-urls';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { AccessService, CurrentUser } from '../access/access.service';
import { User } from '../access/current-user.decorator';
import { CommentsService } from './comments.service';
import type {
  CreateSnapshotCommentDto,
  SnapshotSettings,
  UpdateSnapshotStatusDto,
} from '@optik/shared';

@ApiTags('snapshots')
@Controller('snapshots')
export class SnapshotsController {
  constructor(
    private readonly snapshotsService: SnapshotsService,
    private readonly urls: ImageUrlSigner,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly comments: CommentsService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List snapshots for a run' })
  @ApiQuery({ name: 'runId', required: true })
  findByRun(@User() user: CurrentUser, @Query('runId') runId: string) {
    return this.snapshotsService.findByRun(user, runId);
  }

  @Post()
  @UseGuards(TokenGuard)
  @ApiOperation({ summary: 'Submit a screenshot' })
  @ApiConsumes('multipart/form-data')
  async create(@Req() req) {
    const parts = (req as any).parts() as AsyncIterable<any>;
    const fields: Record<string, string> = {};
    let imageBuffer: Buffer | undefined;

    for await (const part of parts) {
      if (part.file) {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        imageBuffer = Buffer.concat(chunks);
      } else {
        fields[part.fieldname] = part.value;
      }
    }

    if (!imageBuffer || !fields['runId'] || !fields['name']) {
      throw new BadRequestException('Missing required fields: runId, name, file');
    }

    return this.snapshotsService.submit(
      req.projectId,
      fields['runId'],
      fields['name'],
      imageBuffer,
    );
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Approve or reject a snapshot' })
  updateStatus(
    @User() user: CurrentUser,
    @Param('id') id: string,
    @Body() dto: UpdateSnapshotStatusDto,
  ) {
    return this.snapshotsService.updateStatus(user, id, dto);
  }

  @Put(':id/settings')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Set ignore regions and threshold for this snapshot name (reviewer)',
    description: 'Applies to all later runs of the project and suite, and re-checks open changes.',
  })
  updateSettings(@User() user: CurrentUser, @Param('id') id: string, @Body() dto: SnapshotSettings) {
    return this.snapshotsService.updateSettings(user, id, dto);
  }

  @Get(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Comments on a snapshot' })
  listComments(@User() user: CurrentUser, @Param('id') id: string) {
    return this.comments.list(user, id);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Comment on a snapshot (reviewer)' })
  createComment(
    @User() user: CurrentUser,
    @Param('id') id: string,
    @Body() dto: CreateSnapshotCommentDto,
  ) {
    return this.comments.create(user, id, dto);
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comment (author or maintainer)' })
  async deleteComment(
    @User() user: CurrentUser,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    await this.comments.remove(user, id, commentId);
  }

  @Get(':id/image')
  @ApiOperation({
    summary: 'Serve snapshot PNG',
    description: 'Requires the signed URL from the snapshot (imageUrl) or a JWT.',
  })
  async getImage(
    @Param('id') id: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() res,
  ) {
    await this.assertImageAccess(id, 'image', expires, signature, authorization);
    sendPng(res, await this.snapshotsService.getImageBuffer(id));
  }

  @Get(':id/diff')
  @ApiOperation({
    summary: 'Serve diff PNG',
    description: 'Requires the signed URL from the snapshot (diffUrl) or a JWT.',
  })
  async getDiff(
    @Param('id') id: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() res,
  ) {
    await this.assertImageAccess(id, 'diff', expires, signature, authorization);
    sendPng(res, await this.snapshotsService.getDiffBuffer(id));
  }

  /**
   * Images are private: a valid signed URL, or a signed-in user (JWT) who can
   * see the snapshot's project.
   */
  private async assertImageAccess(
    id: string,
    kind: ImageKind,
    expires: string | undefined,
    signature: string | undefined,
    authorization: string | undefined,
  ) {
    if (this.urls.verify(id, kind, expires, signature)) return;
    if (authorization?.startsWith('Bearer ')) {
      let userId: string | null = null;
      try {
        userId = this.jwt.verify<{ sub: string }>(authorization.slice(7)).sub;
      } catch {
        // invalid token: fall through
      }
      const user = userId
        ? await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true, deactivatedAt: true },
          })
        : null;
      if (user && !user.deactivatedAt) {
        await this.access.requireSnapshot(user, id, 'viewer');
        return;
      }
    }
    throw new UnauthorizedException('The image URL is invalid or has expired');
  }
}

// Images never change once written, so browsers may cache them indefinitely.
function sendPng(res: any, buffer: Buffer) {
  res.header('Content-Type', 'image/png');
  res.header('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(buffer);
}
