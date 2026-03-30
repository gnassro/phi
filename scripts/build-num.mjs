import fs from 'fs';
import path from 'path';

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

const versionStr = `${version}+${num}`;

fs.writeFileSync(path.resolve('src/version.ts'), `export const EXTENSION_VERSION = '${versionStr}';\n`, 'utf8');
fs.writeFileSync(path.resolve('public/version.js'), `export const EXTENSION_VERSION = '${versionStr}';\n`, 'utf8');

console.log(`Updated version files to ${versionStr}`);
