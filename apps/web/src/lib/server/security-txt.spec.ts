import { describe, expect, it } from 'vitest';
import { securityTxt } from './security-txt';

const NOW = new Date('2026-10-13T12:00:00.000Z');
const CANONICAL = 'https://optik.example.com/.well-known/security.txt';

describe('security.txt', () => {
  it('is not served without a contact', () => {
    expect(securityTxt({}, CANONICAL, NOW)).toBeNull();
    expect(securityTxt({ SECURITY_TXT_CONTACT: ' , ' }, CANONICAL, NOW)).toBeNull();
  });

  it('lists the operator contacts and the required fields', () => {
    const txt = securityTxt(
      {
        SECURITY_TXT_CONTACT: 'security@example.com, https://example.com/report',
        SECURITY_TXT_POLICY: 'https://example.com/disclosure',
        SECURITY_TXT_LANGUAGES: 'de, en',
      },
      CANONICAL,
      NOW,
    );
    expect(txt).toBe(
      [
        'Contact: mailto:security@example.com',
        'Contact: https://example.com/report',
        'Expires: 2027-04-11T12:00:00Z',
        'Policy: https://example.com/disclosure',
        'Preferred-Languages: de, en',
        `Canonical: ${CANONICAL}`,
        '',
      ].join('\n'),
    );
  });

  it('expires in less than a year (RFC 9116)', () => {
    const expires = /Expires: (\S+)/.exec(securityTxt({ SECURITY_TXT_CONTACT: 'a@b.c' }, CANONICAL, NOW)!)![1];
    const days = (new Date(expires).getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThan(365);
  });
});
