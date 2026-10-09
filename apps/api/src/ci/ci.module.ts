import { Global, Module } from '@nestjs/common';
import { SecretBox } from '../common/secret-box';
import { CommitStatusService } from './commit-status.service';

@Global()
@Module({
  providers: [CommitStatusService, SecretBox],
  exports: [CommitStatusService, SecretBox],
})
export class CiModule {}
