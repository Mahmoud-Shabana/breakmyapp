import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assemblePackage } from './package-preview.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'bma-package-preview-'));
  for (const path of ['packages/core/dist/test', 'packages/cli/dist']) {
    await mkdir(join(root, path), { recursive: true });
  }
  const obj = (path, value) => writeFile(join(root, path), JSON.stringify(value));
  await obj('package.json', {version:'0.1.0',description:'Test project'});
  await obj('packages/core/package.json', { name:'@breakmyapp/core',version:'0.1.0',dependencies:{playwright:'^1.55.0',sharp:'^0.34.0'} });
  await obj('packages/cli/package.json', { name:'@breakmyapp/cli',version:'0.1.0',bin:{breakmyapp:'./dist/index.js'},dependencies:{'@breakmyapp/core':'0.1.0'} });
  await writeFile(join(root, 'packages/core/dist/index.js'), "export {fake} from './fake.js';\n");
  await writeFile(join(root, 'packages/core/dist/fake.js'), 'export const fake = true;\n');
  await writeFile(join(root, 'packages/core/dist/test/ignore.test.js'), 'throw Error("not a runtime file");\n');
  await writeFile(join(root, 'packages/cli/dist/index.js'), "#!/usr/bin/env node\nimport {fake} from '@breakmyapp/core';\nif (!fake) process.exit(1);\n");
  await writeFile(join(root, 'README.md'), '# Test\n');
  await writeFile(join(root, 'LICENSE'), 'MIT\n');
  return root;
}

test('stages a self-contained workspace CLI without private @breakmyapp/core runtime dependency', async () => {
  const root = await fixture();
  try {
    const {output, manifest,runtimeEntry} = await assemblePackage({root});
    assert.equal(manifest.private,true);
    assert.equal(manifest.dependencies['@breakmyapp/core'],undefined);
    assert.equal(manifest.dependencies.playwright,'^1.55.0');
    assert.equal(manifest.bin.breakmyapp,'./dist/index.js');
    assert.match(await readFile(runtimeEntry,'utf8'), /\.\/core\/index\.js/);
    assert.deepEqual((await readdir(join(output,'dist/core'))).sort(), ['fake.js','index.js']);
    const syntax=spawnSync(process.execPath,['--check',runtimeEntry],{encoding:'utf8'});
    assert.equal(syntax.status,0,syntax.stderr);
    const run=spawnSync(process.execPath,[runtimeEntry],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('npm pack --dry-run shows only intended files and no unit-test JS',async()=>{
  const root=await fixture();
  try {
    const {output}=await assemblePackage({root});
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const packed=spawnSync(npmCommand,['pack','--dry-run','--json',output],{encoding:'utf8',shell:process.platform==='win32'});
    assert.equal(packed.status,0,packed.stderr);
    const included=JSON.parse(packed.stdout)[0].files.map(f=>f.path);
    assert.ok(included.includes('dist/index.js'));
    assert.ok(included.includes('dist/core/fake.js'));
    assert.ok(!included.some(name=>name.includes('.test.js')));
    assert.ok(included.includes('LICENSE'));
  } finally {await rm(root,{recursive:true,force:true});}
});

test('rejects mismatched workspace dependencies',async()=>{
  const root=await fixture();
  try {
    await writeFile(join(root,'packages/cli/package.json'),JSON.stringify({name:'@breakmyapp/cli',version:'0.1.0',bin:{breakmyapp:'./dist/index.js'},dependencies:{'@breakmyapp/core':'9.0.0'}}));
    await assert.rejects(assemblePackage({root}),/inconsistent/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('does not delete an existing preview when a build is missing',async()=>{
  const root=await fixture();
  try {
    const first=await assemblePackage({root});
    await rm(join(root,'packages/cli/dist/index.js'));
    await assert.rejects(assemblePackage({root}));
    assert.ok((await readFile(first.runtimeEntry,'utf8')).includes('core/index.js'));
  } finally {await rm(root,{recursive:true,force:true});}
});

test('never overwrites source files when given an unsafe output directory', async()=>{
 const root=await fixture();
 try {
  const source=join(root,'packages/core/dist/index.js');
  const before=await readFile(source,'utf8');
  await assert.rejects(assemblePackage({root,output:join(root,'packages/core/dist')}),/inside .breakmyapp/);
  assert.equal(await readFile(source,'utf8'),before);
 } finally {await rm(root,{recursive:true,force:true});}
});

test('refuses symlinked preview directories before deleting anything', {skip:process.platform==='win32'}, async()=>{
 const root=await fixture();
 const outside=await mkdtemp(join(tmpdir(),'bma-not-the-repo-'));
 try {
  await symlink(outside,join(root,'.breakmyapp'));
  await assert.rejects(assemblePackage({root}),/symlinks/);
  assert.deepEqual(await readdir(outside),[]);
 } finally {await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
