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

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Updated manifest.json version -> ${pkg.version}`);
  process.exit(0);
} else {
  console.log('manifest.json already in sync');
}
