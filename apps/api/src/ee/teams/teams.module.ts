// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { ProjectTeamsController, TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [AuthModule],
  controllers: [TeamsController, ProjectTeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
