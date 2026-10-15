/**
 * Pixel limits for PNGs, checked before decoding. A decoded image takes
 * width × height × 4 bytes, so a few kilobytes of compressed PNG can claim
 * gigabytes ("decompression bomb"); the header says how many before any of
 * that is allocated.
 */

/**
 * 50 megapixels: a full-page screenshot 1280 CSS pixels wide at device scale
 * factor 2 reaches Chromium's 16,384-pixel capture height at 42 megapixels.
 * Decoded, that is 200 MB per image; a comparison holds about four of them.
 */
export const DEFAULT_MAX_PIXELS = 50_000_000;

export interface ImageSize {
  width: number;
  height: number;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Width and height from a PNG's IHDR chunk (always the first one), without
 * decoding it; null if `data` doesn't start like a PNG.
 */
export function pngSize(data: Uint8Array): ImageSize | null {
  if (data.length < 24 || SIGNATURE.some((byte, i) => data[i] !== byte)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Chunk length 13, then "IHDR"
  if (view.getUint32(8) !== 13 || String.fromCharCode(...data.subarray(12, 16)) !== 'IHDR') return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const amount = (pixels: number) =>
  pixels >= 100_000
    ? `${(pixels / 1_000_000).toFixed(1).replace(/\.0$/, '')} megapixels`
    : `${pixels} pixels`;

/** An image (or the comparison of two) has more pixels than allowed. */
export class ImageTooLargeError extends Error {
  constructor(
    readonly size: ImageSize,
    readonly maxPixels: number,
    what = 'The image',
  ) {
    super(
      `${what} is ${size.width}×${size.height} pixels (${amount(size.width * size.height)}); ` +
        `at most ${amount(maxPixels)} are allowed`,
    );
    this.name = 'ImageTooLargeError';
  }
}

/** Throws ImageTooLargeError if `size` has more than `maxPixels` pixels. */
export function checkPixels(size: ImageSize, maxPixels: number = DEFAULT_MAX_PIXELS, what?: string): void {
  if (size.width * size.height > maxPixels) throw new ImageTooLargeError(size, maxPixels, what);
}

/**
 * Checks a PNG — and the canvas a comparison with `baseline` pads both to —
 * against `maxPixels` before decoding. Data that isn't a PNG passes: decoding
 * reports that.
 */
export function checkPngPixels(
  image: Uint8Array,
  baseline: Uint8Array | null = null,
  maxPixels: number = DEFAULT_MAX_PIXELS,
): void {
  const size = pngSize(image);
  if (size) checkPixels(size, maxPixels);
  const before = baseline ? pngSize(baseline) : null;
  if (size && before) {
    checkPixels(before, maxPixels, 'The baseline');
    const canvas = { width: Math.max(size.width, before.width), height: Math.max(size.height, before.height) };
    checkPixels(canvas, maxPixels, 'The comparison with the baseline');
  }
}
