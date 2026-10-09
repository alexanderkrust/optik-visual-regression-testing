import { Global, Module } from '@nestjs/common';
import { readFileSync } from 'fs';
import { AuthModule } from '../auth/auth.module';
import { LicenseController } from './license.controller';
import { LicenseService } from './license.service';
import { LICENSE_KEYS, LICENSE_PUBLIC_KEYS, RELEASE_DATE } from './public-keys';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [LicenseController],
  providers: [
    LicenseService,
    { provide: LICENSE_KEYS, useValue: LICENSE_PUBLIC_KEYS },
    { provide: RELEASE_DATE, useFactory: releaseDate },
  ],
  exports: [LicenseService],
})
export class LicenseModule {}

/** Written into the image by the release build (see Dockerfile); missing in development. */
const RELEASE_FILE = '/app/release.json';

function releaseDate(): string | null {
  try {
    const { date } = JSON.parse(readFileSync(RELEASE_FILE, 'utf8'));
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  } catch {
    return null;
  }
}
