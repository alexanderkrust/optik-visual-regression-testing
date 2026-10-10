import { Module } from '@nestjs/common';
import { ProjectsController, StorageController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController, StorageController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
