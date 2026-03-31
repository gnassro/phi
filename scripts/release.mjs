#!/usr/bin/env node

/**
 * release.mjs — Automated version bumping for Phi releases.
 *
 * Queries the Open VSX API to get the ACTUAL production version,
 * syncs `.published-version`, and determines the correct bump.
 *
 * Bump level (when bumping):
 *   - Any `feat:` commit since last publish → MINOR (0.2.0 → 0.3.0)
 *   - Only `fix:`, `docs:`, `chore:`, `ui:`, `refactor:` → PATCH (0.2.0 → 0.2.1)
 *
 * Usage:
 *   node scripts/release.mjs          # Auto-detect bump level
 *   node scripts/release.mjs patch    # Force patch bump
 *   node scripts/release.mjs minor    # Force minor bump
 *   node scripts/release.mjs status   # Print current status
 *   node scripts/release.mjs publish  # After publishing, sync .published-version from Open VSX
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const OPENVSX_API = 'https://open-vsx.org/api/gnassro/phi-agent';
const pkgPath = path.resolve('package.json');
const publishedPath = path.resolve('.published-version');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;

/**
 * Fetch the latest published version from Open VSX.
 * Falls back to `.published-version` file if offline.
 */
async function getPublishedVersion() {
  try {
    const res = await fetch(OPENVSX_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const liveVersion = data.version;

    // Sync the file so it's always accurate
    fs.writeFileSync(publishedPath, liveVersion, 'utf8');
    return { version: liveVersion, source: 'Open VSX API' };
  } catch (err) {
    // Offline fallback — read from file
    try {
      const cached = fs.readFileSync(publishedPath, 'utf8').trim();
      return { version: cached, source: '.published-version (offline fallback)' };
    } catch {
      return { version: '0.0.0', source: 'unknown (no file, no API)' };
    }
  }
}

function parseVersion(v) {
  const [major, minor, patch] = v.split('.').map(Number);
  return { major, minor, patch };
}

function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  return va.patch - vb.patch;
}

function bumpVersion(version, level) {
  const v = parseVersion(version);
  if (level === 'minor') {
    return `${v.major}.${v.minor + 1}.0`;
  } else {
    return `${v.major}.${v.minor}.${v.patch + 1}`;
  }
}

function detectBumpLevel(publishedVersion) {
  try {
    const log = execSync('git log --oneline --format="%s" HEAD', { encoding: 'utf8' });
    const lines = log.trim().split('\n');

    // Find the release commit for the published version
    const releaseIdx = lines.findIndex(l => l.includes(`release: v${publishedVersion}`));
    const commitsSincePublish = releaseIdx >= 0 ? lines.slice(0, releaseIdx) : lines.slice(0, 30);

    const hasFeature = commitsSincePublish.some(l => l.startsWith('feat:') || l.startsWith('feat('));
    return hasFeature ? 'minor' : 'patch';
  } catch {
    return 'patch';
  }
}

const command = process.argv[2] || 'auto';

(async () => {
  const published = await getPublishedVersion();
  const publishedVersion = published.version;

  // ── Status ──
  if (command === 'status') {
    const cmp = compareVersions(currentVersion, publishedVersion);
    console.log(`  Production (${published.source}): v${publishedVersion}`);
    console.log(`  Development (package.json):       v${currentVersion}`);
    if (cmp === 0) {
      console.log(`  Status: ⚠️  Same as production — needs bump before next publish`);
    } else if (cmp > 0) {
      console.log(`  Status: ✅ Already bumped — in development (not yet published)`);
    } else {
      console.log(`  Status: ❌ Current is BEHIND production — something is wrong`);
    }
    process.exit(0);
  }

  // ── Publish (post-publish sync) ──
  if (command === 'publish') {
    console.log(`✅ Synced .published-version to v${publishedVersion} from ${published.source}`);
    process.exit(0);
  }

  // ── Auto / Patch / Minor ──
  const cmp = compareVersions(currentVersion, publishedVersion);

  if (cmp > 0) {
    console.log(`ℹ️  Already bumped: v${publishedVersion} (production) → v${currentVersion} (dev)`);
    console.log(`   No version change needed. Run 'pnpm run package' to build.`);
    process.exit(0);
  }

  const level = command === 'auto' ? detectBumpLevel(publishedVersion) : command;
  const newVersion = bumpVersion(publishedVersion, level);

  console.log(`  Production:  v${publishedVersion} (${published.source})`);
  console.log(`  Bump level:  ${level.toUpperCase()}`);
  console.log(`  New version: v${newVersion}`);

  // Update package.json
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // Update README badge and install command
  try {
    let readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
    readme = readme.replace(new RegExp(currentVersion.replace(/\./g, '\\.'), 'g'), newVersion);
    fs.writeFileSync(path.resolve('README.md'), readme, 'utf8');
  } catch {}

  // Reset build number
  fs.writeFileSync(path.resolve('.build-number'), '0', 'utf8');

  console.log(`\n✅ Version bumped to v${newVersion}`);
  console.log(`   Next steps:`);
  console.log(`   1. Update CHANGELOG.md with new section`);
  console.log(`   2. pnpm run package`);
  console.log(`   3. npx ovsx publish phi-agent-${newVersion}.vsix -p <token>`);
  console.log(`   4. pnpm run release:publish`);
})();
