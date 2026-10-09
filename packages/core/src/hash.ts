import { createHash } from 'crypto';
import { PNG } from 'pngjs';

/**
 * SHA-256 of an image's dimensions and decoded RGBA pixels. Pixel-identical
 * images get the same hash even if their PNG encoding differs.
 */
export function pixelHash(buffer: Buffer): string {
  return hashImage(PNG.sync.read(buffer));
}

/** Same as pixelHash, for an image that is already decoded. */
export function hashImage(image: PNG): string {
  return createHash('sha256')
    .update(`${image.width}x${image.height}:`)
    .update(image.data)
    .digest('hex');
}
