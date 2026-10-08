import { Module } from '@nestjs/common';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';
import { TokenGuard } from './token.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TokensController],
  providers: [TokensService, TokenGuard],
  exports: [TokensService, TokenGuard],
})
export class TokensModule {}
