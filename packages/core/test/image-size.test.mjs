// Run with `pnpm --filter @optik/core test` (after building).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PNG } from 'pngjs';
import { checkPngPixels, computeDiff, DEFAULT_MAX_PIXELS, diffImages, ImageTooLargeError, pngSize } from '../dist/index.js';

const png = (width, height) => PNG.sync.write(new PNG({ width, height, fill: true }));

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/**
 * A few hundred bytes of valid PNG that claim `width` × `height` pixels: a
 * 1×1 image whose header (CRC included) says otherwise. Decoding it would
 * allocate width × height × 4 bytes before noticing the data is short.
 */
function bomb(width, height) {
  const data = png(1, 1);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  data.writeUInt32BE(crc32(data.subarray(12, 29)), 29);
  return data;
}

test('pngSize reads the dimensions from the header', () => {
  assert.deepEqual(pngSize(png(123, 45)), { width: 123, height: 45 });
  assert.deepEqual(pngSize(bomb(100_000, 100_000)), { width: 100_000, height: 100_000 });
  assert.equal(pngSize(Buffer.from('not a png at all, really not')), null);
  assert.equal(pngSize(png(1, 1).subarray(0, 20)), null);
});

test('the default limit fits a 2x full-page screenshot up to Chromium’s capture height', () => {
  assert.ok(2560 * 16_384 <= DEFAULT_MAX_PIXELS);
});

test('computeDiff refuses an image above the limit before decoding it', () => {
  const started = Date.now();
  assert.throws(
    () => computeDiff(png(10, 10), bomb(100_000, 100_000)),
    (err) =>
      err instanceof ImageTooLargeError &&
      /^The image is 100000×100000 pixels \(10000 megapixels\); at most 50 megapixels are allowed$/.test(err.message),
  );
  assert.ok(Date.now() - started < 1000, 'nothing was decoded');
});

test('computeDiff refuses a baseline above the limit', () => {
  assert.throws(() => computeDiff(bomb(20_000, 20_000), png(10, 10)), /: The baseline is 20000×20000/);
});

test('the limit applies to the comparison of differently shaped images', () => {
  // Both within 50 pixels, but padded to 10×10 for the comparison
  const wide = png(10, 1);
  const tall = png(1, 10);
  assert.doesNotThrow(() => checkPngPixels(wide, null, 50));
  assert.throws(() => checkPngPixels(tall, wide, 50), /: The comparison with the baseline is 10×10 pixels/);
  assert.throws(() => computeDiff(wide, tall, { maxPixels: 50 }), ImageTooLargeError);
  assert.throws(
    () => diffImages(PNG.sync.read(wide), PNG.sync.read(tall), { maxPixels: 50 }),
    /: The comparison is 10×10 pixels/,
  );
});

test('maxPixels raises or lowers the limit', () => {
  assert.equal(computeDiff(png(10, 10), png(10, 10), { maxPixels: 100 }).diffCount, 0);
  assert.throws(() => computeDiff(png(10, 10), png(10, 11), { maxPixels: 100 }), ImageTooLargeError);
});

test('data that is not a PNG is left to the decoder', () => {
  assert.doesNotThrow(() => checkPngPixels(Buffer.from('nope')));
  assert.throws(() => computeDiff(Buffer.from('nope'), png(1, 1)), (err) => !(err instanceof ImageTooLargeError));
});
