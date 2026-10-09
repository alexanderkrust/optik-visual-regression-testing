import type { LicenseDetails } from '@optik/shared';
import { testLicenseKey } from '../../test/license-keys';
import { evaluate, parseLicense } from './license';

const key = testLicenseKey();
const details: LicenseDetails = {
  id: 'lic-1',
  licensee: 'ACME GmbH',
  edition: 'enterprise',
  maxReviewers: 10,
  issuedAt: '2026-01-01',
  updatesUntil: '2027-06-30',
  validUntil: null,
};
const at = (today: string, releaseDate: string | null = null, reviewers = 3) => ({ today, releaseDate, reviewers });

describe('parseLicense', () => {
  it('reads keys signed with a known key', () => {
    expect(parseLicense(key.license(), key.publicKeys)).toEqual({
      license: expect.objectContaining({ licensee: 'ACME GmbH', edition: 'enterprise', validUntil: null }),
    });
  });

  it('rejects forged, foreign and malformed keys', () => {
    const [prefix, , signature] = key.license().split('.');
    const forged = Buffer.from(JSON.stringify({ kid: key.kid, maxReviewers: 1000 })).toString('base64url');
    expect(parseLicense(`${prefix}.${forged}.${signature}`, key.publicKeys)).toEqual({
      error: expect.stringContaining('signature'),
    });
    expect(parseLicense(testLicenseKey().license(), key.publicKeys)).toEqual({
      error: expect.stringContaining('unknown key'),
    });
    expect(parseLicense('hello', key.publicKeys)).toEqual({ error: expect.stringContaining('not an optik') });
    expect(parseLicense(key.license({ edition: 'gold' }), key.publicKeys)).toEqual({
      error: expect.stringContaining('unsupported format'),
    });
  });
});

describe('evaluate', () => {
  it('is Community with 5 reviewers without a license', () => {
    expect(evaluate(null, at('2026-10-01'))).toEqual({ edition: 'community', maxReviewers: 5, problems: [], warnings: [] });
  });

  it('unlocks the licensed edition', () => {
    expect(evaluate(details, at('2026-10-01', '2026-09-01'))).toMatchObject({ edition: 'enterprise', maxReviewers: 10, problems: [] });
  });

  it('keeps working forever with releases from the update period', () => {
    expect(evaluate(details, at('2035-01-01', '2027-06-30')).edition).toBe('enterprise');
  });

  it('does not unlock releases built after the update period', () => {
    const result = evaluate(details, at('2027-08-01', '2027-07-01'));
    expect(result).toMatchObject({ edition: 'community', maxReviewers: 5 });
    expect(result.problems[0]).toContain('update period ended (2027-06-30)');
  });

  it('ends trials', () => {
    const trial = { ...details, validUntil: '2026-11-30' };
    expect(evaluate(trial, at('2026-11-30')).edition).toBe('enterprise');
    expect(evaluate(trial, at('2026-11-20')).warnings).toEqual([expect.stringContaining('trial license ends')]);
    expect(evaluate(trial, at('2026-12-01'))).toMatchObject({ edition: 'community', problems: [expect.stringContaining('ended')] });
  });

  it('only warns about too many reviewers', () => {
    expect(evaluate(details, at('2026-10-01', null, 12))).toMatchObject({
      edition: 'enterprise',
      warnings: [expect.stringContaining('12 people can review changes, the license covers 10')],
    });
    expect(evaluate(null, at('2026-10-01', null, 6)).warnings[0]).toContain('Community edition covers 5');
  });

  it('warns a month before the update period ends', () => {
    expect(evaluate(details, at('2027-06-10')).warnings).toEqual([expect.stringContaining('update period ends on 2027-06-30')]);
    expect(evaluate(details, at('2027-05-01')).warnings).toEqual([]);
  });
});
