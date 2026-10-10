import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Edition, EnterpriseFeature, LicenseInfo } from '@optik/shared';
import { PrismaService } from '../database/prisma.service';
import { EDITION_FEATURES, evaluate, parseLicense } from './license';
import { LICENSE_KEYS, RELEASE_DATE } from './public-keys';
import { AuditTrail } from '../audit/audit-trail';

/** instance_settings key of a license entered in the admin UI */
const SETTING = 'license';

/** How long edition() trusts its last answer — other instances see a new key after this */
const EDITION_CACHE_MS = 30_000;

const FEATURE_NAMES: Record<EnterpriseFeature, string> = {
  audit_log: 'The audit log',
  sso: 'Single sign-on',
  teams: 'Teams',
  scim: 'SCIM provisioning',
  retention: 'Retention policies',
};

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
    private readonly audit: AuditTrail,
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

  private cached: { edition: Edition; at: number } | null = null;

  /** The edition in effect — cheap enough to ask on every request. */
  async edition(): Promise<Edition> {
    if (this.cached && Date.now() - this.cached.at < EDITION_CACHE_MS) return this.cached.edition;
    const { key } = await this.storedKey();
    const parsed = key ? parseLicense(key, this.publicKeys) : null;
    const { edition } = evaluate(parsed && 'license' in parsed ? parsed.license : null, {
      today: new Date().toISOString().slice(0, 10),
      releaseDate: this.releaseDate,
      reviewers: 0,
    });
    this.cached = { edition, at: Date.now() };
    return edition;
  }

  /** Forgets the cached edition, e.g. after the key was changed directly in the database. */
  clearCache() {
    this.cached = null;
  }

  /** Whether the edition in effect includes an enterprise feature. */
  async has(feature: EnterpriseFeature): Promise<boolean> {
    return EDITION_FEATURES[await this.edition()].includes(feature);
  }

  /** Refuses requests for a feature the edition doesn't include. */
  async require(feature: EnterpriseFeature): Promise<void> {
    if (!(await this.has(feature))) {
      throw new ForbiddenException(`${FEATURE_NAMES[feature]} is part of the optik Enterprise edition`);
    }
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
    this.cached = null;
    const { license } = parsed;
    await this.audit.record({
      action: 'license.installed',
      target: { type: 'license', id: license.id, label: license.licensee },
      details: { edition: license.edition, maxReviewers: license.maxReviewers, updatesUntil: license.updatesUntil },
    });
    return this.info();
  }

  async remove(): Promise<LicenseInfo> {
    this.assertNotFromEnvironment();
    // Recorded first: without the license, the audit log stops recording
    const previous = await this.info();
    if (previous.license) {
      await this.audit.record({
        action: 'license.removed',
        target: { type: 'license', id: previous.license.id, label: previous.license.licensee },
      });
    }
    await this.prisma.instanceSetting.deleteMany({ where: { key: SETTING } });
    this.cached = null;
    return this.info();
  }

  /** People who can accept or reject changes: admins, and reviewers and maintainers of any project (also through teams). */
  reviewerCount(): Promise<number> {
    return this.prisma.user.count({
      where: {
        deactivatedAt: null,
        OR: [
          { role: 'admin' },
          { memberships: { some: { role: { in: ['reviewer', 'maintainer'] } } } },
          { teams: { some: { team: { projects: { some: { role: { in: ['reviewer', 'maintainer'] } } } } } } },
        ],
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
