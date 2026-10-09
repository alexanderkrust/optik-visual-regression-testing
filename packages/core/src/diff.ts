import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DiffResult {
  diffCount: number;
  diffScore: number;
  diffBuffer: Buffer;
  /** True when the images have different dimensions. */
  sizeChanged: boolean;
}

/**
 * Compares two PNGs. Images of different size are padded to the larger
 * dimensions with opaque magenta, so the added or removed area counts as changed pixels.
 */
export function computeDiff(baselineBuffer: Buffer, currentBuffer: Buffer): DiffResult {
  return diffImages(PNG.sync.read(baselineBuffer), PNG.sync.read(currentBuffer));
}

/** Same as computeDiff, for images that are already decoded. */
export function diffImages(baseline: PNG, current: PNG): DiffResult {
  const width = Math.max(baseline.width, current.width);
  const height = Math.max(baseline.height, current.height);
  const sizeChanged = baseline.width !== current.width || baseline.height !== current.height;

  const a = pad(baseline, width, height);
  const b = pad(current, width, height);
  const diff = new PNG({ width, height });

  const diffCount = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,
  });

  const totalPixels = width * height;
  const diffScore = totalPixels > 0 ? diffCount / totalPixels : 0;
  const diffBuffer = PNG.sync.write(diff);

  return { diffCount, diffScore, diffBuffer, sizeChanged };
}

function pad(image: PNG, width: number, height: number): PNG {
  if (image.width === width && image.height === height) return image;
  const padded = new PNG({ width, height, fill: true });
  for (let i = 0; i < padded.data.length; i += 4) {
    padded.data[i] = 255;
    padded.data[i + 1] = 0;
    padded.data[i + 2] = 255;
    padded.data[i + 3] = 255;
  }
  PNG.bitblt(image, padded, 0, 0, image.width, image.height, 0, 0);
  return padded;
}
