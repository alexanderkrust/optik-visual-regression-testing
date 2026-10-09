import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface DiffResult {
  diffCount: number;
  diffScore: number;
  diffBuffer: Buffer;
  /** True when the images have different dimensions. */
  sizeChanged: boolean;
}

/** A rectangle in image pixels (top-left origin). */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiffOptions {
  /** Areas whose changes are ignored, e.g. dates or animations. */
  ignoreRegions?: Region[];
}

/**
 * Compares two PNGs. Images of different size are padded to the larger
 * dimensions with opaque magenta, so the added or removed area counts as changed pixels.
 */
export function computeDiff(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  options: DiffOptions = {},
): DiffResult {
  return diffImages(PNG.sync.read(baselineBuffer), PNG.sync.read(currentBuffer), options);
}

/** Same as computeDiff, for images that are already decoded. */
export function diffImages(baseline: PNG, current: PNG, options: DiffOptions = {}): DiffResult {
  const width = Math.max(baseline.width, current.width);
  const height = Math.max(baseline.height, current.height);
  const sizeChanged = baseline.width !== current.width || baseline.height !== current.height;

  const a = pad(baseline, width, height);
  let b = pad(current, width, height);
  const regions = clip(options.ignoreRegions ?? [], width, height);
  // Ignored areas take the baseline's pixels, so they never count as changed
  if (regions.length > 0) b = copyRegions(a, b === current ? clone(b) : b, regions);
  const diff = new PNG({ width, height });

  const diffCount = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,
  });

  const totalPixels = width * height;
  const diffScore = totalPixels > 0 ? diffCount / totalPixels : 0;
  tint(diff, regions);
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

/** Regions limited to the image, with whole pixels; empty ones are dropped. */
function clip(regions: Region[], width: number, height: number): Region[] {
  return regions
    .map((r) => {
      const x = Math.max(0, Math.floor(r.x));
      const y = Math.max(0, Math.floor(r.y));
      const right = Math.min(width, Math.ceil(r.x + r.width));
      const bottom = Math.min(height, Math.ceil(r.y + r.height));
      return { x, y, width: right - x, height: bottom - y };
    })
    .filter((r) => r.width > 0 && r.height > 0);
}

function clone(image: PNG): PNG {
  const copy = new PNG({ width: image.width, height: image.height });
  image.data.copy(copy.data);
  return copy;
}

function copyRegions(from: PNG, to: PNG, regions: Region[]): PNG {
  for (const r of regions) PNG.bitblt(from, to, r.x, r.y, r.width, r.height, r.x, r.y);
  return to;
}

/** Marks ignored areas in the diff image with a light blue tint. */
function tint(diff: PNG, regions: Region[]) {
  for (const r of regions) {
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) {
        const i = (y * diff.width + x) * 4;
        diff.data[i] = (diff.data[i] + 96) >> 1;
        diff.data[i + 1] = (diff.data[i + 1] + 165) >> 1;
        diff.data[i + 2] = (diff.data[i + 2] + 250) >> 1;
        diff.data[i + 3] = 255;
      }
    }
  }
}
