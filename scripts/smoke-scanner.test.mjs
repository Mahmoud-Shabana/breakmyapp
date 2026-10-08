import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { smokeInstalledScanner } from './smoke-scanner.mjs';

test('validates required arguments', async () => {
  await assert.rejects(smokeInstalledScanner(), /entry and consumer/);
});

test('fails closed if installed CLI does not produce a report', async () => {
  const dir = await mkdtemp(join(tmpdir(),'bma-smoke-fail-'));
  try {
    const entry = join(dir,'fake.mjs');
    await writeFile(entry, 'process.exit(0);\n');
    await assert.rejects(smokeInstalledScanner({entry,cwd:dir,withAccessibility:false}),/ENOENT/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('fails closed if installed CLI reports no observed bugs', async () => {
  const dir = await mkdtemp(join(tmpdir(),'bma-smoke-empty-'));
  try {
    const entry = join(dir,'fake.mjs');
    await writeFile(entry, "import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';const p=process.argv.indexOf('-o');const out=process.argv[p+1];await mkdir(out,{recursive:true});await writeFile(join(out,'report.json'),JSON.stringify({schemaVersion:1,findings:[],pagesScanned:[]}));");
    await assert.rejects(smokeInstalledScanner({entry,cwd:dir,withAccessibility:false}),/failed to crawl/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
