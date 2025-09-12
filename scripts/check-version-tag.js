#!/usr/bin/env node
// Check that versions are consistent and, if on a tag, that the tag matches package.json version.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const strictTag = process.argv.includes('--strict-tag');

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`[check-version-tag] Failed to read ${p}:`, e.message);
    process.exit(1);
  }
}

function getCurrentTag() {
  // Prefer CI env var
  const ref = process.env.GITHUB_REF || '';
  if (ref.startsWith('refs/tags/')) return ref.replace('refs/tags/', '');
  // Fallback to local git if available
  try {
    const out = execSync('git describe --tags --exact-match HEAD', { stdio: ['ignore', 'pipe', 'ignore'] });
    return String(out).trim();
  } catch {
    return '';
  }
}

const pkg = readJson(path.join(root, 'package.json'));
const manifest = readJson(path.join(root, 'manifest.json'));

const pkgVer = String(pkg.version || '').trim();
const manVer = String(manifest.version || '').trim();

if (!pkgVer) {
  console.error('[check-version-tag] package.json version is missing');
  process.exit(1);
}
if (!manVer) {
  console.error('[check-version-tag] manifest.json version is missing');
  process.exit(1);
}

if (pkgVer !== manVer) {
  console.error(`[check-version-tag] Version mismatch: package.json(${pkgVer}) != manifest.json(${manVer})`);
  process.exit(1);
}

const tag = getCurrentTag();
if (tag) {
  const expected = `v${pkgVer}`;
  if (tag !== expected) {
    console.error(`[check-version-tag] Tag mismatch: current tag is ${tag} but expected ${expected}`);
    process.exit(1);
  }
  console.log(`[check-version-tag] Tag OK: ${tag} matches package.json version ${pkgVer}`);
} else if (strictTag) {
  console.error('[check-version-tag] --strict-tag specified but no tag detected on HEAD');
  process.exit(1);
} else {
  console.log('[check-version-tag] No tag detected; package.json and manifest.json versions are in sync');
}
