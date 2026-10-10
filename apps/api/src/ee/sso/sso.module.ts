// Copyright (c) 2026 Alexander Rust. Part of optik Enterprise: licensed under
// the optik Enterprise License (ee/LICENSE in the repository root), not Apache-2.0.
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { SsoAdminController, SsoLoginController } from './sso.controller';
import { SsoService } from './sso.service';

@Module({
  imports: [AuthModule],
  controllers: [SsoAdminController, SsoLoginController],
  providers: [SsoService],
})
export class SsoModule {}
