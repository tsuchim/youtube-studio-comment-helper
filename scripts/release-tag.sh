#!/bin/bash
set -e

echo "Running release with tag process..."

# Bump version and create tag
npx standard-version

# Sync manifest version
npm run version:sync

# Add files and commit
git add manifest.json package.json CHANGELOG.md
if git diff --cached --quiet; then
  echo "No changes to commit"
else
  git commit -m 'chore(release): sync manifest version'
fi
