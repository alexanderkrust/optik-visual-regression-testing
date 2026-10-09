import { PNG } from 'pngjs';
import { diffImages, hashImage } from '@optik/core';

export interface AnalyseInput {
  image: Uint8Array;
  baseline: Uint8Array | null;
}

export interface AnalyseResult {
  /** Pixel hash of `image` */
  imageHash: string;
  /** Comparison with the baseline, if there is one */
  diff: {
    diffCount: number;
    diffScore: number;
    sizeChanged: boolean;
    diffImage: Uint8Array;
  } | null;
}

const toBuffer = (data: Uint8Array) => Buffer.from(data.buffer, data.byteOffset, data.byteLength);

/**
 * The CPU-heavy part of a snapshot upload: decode the screenshot, hash its
 * pixels and compare it with the baseline. Runs in a worker thread (see
 * DiffService); throws for images that are not valid PNGs.
 */
export function analyse({ image, baseline }: AnalyseInput): AnalyseResult {
  const current = PNG.sync.read(toBuffer(image));
  const imageHash = hashImage(current);
  if (!baseline) return { imageHash, diff: null };

  const result = diffImages(PNG.sync.read(toBuffer(baseline)), current);
  return {
    imageHash,
    diff: {
      diffCount: result.diffCount,
      diffScore: result.diffScore,
      sizeChanged: result.sizeChanged,
      diffImage: result.diffBuffer,
    },
  };
}
