import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assemblePackage } from './package-preview.mjs';
import { smokeInstallPackage } from './package-consumer-smoke.mjs';

async function fixture() {
 const root=await mkdtemp(join(tmpdir(),'bma-consumer-fixture-'));
 await mkdir(join(root,'packages/core/dist'),{recursive:true});
 await mkdir(join(root,'packages/cli/dist'),{recursive:true});
 await writeFile(join(root,'package.json'),JSON.stringify({name:'workspace',version:'0.1.0',private:true}));
 await writeFile(join(root,'packages/core/package.json'),JSON.stringify({name:'@breakmyapp/core',version:'0.1.0',dependencies:{}}));
 await writeFile(join(root,'packages/cli/package.json'),JSON.stringify({name:'@breakmyapp/cli',version:'0.1.0',dependencies:{'@breakmyapp/core':'0.1.0'},bin:{breakmyapp:'./dist/index.js'}}));
 await writeFile(join(root,'packages/core/dist/index.js'),"export const marker='installed';\n");
 await writeFile(join(root,'packages/cli/dist/index.js'),"#!/usr/bin/env node\nimport {marker} from '@breakmyapp/core';\nif(marker!=='installed')process.exit(2);\nif(process.argv.includes('--version'))console.log('0.1.0');\nelse if(process.argv.includes('--help'))console.log('Usage: breakmyapp scan <url>');\n");
 await writeFile(join(root,'README.md'),'# smoke\n');
 await writeFile(join(root,'LICENSE'),'MIT\n');
 return root;
}

test('installs and executes packed CLI from an isolated consumer, offline',async()=>{
 const root=await fixture();
 try {
  const {output}=await assemblePackage({root});
  const result=await smokeInstallPackage({previewDir:output,offline:true});
  assert.equal(result.version,'0.1.0');
  assert.equal(result.cliHelp,true);
  assert.equal(result.packageName,'@breakmyapp/cli');
 }finally {await rm(root,{recursive:true,force:true});}
});

test('rejects previews still using unpublished core dependency',async()=>{
 const root=await fixture();
 try {
  const {output}=await assemblePackage({root});
  const path=join(output,'package.json');
  const manifest=JSON.parse(await readFile(path,'utf8'));
  manifest.dependencies['@breakmyapp/core']='0.1.0';
  await writeFile(path,JSON.stringify(manifest));
  await assert.rejects(smokeInstallPackage({previewDir:output,offline:true}),/unpublished/);
 }finally {await rm(root,{recursive:true,force:true});}
});
