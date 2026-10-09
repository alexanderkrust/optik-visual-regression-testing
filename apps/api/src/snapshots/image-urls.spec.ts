import type { ConfigService } from '@nestjs/config';
import { ImageUrlSigner } from './image-urls';

const signer = (secret = 'secret') =>
  new ImageUrlSigner({ getOrThrow: () => secret } as unknown as ConfigService);

const parse = (url: string) => {
  const { pathname, searchParams } = new URL(url, 'http://x');
  return { pathname, expires: searchParams.get('expires')!, signature: searchParams.get('signature')! };
};

describe('ImageUrlSigner', () => {
  const now = Date.UTC(2026, 9, 9, 12, 30);

  it('signs URLs that verify for the same snapshot and kind', () => {
    const s = signer();
    const { pathname, expires, signature } = parse(s.url('snap-1', 'image', now));
    expect(pathname).toBe('/api/snapshots/snap-1/image');
    expect(s.verify('snap-1', 'image', expires, signature, now)).toBe(true);
  });

  it('rejects another snapshot, another kind, a tampered expiry or another secret', () => {
    const s = signer();
    const { expires, signature } = parse(s.url('snap-1', 'image', now));
    expect(s.verify('snap-2', 'image', expires, signature, now)).toBe(false);
    expect(s.verify('snap-1', 'diff', expires, signature, now)).toBe(false);
    expect(s.verify('snap-1', 'image', String(Number(expires) + 3600), signature, now)).toBe(false);
    expect(signer('other').verify('snap-1', 'image', expires, signature, now)).toBe(false);
    expect(s.verify('snap-1', 'image', expires, undefined, now)).toBe(false);
    expect(s.verify('snap-1', 'image', 'soon', signature, now)).toBe(false);
  });

  it('is stable within an hour, so browsers can cache the images', () => {
    const s = signer();
    expect(s.url('snap-1', 'image', now)).toBe(s.url('snap-1', 'image', now + 20 * 60_000));
  });

  it('expires one to two hours after issuing', () => {
    const s = signer();
    const { expires, signature } = parse(s.url('snap-1', 'image', now));
    expect(s.verify('snap-1', 'image', expires, signature, now + 89 * 60_000)).toBe(true);
    expect(s.verify('snap-1', 'image', expires, signature, now + 91 * 60_000)).toBe(false);
  });
});
