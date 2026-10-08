import assert from 'node:assert/strict';
import test from 'node:test';
import { isSupportedNode, parseNodeVersion, inspectEnvironment } from './doctor.mjs';

test('reads semantic Node versions correctly', () => {
  assert.deepEqual(parseNodeVersion('v22.12.0'), {major:22,minor:12,patch:0});
  assert.equal(parseNodeVersion('broken'), null);
});
test('rejects unsupported Node versions', () => {
  assert.equal(isSupportedNode('20.19.0'), false);
  assert.equal(isSupportedNode('22.11.9'), false);
  assert.equal(isSupportedNode('22.12.0'), true);
  assert.equal(isSupportedNode('23.0.0'), true);
});
test('reports missing modules and a missing browser separately', async () => {
  const result = await inspectEnvironment({version:'22.16.0',resolveModule:()=>{throw Error('not found')},fileExists:async()=>false,
    executablePath:'/path/to/nonexistent-chromium'});
  assert.equal(result.ready,false);
  assert.equal(result.checks.find(c=>c.id==='chromium').pass,false);
  assert.equal(result.checks.find(c=>c.id==='package:sharp').pass,false);
});
test('passes a fully installed and built environment',async()=>{
  const result=await inspectEnvironment({version:'22.16.0',resolveModule:()=>'/fake/path',fileExists:async()=>true,
    executablePath:'/fake/browser'});
  assert.equal(result.ready,true);
  assert.ok(result.checks.every(c=>c.pass));
});
test('surfaces an actionable fix for every missing dependency',async()=>{
  const result=await inspectEnvironment({version:'20.0.0',resolveModule:()=>undefined,fileExists:async()=>false,
    executablePath:'/fake/browser'});
  assert.ok(result.checks.every(c=>!c.pass ? c.fix : true));
});
