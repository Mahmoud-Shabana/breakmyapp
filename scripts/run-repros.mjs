import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = resolve(process.argv[2] ?? '.breakmyapp/repros');
let names;
try {
  names = (await readdir(dir)).filter(name => /^[a-f0-9]{16}\.test\.mjs$/.test(name)).sort();
} catch {
  console.error('Reproducer directory not found. Run a scan with --repro first.');
  process.exit(1);
}
if (!names.length) {
  console.error('No reproduction tests generated. Run a scan with --repro first.');
  process.exit(1);
}
console.log('Running ' + names.length + ' generated, opt-in tests. Verify target authorization before running.');
const run = spawnSync(process.execPath, ['--test', ...names.map(name => join(dir, name))], {
  stdio: 'inherit',
  env: process.env
});
process.exitCode = run.status ?? 1;
