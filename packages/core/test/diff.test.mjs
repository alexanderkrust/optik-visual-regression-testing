// Run with `pnpm --filter @optik/core test` (after building).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { diffImages } from '../dist/index.js';

const WHITE = [255, 255, 255];
const INDIGO = [99, 102, 241];

/**
 * A white image with a filled, anti-aliased rounded rectangle, like a button:
 * each pixel's coverage comes from 4×4 supersampling, as browsers blend edges.
 */
function roundedRect(radius, { width = 60, height = 40, inset = 8 } = {}) {
  const png = new PNG({ width, height });
  const [left, top, right, bottom] = [inset, inset, width - inset, height - inset];
  const inside = (x, y) => {
    if (x < left || x > right || y < top || y > bottom) return false;
    const cx = Math.min(Math.max(x, left + radius), right - radius);
    const cy = Math.min(Math.max(y, top + radius), bottom - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits++;
      }
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) png.data[i + c] = Math.round(WHITE[c] + ((INDIGO[c] - WHITE[c]) * hits) / 16);
      png.data[i + 3] = 255;
    }
  }
  return png;
}

const pixel = (png, x, y) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)];

test('diff: identical images', () => {
  const result = diffImages(roundedRect(6), roundedRect(6));
  assert.equal(result.diffCount, 0);
  assert.equal(result.aaCount, 0);
  assert.equal(result.diffScore, 0);
});

// A corner radius change (6px → 8px) only alters blended edge pixels, which
// pixelmatch classifies as anti-aliasing and used to leave out entirely.
test('diff: a corner radius change counts', () => {
  const result = diffImages(roundedRect(6), roundedRect(8));
  assert.ok(result.aaCount > 0);
  assert.equal(result.diffCount, result.aaCount, 'only edge pixels changed');
  assert.equal(result.diffScore, result.diffCount / (60 * 40));
  assert.equal(result.sizeChanged, false);
});

test('diff: anti-aliased changes are yellow in the diff image, others red', () => {
  const baseline = roundedRect(6);
  const current = roundedRect(8);
  // A solid change in the middle of the rectangle
  for (let y = 18; y < 22; y++) {
    for (let x = 28; x < 32; x++) current.data.fill(0, (y * 60 + x) * 4, (y * 60 + x) * 4 + 3);
  }
  const result = diffImages(baseline, current);
  const diff = PNG.sync.read(result.diffBuffer);
  assert.equal(result.diffCount, result.aaCount + 16);
  assert.deepEqual(pixel(diff, 30, 20), [255, 0, 0]);
  const yellow = [];
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 60; x++) if (pixel(diff, x, y).join() === '255,255,0') yellow.push([x, y]);
  }
  assert.equal(yellow.length, result.aaCount);
  // All of them in the corners
  assert.ok(yellow.every(([x, y]) => (x < 18 || x >= 42) && (y < 18 || y >= 22)));
});

test('diff: ignoreAntiAliasing leaves edge pixels out of the count', () => {
  const result = diffImages(roundedRect(6), roundedRect(8), { ignoreAntiAliasing: true });
  assert.equal(result.diffCount, 0);
  assert.equal(result.diffScore, 0);
  assert.ok(result.aaCount > 0, 'still reported');
});

test('diff: anti-aliased changes inside ignore regions do not count', () => {
  const corners = [
    { x: 0, y: 0, width: 20, height: 20 },
    { x: 40, y: 0, width: 20, height: 20 },
    { x: 0, y: 20, width: 20, height: 20 },
    { x: 40, y: 20, width: 20, height: 20 },
  ];
  const result = diffImages(roundedRect(6), roundedRect(8), { ignoreRegions: corners });
  assert.equal(result.diffCount, 0);
  assert.equal(result.aaCount, 0);
});
