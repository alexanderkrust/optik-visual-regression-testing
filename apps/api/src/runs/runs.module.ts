import { Module } from '@nestjs/common';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { ProjectsModule } from '../projects/projects.module';
import { TokensModule } from '../tokens/tokens.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ProjectsModule, TokensModule, AuthModule],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
