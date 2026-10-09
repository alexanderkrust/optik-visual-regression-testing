import { createHash, generateKeyPairSync, sign } from 'crypto';

/** A throwaway signing key, like the license tool's, for tests. */
export function testLicenseKey() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url');
  const kid = createHash('sha256').update(raw).digest('hex').slice(0, 8);
  const publicKeys = { [kid]: raw.toString('base64url') };

  /** Signs a license like `optik-license sign` does. */
  function license(fields: Record<string, unknown> = {}) {
    const payload = {
      v: 1,
      id: 'lic-1',
      kid,
      licensee: 'ACME GmbH',
      edition: 'enterprise',
      maxReviewers: 10,
      issuedAt: '2026-01-01',
      updatesUntil: '2099-12-31',
      ...fields,
    };
    const body = `optik1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    return `${body}.${sign(null, Buffer.from(body), privateKey).toString('base64url')}`;
  }
  return { kid, publicKeys, license };
}
