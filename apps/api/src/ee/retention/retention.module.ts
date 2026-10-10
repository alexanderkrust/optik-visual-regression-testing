// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ProjectsModule } from '../../projects/projects.module';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [RetentionController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
