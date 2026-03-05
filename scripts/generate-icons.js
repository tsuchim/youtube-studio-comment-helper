// Regenerate extension icons from the single source image.
// Usage: node scripts/generate-icons.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

function fail(msg) {
  console.error('[icons] ' + msg);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sourcePath = path.join(rootDir, 'assets', 'youtube-studio-comment-helper-icon.png');
if (!fs.existsSync(sourcePath)) {
  fail(`source icon not found: ${sourcePath}`);
}

const sizes = [16, 48, 128, 300];

const src = sharp(sourcePath, { failOn: 'none' });
const meta = await src.metadata();
if (!meta.width || !meta.height) {
  fail('failed to read source image metadata');
}
const minRequired = Math.max(...sizes);
if (meta.width < minRequired || meta.height < minRequired) {
  fail(`source icon is too small: ${meta.width}x${meta.height} (need >= ${minRequired}x${minRequired})`);
}

console.log(`[icons] source: ${path.relative(rootDir, sourcePath)} (${meta.width}x${meta.height})`);

for (const size of sizes) {
  const outPath = path.join(rootDir, 'assets', `icon-${size}.png`);

  await sharp(sourcePath, { failOn: 'none' })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);

  const stat = fs.statSync(outPath);
  console.log(`[icons] wrote: ${path.relative(rootDir, outPath)} (${stat.size} bytes)`);
}

console.log('[icons] done');
