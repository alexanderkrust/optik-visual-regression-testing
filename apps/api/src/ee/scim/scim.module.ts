// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../../users/users.module';
import { TeamsModule } from '../teams/teams.module';
import { ScimController, ScimGuard, ScimTokenController } from './scim.controller';
import { ScimService } from './scim.service';

@Module({
  imports: [AuthModule, UsersModule, TeamsModule],
  controllers: [ScimController, ScimTokenController],
  providers: [ScimService, ScimGuard],
})
export class ScimModule {}
