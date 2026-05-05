import { build, context } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';

function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;

  const content = readFileSync(path, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (!key || process.env[key]) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadDotEnv();

function defineString(name, envName) {
  return [name, JSON.stringify(process.env[envName] || '')];
}

const define = Object.fromEntries([
  defineString(
    '__PHI_EMBEDDED_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_ID__',
    'PHI_EMBEDDED_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_ID'
  ),
  defineString(
    '__PHI_EMBEDDED_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_SECRET__',
    'PHI_EMBEDDED_GOOGLE_GEMINI_CLI_OAUTH_CLIENT_SECRET'
  ),
  defineString(
    '__PHI_EMBEDDED_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_ID__',
    'PHI_EMBEDDED_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_ID'
  ),
  defineString(
    '__PHI_EMBEDDED_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_SECRET__',
    'PHI_EMBEDDED_GOOGLE_ANTIGRAVITY_OAUTH_CLIENT_SECRET'
  ),
]);

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  minify: true,
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  define,
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[Phi] Watching extension host bundle...');
} else {
  await build(options);
}
