import { cp, mkdir, readFile, readdir, rm, writeFile, chmod } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const internalName = '@breakmyapp/core';

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function copyRuntime(sourceDir, targetDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(sourceDir, entry.name);
    const target = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'test' || entry.name === 'tests') continue;
      await mkdir(target, { recursive: true });
      await copyRuntime(source, target);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      await cp(source, target);
    }
  }
}

/** Assemble a local-installable preview, NOT a release or publication. */
export async function assemblePackage({ root = repositoryRoot, output = join(root, '.breakmyapp', 'package-preview') } = {}) {
  root = resolve(root);
  output = resolve(output);
  if (output === root || !output.startsWith(root + sep)) {
    throw Error('Output directory must be a descendant of the repository root.');
  }
  const rootManifest = await json(join(root, 'package.json'));
  const coreManifest = await json(join(root, 'packages/core/package.json'));
  const cliManifest = await json(join(root, 'packages/cli/package.json'));
  if (cliManifest.dependencies?.[internalName] !== coreManifest.version ||
      cliManifest.version !== coreManifest.version ||
      rootManifest.version !== coreManifest.version) {
    throw Error('Workspace versions or internal core dependency are inconsistent.');
  }
  if (!cliManifest.bin?.breakmyapp) throw Error('The CLI bin entry is missing.');
  // Fail *before* overwriting a previous preview when build artifacts are absent.
  const compiledCli = await readFile(join(root, 'packages/cli/dist/index.js'), 'utf8');
  const compiledCore = await readFile(join(root, 'packages/core/dist/index.js'), 'utf8');
  if (!compiledCore.trim()) throw Error('Compiled @breakmyapp/core index is empty.');
  const rewritten = compiledCli.replaceAll(/(['"])@breakmyapp\/core\1/g, "'./core/index.js'");
  if (rewritten === compiledCli || rewritten.includes(internalName)) {
    throw Error('Compiled CLI must import @breakmyapp/core exactly as an ESM specifier.');
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(join(output, 'dist/core'), { recursive: true });
  await copyRuntime(join(root, 'packages/core/dist'), join(output, 'dist/core'));
  await writeFile(join(output, 'dist/index.js'), rewritten.startsWith('#!') ? rewritten : '#!/usr/bin/env node\n' + rewritten);
  await chmod(join(output, 'dist/index.js'), 0o755);
  for (const file of ['README.md', 'LICENSE']) await cp(join(root, file), join(output, file));
  const dependencies = { ...coreManifest.dependencies, ...cliManifest.dependencies };
  delete dependencies[internalName];
  const packaged = {
    name: cliManifest.name,
    version: cliManifest.version,
    private: true,
    type: 'module',
    description: rootManifest.description ?? 'A local-first website bug scanner',
    engines: { node: '>=22.12.0' },
    bin: { breakmyapp: './dist/index.js' },
    dependencies,
    files: ['dist/', 'README.md', 'LICENSE'],
    license: 'MIT'
  };
  await writeFile(join(output, 'package.json'), JSON.stringify(packaged, null, 2) + '\n');
  return { output, manifest: packaged, runtimeEntry: join(output, 'dist/index.js') };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try {
    const { output, manifest } = await assemblePackage();
    console.log('Local npm-package preview: ' + relative(repositoryRoot, output));
    console.log('Name: ' + manifest.name + ' @ ' + manifest.version);
    console.log('Private preview: will NOT publish to npm.');
    console.log('Verify contents: npm pack --dry-run ' + output);
  } catch (error) {
    console.error('Package preview failed: ' + error.message);
    process.exitCode = 1;
  }
}
