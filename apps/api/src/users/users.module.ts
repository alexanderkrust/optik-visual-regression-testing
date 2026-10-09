import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationsController, UsersController } from './users.controller';
import { InvitationsService } from './invitations.service';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, InvitationsController],
  providers: [UsersService, InvitationsService],
})
export class UsersModule {}
