import { createPublicKey, verify } from 'crypto';
import type { Edition, EnterpriseFeature, LicenseDetails } from '@optik/shared';

const PREFIX = 'optik1';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reviewers allowed without a license. */
export const COMMUNITY_REVIEWERS = 5;

export const EDITION_FEATURES: Record<Edition, EnterpriseFeature[]> = {
  community: [],
  team: [],
  enterprise: ['audit_log', 'sso', 'teams', 'scim', 'retention'],
};

export type ParsedLicense = { license: LicenseDetails } | { error: string };

/**
 * Reads a license key ("optik1.<payload>.<signature>") and checks its Ed25519
 * signature against the embedded public keys — offline, no phone-home.
 */
export function parseLicense(key: string, publicKeys: Record<string, string>): ParsedLicense {
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return { error: 'This is not an optik license key' };
  const [, payload, signature] = parts;

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { error: 'This is not an optik license key' };
  }

  const publicKey = typeof data.kid === 'string' ? publicKeys[data.kid] : undefined;
  if (!publicKey) return { error: 'The license key was signed with an unknown key — is it for a newer optik release?' };
  const valid = verify(
    null,
    Buffer.from(`${PREFIX}.${payload}`),
    createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' }),
    Buffer.from(signature, 'base64url'),
  );
  if (!valid) return { error: 'The license key is invalid (signature does not match)' };

  const { id, licensee, edition, maxReviewers, issuedAt, updatesUntil, validUntil } = data;
  if (
    data.v !== 1 ||
    typeof id !== 'string' ||
    typeof licensee !== 'string' ||
    (edition !== 'team' && edition !== 'enterprise') ||
    !Number.isInteger(maxReviewers) ||
    !isDate(issuedAt) ||
    !isDate(updatesUntil) ||
    (validUntil !== undefined && !isDate(validUntil))
  ) {
    return { error: 'The license key has an unsupported format — is it for a newer optik release?' };
  }
  return {
    license: {
      id,
      licensee,
      edition,
      maxReviewers: maxReviewers as number,
      issuedAt: issuedAt as string,
      updatesUntil: updatesUntil as string,
      validUntil: (validUntil as string | undefined) ?? null,
    },
  };
}

export interface Evaluation {
  edition: Edition;
  maxReviewers: number;
  problems: string[];
  warnings: string[];
}

/**
 * Which edition a license unlocks, today and for this release. Problems fall
 * back to Community; nothing is ever locked or deleted, and too many
 * reviewers only produce a warning.
 */
export function evaluate(
  license: LicenseDetails | null,
  { today, releaseDate, reviewers }: { today: string; releaseDate: string | null; reviewers: number },
): Evaluation {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (license?.validUntil && today > license.validUntil) {
    problems.push(`The trial license ended on ${license.validUntil}.`);
  }
  if (license && releaseDate && releaseDate > license.updatesUntil) {
    problems.push(
      `This optik release (${releaseDate}) came out after the license's update period ended ` +
        `(${license.updatesUntil}). Renew the updates, or use a release from before that day.`,
    );
  }

  const active = license && problems.length === 0 ? license : null;
  const edition: Edition = active?.edition ?? 'community';
  const maxReviewers = active?.maxReviewers ?? COMMUNITY_REVIEWERS;

  if (reviewers > maxReviewers) {
    warnings.push(
      `${reviewers} people can review changes, the ${edition === 'community' ? 'Community edition' : 'license'} ` +
        `covers ${maxReviewers}. Nothing is blocked — please ${active ? 'extend the license' : 'get a license'} ` +
        `or reduce admins, maintainers and reviewers.`,
    );
  }
  if (active && !active.validUntil && daysBetween(today, active.updatesUntil) <= 30 && today <= active.updatesUntil) {
    warnings.push(
      `The update period ends on ${active.updatesUntil}. optik keeps working — releases after that day need a renewal.`,
    );
  }
  if (active?.validUntil && daysBetween(today, active.validUntil) <= 14) {
    warnings.push(`The trial license ends on ${active.validUntil}.`);
  }
  return { edition, maxReviewers, problems, warnings };
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value));
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
