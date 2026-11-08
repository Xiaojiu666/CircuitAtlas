import sharp from 'sharp';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Pass the generated component sheet path.');
await mkdir('assets', { recursive: true });
await mkdir('public/assets', { recursive: true });
await copyFile(source, 'assets/component-source.png');
const meta = await sharp(source).metadata();
const regions = [
  ['breaker', 0.035, 0.12, 0.275, 0.80],
  ['contactor', 0.35, 0.12, 0.26, 0.80],
  ['motor', 0.63, 0.14, 0.37, 0.79],
];
for (const [name, x, y, w, h] of regions) {
  const left = Math.round(x * meta.width);
  const top = Math.round(y * meta.height);
  const width = Math.min(Math.round(w * meta.width), meta.width - left);
  const height = Math.min(Math.round(h * meta.height), meta.height - top);
  const { data, info } = await sharp(source)
    .extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Only remove near-white pixels connected to the image boundary.
  const queue = new Int32Array(width * height);
  const seen = new Uint8Array(width * height);
  let head = 0;
  let tail = 0;
  const visit = (pixel) => {
    if (pixel < 0 || pixel >= seen.length || seen[pixel]) return;
    seen[pixel] = 1;
    const i = pixel * 4;
    if (Math.min(data[i], data[i + 1], data[i + 2]) < 237) return;
    data[i + 3] = 0;
    queue[tail++] = pixel;
  };
  for (let col = 0; col < width; col++) {
    visit(col);
    visit((height - 1) * width + col);
  }
  for (let row = 0; row < height; row++) {
    visit(row * width);
    visit(row * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    if (pixel % width) visit(pixel - 1);
    if (pixel % width < width - 1) visit(pixel + 1);
    visit(pixel - width);
    visit(pixel + width);
  }
  await sharp(data, { raw: info }).trim().resize({ height: 650 })
    .webp({ quality: 90 }).toFile(path.join('public/assets', `${name}.webp`));
}
console.log('Prepared original component assets in public/assets.');
