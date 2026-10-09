import {
  BadRequestException,
  Controller,
  Headers,
  UnauthorizedException,
  Get,
  Post,
  Patch,
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
import type { UpdateSnapshotStatusDto } from '@optik/shared';

@ApiTags('snapshots')
@Controller('snapshots')
export class SnapshotsController {
  constructor(
    private readonly snapshotsService: SnapshotsService,
    private readonly urls: ImageUrlSigner,
    private readonly jwt: JwtService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List snapshots for a run' })
  @ApiQuery({ name: 'runId', required: true })
  findByRun(@Query('runId') runId: string) {
    return this.snapshotsService.findByRun(runId);
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
  updateStatus(@Param('id') id: string, @Body() dto: UpdateSnapshotStatusDto) {
    return this.snapshotsService.updateStatus(id, dto);
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
    this.assertImageAccess(id, 'image', expires, signature, authorization);
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
    this.assertImageAccess(id, 'diff', expires, signature, authorization);
    sendPng(res, await this.snapshotsService.getDiffBuffer(id));
  }

  /** Images are private: a valid signed URL or a signed-in user (JWT) is required. */
  private assertImageAccess(
    id: string,
    kind: ImageKind,
    expires: string | undefined,
    signature: string | undefined,
    authorization: string | undefined,
  ) {
    if (this.urls.verify(id, kind, expires, signature)) return;
    if (authorization?.startsWith('Bearer ')) {
      try {
        this.jwt.verify(authorization.slice(7));
        return;
      } catch {
        // fall through
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
