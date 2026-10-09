import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export type ImageKind = 'image' | 'diff';

const HOUR = 3600;

/**
 * Signed, expiring image URLs, so <img> tags can load snapshots without an
 * Authorization header while the images stay private.
 *
 * URLs expire 1–2 hours after they were issued: the expiry is rounded to full
 * hours so a URL stays the same — and browser-cacheable — within an hour.
 */
@Injectable()
export class ImageUrlSigner {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    // A key of its own, derived from the JWT secret: an image signature can
    // never be mistaken for any other signed value.
    this.key = createHash('sha256')
      .update(`optik:image-urls:${config.getOrThrow<string>('JWT_SECRET')}`)
      .digest();
  }

  url(snapshotId: string, kind: ImageKind, now = Date.now()): string {
    const expires = (Math.floor(now / 1000 / HOUR) + 2) * HOUR;
    const signature = this.signature(snapshotId, kind, expires);
    return `/api/snapshots/${snapshotId}/${kind}?expires=${expires}&signature=${signature}`;
  }

  verify(
    snapshotId: string,
    kind: ImageKind,
    expires: string | undefined,
    signature: string | undefined,
    now = Date.now(),
  ): boolean {
    const expiresAt = Number(expires);
    if (!signature || !Number.isInteger(expiresAt) || expiresAt * 1000 < now) return false;
    const expected = Buffer.from(this.signature(snapshotId, kind, expiresAt));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private signature(snapshotId: string, kind: ImageKind, expires: number): string {
    return createHmac('sha256', this.key)
      .update(`${kind}:${snapshotId}:${expires}`)
      .digest('base64url');
  }
}
