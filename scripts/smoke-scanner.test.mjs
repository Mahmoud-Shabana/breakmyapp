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

test('accepts a complete report from a simulated installed scanner', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bma-smoke-success-'));
  try {
    const entry = join(dir, 'fake.mjs');
    const program = [
      "import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';",
      "const args=process.argv.slice(2);const url=args[args.indexOf('scan')+1];",
      "if(!(await fetch(url)).ok || !(await fetch(url+'details')).ok)process.exit(2);",
      "const out=args[args.indexOf('-o')+1];await mkdir(join(out,'repros'),{recursive:true});",
      "await writeFile(join(out,'repros','abc.test.mjs'),'// demo');",
      "await writeFile(join(out,'index.html'),'Findings: Download reproducer');",
      "await writeFile(join(out,'report.json'),JSON.stringify({schemaVersion:1,pagesScanned:[url,url+'details'],findings:[",
      "...['layout.horizontal-overflow','runtime.uncaught-error','resources.http-error','a11y.button-name'].map(ruleId=>({ruleId,evidence:{repro:'repros/abc.test.mjs'}}))]}));"
    ].join('\n');
    await writeFile(entry, program);
    const result = await smokeInstalledScanner({entry,cwd:dir});
    assert.equal(result.pages,2);
    assert.equal(result.findings,4);
  } finally {await rm(dir,{recursive:true,force:true});}
});
