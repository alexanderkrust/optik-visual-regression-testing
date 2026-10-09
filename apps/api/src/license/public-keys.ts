/**
 * Public keys that verify license keys, by key id. The private keys live in
 * the separate license tool and never in this repository. To rotate: add the
 * new key here, issue new licenses, then drop the old key in a later release.
 */
export const LICENSE_PUBLIC_KEYS: Record<string, string> = {
  '389482dc': 'qsHxl8BNsQ3fWsEjJ6Dl86aBwEI86K8xib_MqS6gA5U',
};

/** Injection token, so tests can verify licenses signed with a test key. */
export const LICENSE_KEYS = Symbol('LICENSE_KEYS');

/** Injection token for the build date of this release (YYYY-MM-DD), or null. */
export const RELEASE_DATE = Symbol('RELEASE_DATE');
