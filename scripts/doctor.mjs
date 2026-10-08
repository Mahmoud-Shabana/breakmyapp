#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = { major: 22, minor: 12, patch: 0 };

export function parseNodeVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).replace(/^v/, ''));
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}

export function isSupportedNode(version) {
  const parsed = parseNodeVersion(version);
  if (!parsed) return false;
  return parsed.major > required.major ||
    (parsed.major === required.major &&
      (parsed.minor > required.minor || (parsed.minor === required.minor && parsed.patch >= required.patch)));
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

export async function inspectEnvironment({ version = process.versions.node, resolveModule = require.resolve, fileExists = exists,
  executablePath = null } = {}) {
  const checks = [];
  const record = (id, pass, detail, fix = '') => checks.push({ id, pass: !!pass, detail, ...(pass ? {} : { fix }) });
  record('node', isSupportedNode(version), 'Node.js ' + version, 'Install Node.js 22.12.0 or newer.');
  for (const [name, label] of [
    ['typescript', 'TypeScript'], ['playwright', 'Playwright'],
    ['@axe-core/playwright', 'axe-core Playwright'], ['sharp', 'Sharp']
  ]) {
    let found = false;
    try { found = !!resolveModule(name, { paths: [root] }); } catch { /* missing */ }
    record('package:' + name, found, label + (found ? ' installed' : ' missing'), 'Run npm install in the repository root.');
  }
  let chromium = executablePath;
  if (!chromium) {
    try { chromium = require('playwright').chromium.executablePath(); } catch { /* missing */ }
  }
  record('chromium', !!chromium && await fileExists(chromium),
    chromium || 'Chromium browser unavailable', 'Run npx playwright install chromium.');
  for (const [id, path, hint] of [
    ['core-build', 'packages/core/dist/index.js', 'Run npm run build.'],
    ['cli-build', 'packages/cli/dist/index.js', 'Run npm run build.'],
    ['studio', 'apps/studio/index.html', 'Restore the Studio source files.']
  ]) {
    const present = await fileExists(resolve(root, path));
    record(id, present, path + (present ? ' present' : ' missing'), hint);
  }
  return { ready: checks.every(c => c.pass), checks };
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const result = await inspectEnvironment();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('BreakMyApp Doctor — scanner prerequisites\n');
    for (const check of result.checks) {
      console.log((check.pass ? 'PASS' : 'FAIL') + ' ' + check.detail);
      if (!check.pass) console.log('     Fix: ' + check.fix);
    }
    console.log(result.ready ? '\nReady for local scanner smoke tests.' : '\nNot ready: fix the failed checks above.');
  }
  if (!result.ready) process.exitCode = 1;
}
