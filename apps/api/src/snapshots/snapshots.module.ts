import { Module } from '@nestjs/common';
import { SnapshotsController } from './snapshots.controller';
import { SnapshotsService } from './snapshots.service';
import { ImageUrlSigner } from './image-urls';
import { DiffService } from '../diff/diff.service';
import { CommentsService } from './comments.service';
import { TokensModule } from '../tokens/tokens.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TokensModule, AuthModule],
  controllers: [SnapshotsController],
  providers: [SnapshotsService, CommentsService, ImageUrlSigner, DiffService],
})
export class SnapshotsModule {}
