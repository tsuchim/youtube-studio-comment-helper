# Release process (developer-facing)

This document contains the technical details for contributors and maintainers about how a release is built and published from this repository.

## Overview
- Releases are created from a tagged commit. The release workflow (`.github/workflows/release.yml`) checks out the tag, runs a version synchronization, verifies versions, builds a ZIP, generates a SHA256 checksum, uploads artifacts, and creates a GitHub Release with the artifacts attached.

## Key scripts and where they run
- `scripts/check-version-tag.js`
  - Validates that `package.json` and `manifest.json` versions are identical.
  - If a tag is present, validates that the tag name (leading `v` stripped) matches `package.json` version.

- `scripts/sync-manifest-version.js`
  - Copies `package.json.version` into `manifest.json.version` if they differ. Used to ensure the Chrome extension manifest stays in sync with package version.

- `scripts/build-zip.js`
  - Produces the release ZIP in `dist/` and uses `archiver` to include only the files/directories enumerated in the script (manifest.json, background.js, src, assets, etc.).

## Workflow (`.github/workflows/release.yml`) summary
1. Checkout repository at the resolved tag.
2. `npm run version:sync` — sync manifest to package version.
3. `node scripts/check-version-tag.js` — fail-fast if versions or tag mismatch.
4. `npm ci`
5. `npm run build:zip` — produce `dist/<artifact>.zip`.
6. Generate SHA256 checksum.
7. Upload artifacts to the workflow run.
8. Create or update GitHub Release using `softprops/action-gh-release@v2` and attach ZIP + SHA256.

## Security and reproducibility guarantees
- Deterministic source snapshot: workflow checks out the specific commit referenced by the tag, guaranteeing the source code used for building can be reproduced by checking out that tag locally.
- Explicit include list: `scripts/build-zip.js` contains an explicit list of files/directories to include in the ZIP. It does not glob the entire checkout without control — this reduces accidental inclusion.
- Artifact integrity: Each release includes a SHA256 checksum file for consumers to verify.
- Signing: We do not perform GPG or store-specific cryptographic signing. If signing is required, we can add a workflow step that uses a key stored in GitHub Secrets to sign artifacts.

## Operational notes
- Workflow permissions: The workflow requires `contents: write` in order to create releases. Ensure repository Actions settings allow workflows to use `GITHUB_TOKEN` with write permissions.
- External dependencies: The build scripts currently do not fetch remote resources for inclusion into the ZIP. If future build steps require network fetches, those sources must be audited and/or pinned.

## How to reproduce locally
1. Checkout the tag you want to reproduce: `git checkout refs/tags/vX.Y.Z`
2. Run `npm ci` to install dependencies
3. Optionally run `npm run version:sync` to align manifest
4. Run `npm run build:zip` to create the ZIP under `dist/`
5. Verify checksums and inspect files

## Publish to store
- This repository automates GitHub Releases. Publishing to browser extension stores is not automated.

To add automated store publishing:
- Add a workflow step that uploads the built ZIP to the store's API using a dedicated token stored in GitHub Secrets.
- Prefer service accounts or limited-scope tokens and restrict usage to the specific repository's workflows.

## Troubleshooting
- Version mismatch error: Run `node scripts/check-version-tag.js` locally. If it reports a mismatch, run `npm run version:sync` and commit the change prior to tagging.
- Release failing with permissions error: Check repository Settings → Actions → General → Workflow permissions; set to "Read and write".

---

Optional reproducible manifest
- We can include a `RELEASE_MANIFEST.json` inside each ZIP containing file hashes and the commit SHA used to create the artifact. Including this manifest reduces ambiguity about the artifact's provenance and is recommended when strict reproducibility or verification is required.
