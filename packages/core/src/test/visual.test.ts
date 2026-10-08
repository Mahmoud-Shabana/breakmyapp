import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { visualFilename, comparePngBuffers, checkVisualScreenshot } from '../visual.js';

const viewport = {width:375,height:812};
async function generate(width: number,height: number,pixelsChanged=0): Promise<Buffer> {
  const raw = Buffer.alloc(width*height*4,255);
  for(let i=0;i<pixelsChanged;i++){
    raw[i*4]=20;raw[i*4+1]=50;raw[i*4+2]=150;
  }
  return sharp(raw,{raw:{width,height,channels:4}}).png().toBuffer();
}
test('baseline filenames are stable and redact query strings',()=>{
  assert.equal(visualFilename('http://localhost:3000/?variant=old#x',viewport),
    visualFilename('http://localhost:3000/?variant=new',viewport));
  assert.match(visualFilename('http://localhost:3000',viewport),/^[a-f0-9]{12}-375x812\.png$/);
});
test('identical screenshots produce no changed pixels',async()=>{
  const png=await generate(10,10);
  const r=await comparePngBuffers(png,png);
  assert.equal(r.mismatchRatio,0);
  assert.equal(r.mismatchPixels,0);
  assert.equal((await sharp(r.diffPng).metadata()).width,10);
});
test('pixel difference ratios are measured exactly',async()=>{
  const r=await comparePngBuffers(await generate(10,10),await generate(10,10,25));
  assert.equal(r.mismatchPixels,25);
  assert.equal(r.mismatchRatio,.25);
});
test('different image dimensions are reported explicitly',async()=>{
  const r=await comparePngBuffers(await generate(12,9),await generate(10,10));
  assert.equal(r.dimensionsChanged,true);
  assert.equal(r.diffPng,undefined);
});
test('saving and comparing a baseline writes a highlighted diff image',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bma-visual-'));
  const opts={pageUrl:'http://localhost:4173/?variant=old',viewport,
    mode:'save' as const,baselineDir:join(dir,'base'),outputDir:join(dir,'report'),threshold:.01};
  try {
    const a=await generate(10,10),b=await generate(10,10,8);
    assert.equal((await checkVisualScreenshot(a,opts)).status,'saved');
    assert.equal((await checkVisualScreenshot(a,{...opts,mode:'compare'})).status,'passed');
    const changed=await checkVisualScreenshot(b,{...opts,pageUrl:'http://localhost:4173/?variant=new',mode:'compare'});
    assert.equal(changed.status,'changed');
    assert.equal(changed.mismatchPixels,8);
    assert.ok(changed.diff);
    const png=await readFile(join(opts.outputDir,changed.diff));
    assert.equal((await sharp(png).metadata()).width,10);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('missing baselines are distinct from regressions',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bma-visual-'));
  try {
    const result=await checkVisualScreenshot(await generate(10,10),{
      pageUrl:'http://localhost',viewport,mode:'compare',
      baselineDir:join(dir,'base'),outputDir:join(dir,'report'),threshold:.01
    });
    assert.equal(result.status,'missing-baseline');
    assert.equal(result.diff,undefined);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('changes below the chosen threshold do not produce diff files',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bma-visual-'));
  const opts={pageUrl:'http://localhost/',viewport,baselineDir:join(dir,'baseline'),
    outputDir:join(dir,'report'),threshold:.10};
  try {
    await checkVisualScreenshot(await generate(10,10),{...opts,mode:'save'});
    const result=await checkVisualScreenshot(await generate(10,10,5),{...opts,mode:'compare'});
    assert.equal(result.status,'passed');
    assert.equal(result.diff,undefined);
  } finally {await rm(dir,{recursive:true,force:true});}
});
