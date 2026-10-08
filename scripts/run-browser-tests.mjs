import { spawnSync } from 'node:child_process';

// No platform-specific environment assignment or shell glob expansion.
const result = spawnSync(process.execPath, [
  '--test',
  'packages/core/dist/test/scan.test.js'
], {
  stdio: 'inherit',
  env: { ...process.env, BREAKMYAPP_BROWSER_TESTS: '1' }
});

process.exitCode = result.status ?? 1;
