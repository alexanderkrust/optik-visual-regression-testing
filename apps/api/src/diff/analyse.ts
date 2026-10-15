import { PNG } from 'pngjs';
import { checkPngPixels, diffImages, hashImage, type Region } from '@optik/core';

export interface AnalyseInput {
  image: Uint8Array;
  baseline: Uint8Array | null;
  /** Areas whose changes don't count */
  ignoreRegions?: Region[];
  /** Leave changed anti-aliased pixels out (project setting) */
  ignoreAntiAliasing?: boolean;
  /** Largest image and comparison in pixels (MAX_IMAGE_PIXELS) */
  maxPixels?: number;
}

export interface AnalyseResult {
  /** Pixel hash of `image` */
  imageHash: string;
  /** Comparison with the baseline, if there is one */
  diff: {
    diffCount: number;
    diffScore: number;
    /** Changed anti-aliased pixels; part of diffCount unless ignored */
    aaCount: number;
    sizeChanged: boolean;
    diffImage: Uint8Array;
  } | null;
}

const toBuffer = (data: Uint8Array) => Buffer.from(data.buffer, data.byteOffset, data.byteLength);

/**
 * The CPU-heavy part of a snapshot upload: decode the screenshot, hash its
 * pixels and compare it with the baseline. Runs in a worker thread (see
 * DiffService); throws for images that are not valid PNGs, and — before
 * decoding anything — for images above `maxPixels`.
 */
export function analyse({ image, baseline, ignoreRegions, ignoreAntiAliasing, maxPixels }: AnalyseInput): AnalyseResult {
  checkPngPixels(image, baseline, maxPixels);
  const current = PNG.sync.read(toBuffer(image));
  const imageHash = hashImage(current);
  if (!baseline) return { imageHash, diff: null };

  const result = diffImages(PNG.sync.read(toBuffer(baseline)), current, {
    ignoreRegions,
    ignoreAntiAliasing,
    maxPixels,
  });
  return {
    imageHash,
    diff: {
      diffCount: result.diffCount,
      diffScore: result.diffScore,
      aaCount: result.aaCount,
      sizeChanged: result.sizeChanged,
      diffImage: result.diffBuffer,
    },
  };
}
