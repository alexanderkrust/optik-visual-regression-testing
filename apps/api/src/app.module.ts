import { AppController } from './app.controller';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { CiModule } from './ci/ci.module';
import { AccessModule } from './access/access.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProjectsModule } from './projects/projects.module';
import { RunsModule } from './runs/runs.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { TokensModule } from './tokens/tokens.module';
import { AuthModule } from './auth/auth.module';
import { LicenseModule } from './license/license.module';
import { AuditModule } from './audit/audit.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AuditLogModule } from './ee/audit/audit-log.module';
import { SsoModule } from './ee/sso/sso.module';
import { TeamsModule } from './ee/teams/teams.module';
import { ScimModule } from './ee/scim/scim.module';
import { RetentionModule } from './ee/retention/retention.module';

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
    NotificationsModule,
    LicenseModule,
    AuditModule,
    MaintenanceModule,
    // Enterprise (ee/): only active with a license that includes the feature
    AuditLogModule,
    SsoModule,
    TeamsModule,
    ScimModule,
    RetentionModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
