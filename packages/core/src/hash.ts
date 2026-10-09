import { createHash } from 'crypto';
import { PNG } from 'pngjs';

/**
 * SHA-256 of an image's dimensions and decoded RGBA pixels. Pixel-identical
 * images get the same hash even if their PNG encoding differs.
 */
export function pixelHash(buffer: Buffer): string {
  const image = PNG.sync.read(buffer);
  return createHash('sha256')
    .update(`${image.width}x${image.height}:`)
    .update(image.data)
    .digest('hex');
}
