import {
  BadRequestException,
  Controller,
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
import type { UpdateSnapshotStatusDto } from '@optik/shared';

@ApiTags('snapshots')
@Controller('snapshots')
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

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
  @ApiOperation({ summary: 'Serve snapshot PNG' })
  async getImage(@Param('id') id: string, @Res() res) {
    const buffer = await this.snapshotsService.getImageBuffer(id);
    sendPng(res, buffer);
  }

  @Get(':id/diff')
  @ApiOperation({ summary: 'Serve diff PNG' })
  async getDiff(@Param('id') id: string, @Res() res) {
    const buffer = await this.snapshotsService.getDiffBuffer(id);
    sendPng(res, buffer);
  }
}

// Images never change once written, so browsers may cache them indefinitely.
function sendPng(res: any, buffer: Buffer) {
  res.header('Content-Type', 'image/png');
  res.header('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(buffer);
}
