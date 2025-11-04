# Pre-Public Hardening Report

Date: 2025-11-04
Branch: pre-public-hardening

## Stack detected
- Primary: Node.js (Electron apps)
- Apps: `video-merger-gui/` and `video-splitter-gui/`
- Packaging: electron-packager (Windows portable), electron-builder (macOS DMG, Linux AppImage/DEB/RPM)

## Tools and checks run
- Secrets scan (repo HEAD): regex grep for common secret terms; sensitive filename sweep
- .gitignore strengthened for Node/Electron and secrets
- Policy docs added: SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md
- CI added (non-blocking):
  - CodeQL (JavaScript)
  - Dependency Review (GitHub)
  - Node audit (npm audit in root and both GUIs) with artifacts
  - Packaging sanity (build on win/mac/linux and attach checksums)
- Release hygiene:
  - Ensure dist/ and releases/ are ignored; checksums script added
  - Release template added
- SBOM note: package-lock.json included (de-facto SBOM for Node projects)

## Findings
- No plaintext secrets found in tracked sources at HEAD. Grep hits were within GitHub Actions env references (GITHUB_TOKEN) and Chromium license bundles in built artifacts.
- Built artifacts were present under `dist/` and `video-*/dist/` and `releases/` in the repo. These are now ignored; recommend deleting tracked copies in history if large (see HISTORY_CLEANUP.md).
- Licensing: LICENSE present (MIT). THIRD_PARTY_NOTICES.md present; FFmpeg/Chromium notices called out.

## Actions taken
- Added/updated files:
  - SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md
  - .github/workflows/codeql.yml, dependency-review.yml, node-audit.yml, packaging-sanity.yml
  - RELEASE_TEMPLATE.md
  - scripts/print_sha256.sh
  - tools/prepublish_check.sh
  - Strengthened .gitignore
  - Updated README footer (MIT one-liner) and link to THIRD_PARTY_NOTICES.md
- Removed tracked build outputs from index (to be reflected in this PR): dist/ and releases/ paths untracked going forward.

## Manual follow-ups
- Rotate any secrets if you know they were ever committed (none detected in HEAD; see HISTORY_CLEANUP.md if you need to scrub history).
- macOS notarization and Windows code signing (requires developer ID / certs).
- Enable recommended GitHub repo settings (below).

## Recommended GitHub settings (post-merge)
- Enable Dependabot alerts and security updates
- Enable Secret Scanning (and Push Protection if available)
- Require PR reviews on `main`
- Restrict Actions to this repo; prefer pinning actions by commit SHA
- Set GITHUB_TOKEN default permissions to read-only; grant per-workflow as needed

## ROTATE THESE SECRETS
- None detected in HEAD.

## SBOM
- For Node, `package-lock.json` serves as a de-facto SBOM. Consider adding `npm sbom` or CycloneDX in the future.
