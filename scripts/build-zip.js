#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const outFile = path.join(distDir, 'youtube-studio-comment-helper.zip');

async function main() {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  // Remove existing file to ensure clean archive
  if (fs.existsSync(outFile)) {
    fs.unlinkSync(outFile);
  }

  const output = fs.createWriteStream(outFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`Created ${path.relative(projectRoot, outFile)} (${archive.pointer()} bytes)`);
  });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn(err.message);
    } else {
      throw err;
    }
  });

  archive.on('error', (err) => {
    console.error('Archiving error:', err);
    process.exit(1);
  });

  archive.pipe(output);

  // Files / directories to include
  const include = [
    'manifest.json',
    'background.js',
    'src',
    'assets',
    'scripts/validate-manifest.js',
    'pr-test.js'
  ];

  for (const item of include) {
    const full = path.join(projectRoot, item);
    if (!fs.existsSync(full)) {
      console.warn(`Skip missing: ${item}`);
      continue;
    }
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      archive.directory(full, item);
    } else {
      archive.file(full, { name: item });
    }
  }

  await archive.finalize();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
