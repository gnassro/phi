#!/usr/bin/env node

/**
 * release.mjs — Automated version bumping for Phi releases.
 *
 * Reads `.published-version` (last version pushed to Open VSX) and
 * `package.json` version (current dev version).
 *
 * Logic:
 *   - If package.json == .published-version → needs bump (changes since last publish)
 *   - If package.json >  .published-version → already bumped, still in dev
 *
 * Bump level (when bumping):
 *   - Any `feat:` commit since last publish → MINOR (0.2.1 → 0.3.0)
 *   - Only `fix:`, `docs:`, `chore:`, `ui:`, `refactor:` → PATCH (0.2.1 → 0.2.2)
 *
 * Usage:
 *   node scripts/release.mjs          # Auto-detect bump level
 *   node scripts/release.mjs patch    # Force patch bump
 *   node scripts/release.mjs minor    # Force minor bump
 *   node scripts/release.mjs status   # Just print current status
 *   node scripts/release.mjs publish  # After publishing, update .published-version
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const pkgPath = path.resolve('package.json');
const publishedPath = path.resolve('.published-version');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;

let publishedVersion = '0.0.0';
try {
  publishedVersion = fs.readFileSync(publishedPath, 'utf8').trim();
} catch {}

const command = process.argv[2] || 'auto';

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

function detectBumpLevel() {
  try {
    // Get commits since the published version tag or use a reasonable default
    const log = execSync('git log --oneline --format="%s" HEAD', { encoding: 'utf8' });
    const lines = log.trim().split('\n');
    
    // Find the release commit for the published version
    const releaseIdx = lines.findIndex(l => l.includes(`release: v${publishedVersion}`));
    const commitsSincePublish = releaseIdx >= 0 ? lines.slice(0, releaseIdx) : lines.slice(0, 20);
    
    const hasFeature = commitsSincePublish.some(l => l.startsWith('feat:') || l.startsWith('feat('));
    return hasFeature ? 'minor' : 'patch';
  } catch {
    return 'patch';
  }
}

// ── Status ──
if (command === 'status') {
  const cmp = compareVersions(currentVersion, publishedVersion);
  console.log(`  Published (Open VSX):  v${publishedVersion}`);
  console.log(`  Current (package.json): v${currentVersion}`);
  if (cmp === 0) {
    console.log(`  Status: ⚠️  Same as production — needs bump before next publish`);
  } else if (cmp > 0) {
    console.log(`  Status: ✅ Already bumped — in development (not yet published)`);
  } else {
    console.log(`  Status: ❌ Current is BEHIND production — something is wrong`);
  }
  process.exit(0);
}

// ── Publish (post-publish step) ──
if (command === 'publish') {
  fs.writeFileSync(publishedPath, currentVersion, 'utf8');
  console.log(`✅ Marked v${currentVersion} as published`);
  process.exit(0);
}

// ── Auto / Patch / Minor ──
const cmp = compareVersions(currentVersion, publishedVersion);

if (cmp > 0) {
  console.log(`ℹ️  Already bumped: v${publishedVersion} (published) → v${currentVersion} (dev)`);
  console.log(`   No version change needed. Run 'pnpm run package' to build.`);
  process.exit(0);
}

const level = command === 'auto' ? detectBumpLevel() : command;
const newVersion = bumpVersion(publishedVersion, level);

console.log(`  Published:  v${publishedVersion}`);
console.log(`  Bump level: ${level.toUpperCase()}`);
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
console.log(`   4. node scripts/release.mjs publish`);
