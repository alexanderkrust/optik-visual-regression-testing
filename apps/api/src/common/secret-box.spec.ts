import type { ConfigService } from '@nestjs/config';
import { SecretBox } from './secret-box';

const box = (secret = 'secret') =>
  new SecretBox({ getOrThrow: () => secret } as unknown as ConfigService);

describe('SecretBox', () => {
  it('round-trips a value without storing it in plain text', () => {
    const sealed = box().encrypt('ghp_token');
    expect(sealed).not.toContain('ghp_token');
    expect(box().decrypt(sealed)).toBe('ghp_token');
  });

  it('uses a fresh IV every time', () => {
    expect(box().encrypt('x')).not.toBe(box().encrypt('x'));
  });

  it('returns null for another key or tampered data', () => {
    const sealed = box().encrypt('ghp_token');
    expect(box('other').decrypt(sealed)).toBeNull();
    expect(box().decrypt(sealed.slice(0, -2) + 'AA')).toBeNull();
    expect(box().decrypt('garbage')).toBeNull();
  });
});
