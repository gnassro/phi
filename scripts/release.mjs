#!/usr/bin/env node

/**
 * release.mjs — One-command release for Phi.
 *
 * Queries the Open VSX API for the current production version,
 * auto-detects bump level from conventional commits, bumps version,
 * generates CHANGELOG.md, commits, tags, and pushes.
 *
 * GitHub Actions then picks up the tag and publishes automatically.
 *
 * Usage:
 *   node scripts/release.mjs              # Auto-detect bump level, do everything
 *   node scripts/release.mjs patch        # Force patch bump
 *   node scripts/release.mjs minor        # Force minor bump
 *   node scripts/release.mjs status       # Print current status (no changes)
 *   node scripts/release.mjs publish      # Post-publish: sync .published-version from Open VSX
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';

const OPENVSX_API = 'https://open-vsx.org/api/gnassro/phi-agent';
const pkgPath = path.resolve('package.json');
const publishedPath = path.resolve('.published-version');
const changelogPath = path.resolve('CHANGELOG.md');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;

// ── Helpers ──

async function getPublishedVersion() {
  try {
    const res = await fetch(OPENVSX_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const liveVersion = data.version;
    fs.writeFileSync(publishedPath, liveVersion, 'utf8');
    return { version: liveVersion, source: 'Open VSX API' };
  } catch {
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

function getCommitsSincePublish(publishedVersion) {
  try {
    const log = execSync('git log --oneline --format="%s" HEAD', { encoding: 'utf8' });
    const lines = log.trim().split('\n');
    const releaseIdx = lines.findIndex(l => l.includes(`release: v${publishedVersion}`));
    return releaseIdx >= 0 ? lines.slice(0, releaseIdx) : lines.slice(0, 50);
  } catch {
    return [];
  }
}

function detectBumpLevel(commits) {
  const hasFeature = commits.some(l => l.startsWith('feat:') || l.startsWith('feat('));
  return hasFeature ? 'minor' : 'patch';
}

function generateChangelog(commits, newVersion) {
  const features = [];
  const fixes = [];
  const docs = [];
  const maintenance = [];

  for (const msg of commits) {
    // Skip release commits and merge commits
    if (msg.startsWith('release:') || msg.startsWith('Merge')) continue;

    if (msg.startsWith('feat:') || msg.startsWith('feat(')) {
      features.push(msg.replace(/^feat(\([^)]*\))?:\s*/, ''));
    } else if (msg.startsWith('fix:') || msg.startsWith('fix(')) {
      fixes.push(msg.replace(/^fix(\([^)]*\))?:\s*/, ''));
    } else if (msg.startsWith('docs:') || msg.startsWith('docs(')) {
      docs.push(msg.replace(/^docs(\([^)]*\))?:\s*/, ''));
    } else if (msg.startsWith('chore:') || msg.startsWith('refactor:') || msg.startsWith('ui:')) {
      maintenance.push(msg.replace(/^(chore|refactor|ui)(\([^)]*\))?:\s*/, ''));
    }
  }

  const today = new Date().toISOString().split('T')[0];
  let section = `## [${newVersion}] - ${today}\n`;

  if (features.length) {
    section += '\n### Added\n';
    section += features.map(f => `- ${f}`).join('\n') + '\n';
  }
  if (fixes.length) {
    section += '\n### Fixed\n';
    section += fixes.map(f => `- ${f}`).join('\n') + '\n';
  }
  if (docs.length) {
    section += '\n### Docs\n';
    section += docs.map(d => `- ${d}`).join('\n') + '\n';
  }
  if (maintenance.length) {
    section += '\n### Changed\n';
    section += maintenance.map(m => `- ${m}`).join('\n') + '\n';
  }

  return section;
}

function updateChangelogFile(newSection) {
  let changelog = '';
  try {
    changelog = fs.readFileSync(changelogPath, 'utf8');
  } catch {
    changelog = '# Changelog\n';
  }

  // Insert new section after the "# Changelog" header
  const headerEnd = changelog.indexOf('\n');
  if (headerEnd >= 0) {
    changelog = changelog.slice(0, headerEnd + 1) + '\n' + newSection + '\n' + changelog.slice(headerEnd + 1);
  } else {
    changelog = '# Changelog\n\n' + newSection + '\n';
  }

  fs.writeFileSync(changelogPath, changelog, 'utf8');
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

// ── Main ──

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

  // ── Pre-flight checks ──

  // Check for uncommitted changes
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      console.error('❌ Working directory is not clean. Commit or stash changes first.');
      console.error(status);
      process.exit(1);
    }
  } catch {
    console.error('❌ Failed to check git status.');
    process.exit(1);
  }

  // Check we're on master branch
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    if (branch !== 'master') {
      console.error('');
      console.error(`  ❌ You are on branch '${branch}', not 'master'.`);
      console.error('');
      console.error('  Releases must be made from the master branch. To proceed:');
      console.error('');
      console.error(`    1. Commit all changes on '${branch}'`);
      console.error(`    2. git checkout master`);
      console.error(`    3. git merge ${branch}`);
      console.error('    4. pnpm run release');
      console.error('');
      process.exit(1);
    }
  } catch {
    console.error('❌ Failed to check git branch.');
    process.exit(1);
  }

  // ── Determine version ──
  const commits = getCommitsSincePublish(publishedVersion);
  const level = (command === 'auto') ? detectBumpLevel(commits) : command;
  const newVersion = bumpVersion(publishedVersion, level);

  // Generate changelog for preview
  const changelogSection = generateChangelog(commits, newVersion);

  // ── Summary ──
  console.log('');
  console.log('  ╔═══════════════════════════════════════════════╗');
  console.log('  ║            📦 RELEASE SUMMARY                 ║');
  console.log('  ╚═══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Production version:  v${publishedVersion} (${published.source})`);
  console.log(`  New version:         v${newVersion} (${level.toUpperCase()} bump)`);
  console.log(`  Commits included:    ${commits.length}`);
  console.log('');
  console.log('  This command will:');
  console.log(`    1. Bump package.json to v${newVersion}`);
  console.log('    2. Update version references in README.md');
  console.log('    3. Generate CHANGELOG.md section (see preview below)');
  console.log('    4. Reset build number to 0');
  console.log(`    5. Commit: "release: v${newVersion}"`);
  console.log(`    6. Create git tag: v${newVersion}`);
  console.log('    7. Push commit + tag to origin');
  console.log('    8. → GitHub Actions will auto-publish to Open VSX');
  console.log('    9. → GitHub Actions will create a GitHub Release');
  console.log('');
  console.log('  ── Changelog Preview ──');
  console.log(changelogSection.split('\n').map(l => `  ${l}`).join('\n'));
  console.log('');

  const answer = await ask('  Proceed with release? (y/N) ');
  if (answer !== 'y') {
    console.log('  Aborted.');
    process.exit(0);
  }

  console.log('');

  // ── 1. Bump package.json ──
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`  ✅ package.json → v${newVersion}`);

  // ── 2. Update README version references ──
  try {
    let readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
    readme = readme.replace(new RegExp(currentVersion.replace(/\./g, '\\.'), 'g'), newVersion);
    fs.writeFileSync(path.resolve('README.md'), readme, 'utf8');
    console.log(`  ✅ README.md version refs updated`);
  } catch {}

  // ── 3. Update CHANGELOG.md ──
  updateChangelogFile(changelogSection);
  console.log(`  ✅ CHANGELOG.md updated`);

  // ── 4. Reset build number ──
  fs.writeFileSync(path.resolve('.build-number'), '0', 'utf8');
  console.log(`  ✅ Build number reset to 0`);

  // ── 5. Git commit ──
  run(`git add package.json README.md CHANGELOG.md .build-number .published-version`);
  run(`git commit -m "release: v${newVersion}"`);
  console.log(`  ✅ Committed: release: v${newVersion}`);

  // ── 6. Git tag ──
  run(`git tag v${newVersion}`);
  console.log(`  ✅ Tagged: v${newVersion}`);

  // ── 7. Push ──
  const pushAnswer = await ask('  Push commit + tag to origin? (y/N) ');
  if (pushAnswer === 'y') {
    run('git push origin HEAD');
    run(`git push origin v${newVersion}`);
    console.log('');
    console.log(`  🚀 Pushed! GitHub Actions will now:`);
    console.log(`     1. Build & typecheck`);
    console.log(`     2. Package .vsix`);
    console.log(`     3. Publish to Open VSX`);
    console.log(`     4. Create GitHub Release with changelog`);
  } else {
    console.log('');
    console.log(`  📦 Release prepared locally. When ready, run:`);
    console.log(`     git push origin HEAD`);
    console.log(`     git push origin v${newVersion}`);
  }

  console.log('');
})();
