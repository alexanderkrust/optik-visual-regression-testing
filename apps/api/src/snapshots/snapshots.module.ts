import { Module } from '@nestjs/common';
import { SnapshotsController } from './snapshots.controller';
import { SnapshotsService } from './snapshots.service';
import { ImageUrlSigner } from './image-urls';
import { TokensModule } from '../tokens/tokens.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TokensModule, AuthModule],
  controllers: [SnapshotsController],
  providers: [SnapshotsService, ImageUrlSigner],
})
export class SnapshotsModule {}
