import { AppController } from './app.controller';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { CiModule } from './ci/ci.module';
import { AccessModule } from './access/access.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { RunsModule } from './runs/runs.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { TokensModule } from './tokens/tokens.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(__dirname, '../../../.env'), // monorepo root (src/ or dist/ → 3 levels up)
        '.env', // app-local fallback
      ],
    }),
    DatabaseModule,
    StorageModule,
    CiModule,
    AccessModule,
    ProjectsModule,
    RunsModule,
    SnapshotsModule,
    TokensModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
