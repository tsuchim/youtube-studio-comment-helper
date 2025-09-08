#!/usr/bin/env node
// Sync manifest.json version to package.json version if different.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const pkgPath = path.join(root, 'package.json');
const manifestPath = path.join(root, 'manifest.json');

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
} catch (err) {
  console.error(`Error reading or parsing package.json at ${pkgPath}: ${err.message}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error(`Error reading or parsing manifest.json at ${manifestPath}: ${err.message}`);
  process.exit(1);
}

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`Updated manifest.json version -> ${pkg.version}`);
  } catch (err) {
    console.error(`Error writing manifest.json at ${manifestPath}: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
} else {
  console.log('manifest.json already in sync');
}
