import { spawnSync } from 'node:child_process';
import { smokeInstalledScanner } from './smoke-scanner.mjs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function npmCommand(args, cwd, timeoutMs = 180_000) {
  const win = process.platform === 'win32';
  const result = spawnSync(win ? 'npm.cmd' : 'npm', args, {
    cwd, encoding: 'utf8', shell: win, timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' }
  });
  if (result.error || result.status !== 0) {
    throw new Error('npm ' + args[0] + ' failed: ' + (result.error?.message ?? result.stderr ?? 'unknown error').slice(0, 1500));
  }
  return result.stdout;
}

/** Pack the staged package, install in a clean consumer and run its executable. */
export async function smokeInstallPackage({ previewDir = join(root, '.breakmyapp/package-preview'), offline = false, runScan = false } = {}) {
  const preview = resolve(previewDir);
  const manifest = JSON.parse(await readFile(join(preview, 'package.json'), 'utf8'));
  if (manifest.private !== true || manifest.name !== '@breakmyapp/cli' || !manifest.bin?.breakmyapp) {
    throw new Error('Expected a private @breakmyapp/cli package preview with a CLI executable.');
  }
  if (manifest.dependencies?.['@breakmyapp/core']) {
    throw new Error('Package preview still depends on unpublished @breakmyapp/core.');
  }
  const work = await mkdtemp(join(tmpdir(), 'bma-consumer-smoke-'));
  try {
    const packed = JSON.parse(npmCommand(['pack', preview, '--json', '--pack-destination', work], work));
    if (packed.length !== 1 || !packed[0]?.filename) throw new Error('Expected one npm tarball.');
    const files = packed[0].files?.map(f => f.path) ?? [];
    if (!files.includes('dist/index.js') || !files.includes('dist/core/index.js')) {
      throw new Error('Tarball lacks compiled CLI or Core entrypoint.');
    }
    if (files.some(path => /(?:^|\/)test\//.test(path) || /\.test\.[cm]?js$/.test(path))) {
      throw new Error('Tarball unexpectedly contains development tests.');
    }
    const consumer = join(work, 'consumer');
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({name:'breakmyapp-smoke-consumer',version:'1.0.0',private:true,type:'module'}));
    npmCommand(['install', join(work, packed[0].filename), '--no-audit', '--no-fund', '--no-save', ...(offline ? ['--offline'] : [])], consumer);
    const entry = join(consumer, 'node_modules', '@breakmyapp', 'cli', 'dist', 'index.js');
    function execute(flag) {
      const outcome = spawnSync(process.execPath, [entry, flag], {
        cwd: consumer, encoding: 'utf8', timeout: 25_000, maxBuffer: 1024 * 1024
      });
      if (outcome.error || outcome.status !== 0) {
        throw new Error('Installed CLI ' + flag + ' failed: ' + (outcome.error?.message ?? outcome.stderr ?? '').slice(0, 1500));
      }
      return outcome.stdout;
    }
    const versionOutput = execute('--version').trim();
    if (versionOutput !== manifest.version) throw new Error('Installed CLI version mismatch: '+versionOutput);
    const helpOutput = execute('--help');
    if (!helpOutput.includes('breakmyapp') || !helpOutput.includes('scan')) {
      throw new Error('Installed CLI has no working help/scan command.');
    }
    const scan = runScan ? await smokeInstalledScanner({ entry, cwd:consumer, withAccessibility:true }) : null;
    return {version: versionOutput, contents: files.length, cliHelp: true, packageName:manifest.name, scan};
  } finally {
    await rm(work, {recursive:true,force:true});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const outcome = await smokeInstallPackage({offline:process.argv.includes('--offline'),runScan:process.argv.includes('--scan')});
    console.log('Installed packaged CLI in an isolated consumer successfully.');
    console.log(outcome.packageName + '@' + outcome.version + ' — ' + outcome.contents + ' packed files.');
    if (outcome.scan) console.log('Real browser smoke PASSED: ' + outcome.scan.pages + ' pages, ' + outcome.scan.findings + ' findings.');
  } catch (error) {
    console.error('Consumer smoke test failed: ' + error.message);
    process.exitCode = 1;
  }
}
