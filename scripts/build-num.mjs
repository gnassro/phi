import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const file = path.resolve('.build-number');
const pkgPath = path.resolve('package.json');

let num = 0;
try {
  if (fs.existsSync(file)) {
    num = parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
  }
} catch (e) {}

num += 1;
if (isNaN(num)) num = 1;
fs.writeFileSync(file, num.toString(), 'utf8');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

// Read Pi SDK version
let piSdkVersion = 'unknown';
try {
  const require = createRequire(import.meta.url);
  const piPkg = require('@earendil-works/pi-coding-agent/package.json');
  piSdkVersion = piPkg.version;
} catch (e) {
  // Fallback: try to read from package.json dependency spec
  const depVersion = pkg.dependencies?.['@earendil-works/pi-coding-agent'] || 'unknown';
  piSdkVersion = depVersion.replace(/[\^~>=<]/g, '');
}

const versionWithBuild = `${version}+${num}`;

const versionModule = `export const EXTENSION_VERSION = '${version}';\nexport const EXTENSION_BUILD = '${num}';\nexport const EXTENSION_VERSION_WITH_BUILD = '${versionWithBuild}';\nexport const PI_SDK_VERSION = '${piSdkVersion}';\n`;

fs.writeFileSync(path.resolve('src/version.ts'), versionModule, 'utf8');
fs.writeFileSync(path.resolve('public/version.js'), versionModule, 'utf8');

console.log(`Updated version files to ${versionWithBuild} (Pi SDK ${piSdkVersion})`);
