import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Edition, EnterpriseFeature, LicenseInfo } from '@optik/shared';
import { PrismaService } from '../database/prisma.service';
import { EDITION_FEATURES, evaluate, parseLicense } from './license';
import { LICENSE_KEYS, RELEASE_DATE } from './public-keys';

/** instance_settings key of a license entered in the admin UI */
const SETTING = 'license';

/**
 * The license in effect: OPTIK_LICENSE, or a key entered in the admin UI.
 * Verified offline on every call, so all instances behind a load balancer
 * agree and a new key takes effect at once.
 */
@Injectable()
export class LicenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(LICENSE_KEYS) private readonly publicKeys: Record<string, string>,
    @Inject(RELEASE_DATE) private readonly releaseDate: string | null,
  ) {}

  async info(): Promise<LicenseInfo> {
    const { key, source } = await this.storedKey();
    const parsed = key ? parseLicense(key, this.publicKeys) : null;
    const license = parsed && 'license' in parsed ? parsed.license : null;
    const reviewers = await this.reviewerCount();
    const evaluation = evaluate(license, {
      today: new Date().toISOString().slice(0, 10),
      releaseDate: this.releaseDate,
      reviewers,
    });
    return {
      edition: evaluation.edition,
      license,
      source,
      maxReviewers: evaluation.maxReviewers,
      reviewers,
      releaseDate: this.releaseDate,
      problems: parsed && 'error' in parsed ? [parsed.error] : evaluation.problems,
      warnings: evaluation.warnings,
    };
  }

  async edition(): Promise<Edition> {
    return (await this.info()).edition;
  }

  /** Whether the edition in effect includes an enterprise feature. */
  async has(feature: EnterpriseFeature): Promise<boolean> {
    return EDITION_FEATURES[await this.edition()].includes(feature);
  }

  /** Installs a key entered in the admin UI. Rejects keys that can't be read. */
  async set(key: string): Promise<LicenseInfo> {
    this.assertNotFromEnvironment();
    const value = typeof key === 'string' ? key.replace(/\s+/g, '') : '';
    const parsed = parseLicense(value, this.publicKeys);
    if ('error' in parsed) throw new BadRequestException(parsed.error);
    await this.prisma.instanceSetting.upsert({
      where: { key: SETTING },
      create: { key: SETTING, value },
      update: { value },
    });
    return this.info();
  }

  async remove(): Promise<LicenseInfo> {
    this.assertNotFromEnvironment();
    await this.prisma.instanceSetting.deleteMany({ where: { key: SETTING } });
    return this.info();
  }

  /** People who can accept or reject changes: admins, and reviewers and maintainers of any project. */
  reviewerCount(): Promise<number> {
    return this.prisma.user.count({
      where: {
        OR: [{ role: 'admin' }, { memberships: { some: { role: { in: ['reviewer', 'maintainer'] } } } }],
      },
    });
  }

  private async storedKey(): Promise<{ key: string | null; source: LicenseInfo['source'] }> {
    const fromEnv = this.config.get<string>('OPTIK_LICENSE')?.trim();
    if (fromEnv) return { key: fromEnv, source: 'environment' };
    const row = await this.prisma.instanceSetting.findUnique({ where: { key: SETTING } });
    return row ? { key: row.value, source: 'settings' } : { key: null, source: null };
  }

  private assertNotFromEnvironment() {
    if (this.config.get<string>('OPTIK_LICENSE')?.trim()) {
      throw new ConflictException('The license is set with OPTIK_LICENSE — change it there');
    }
  }
}
