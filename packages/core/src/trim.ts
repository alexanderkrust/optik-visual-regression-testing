import { PNG } from 'pngjs';

/**
 * Crops empty space on the right and bottom of a screenshot — everything that
 * has the same color as the bottom-right pixel — keeping `padding` pixels.
 * Top and left are never cropped, so a component that moves still shows up as
 * a visual change.
 */
export function trimRightBottom(buffer: Buffer, padding = 32): Buffer {
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png;
  const bg = (width * height - 1) * 4;
  const isBackground = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (
      data[i] === data[bg] &&
      data[i + 1] === data[bg + 1] &&
      data[i + 2] === data[bg + 2] &&
      data[i + 3] === data[bg + 3]
    );
  };

  let right = 0;
  let bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isBackground(x, y)) {
        if (x > right) right = x;
        if (y > bottom) bottom = y;
      }
    }
  }

  const newWidth = Math.min(width, right + 1 + padding);
  const newHeight = Math.min(height, bottom + 1 + padding);
  if (newWidth === width && newHeight === height) return buffer;

  const out = new PNG({ width: newWidth, height: newHeight });
  PNG.bitblt(png, out, 0, 0, newWidth, newHeight, 0, 0);
  return PNG.sync.write(out);
}
