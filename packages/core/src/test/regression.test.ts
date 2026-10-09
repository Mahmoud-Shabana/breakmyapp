import assert from 'node:assert/strict';
import test from 'node:test';
import { compareScanReports, findingIdentity, shouldFailOnNew } from '../regression.js';
import type { Finding, ScanResult } from '../types.js';

const target = 'http://localhost:4173/';
const finding = (ruleId: string, description: string, pageUrl = target, severity: Finding['severity'] = 'medium'): Finding => ({
  id: 'fixture', ruleId, category: 'layout', severity, confidence: 'needs-review',
  title: ruleId, description, viewport: { width: 375, height: 812 }, pageUrl
});
const report = (findings: Finding[], destination = target): ScanResult => ({
  schemaVersion: 1, toolVersion: '0.1.0', target: destination,
  browser:'chromium', startedAt:'2026-10-09T00:00:00Z', finishedAt:'2026-10-09T00:00:01Z',
  viewports:[{width:375,height:812}], findings
});

test('identifies new, existing and resolved findings without losing source data', () => {
  const a = finding('layout.horizontal-overflow','42 px wide');
  const b = finding('a11y.image-alt','Missing alt','http://localhost:4173/about');
  const c = finding('runtime.uncaught-error','Boom');
  const comparison = compareScanReports(report([a,c]), report([a,b]));
  assert.deepEqual(comparison.counts, {new:1,existing:1,resolved:1});
  assert.equal(comparison.newFindings[0].ruleId, 'runtime.uncaught-error');
  assert.equal(comparison.resolvedFindings[0].ruleId, 'a11y.image-alt');
});
test('matches duplicate findings one to one', () => {
  const f = finding('layout.horizontal-overflow','wide');
  assert.deepEqual(compareScanReports(report([f,f]),report([f])).counts,{new:1,existing:1,resolved:0});
});
test('the same issue on another page counts as new', () => {
  const a = finding('layout.horizontal-overflow','wide');
  const b = {...a,pageUrl:'http://localhost:4173/other'};
  assert.notEqual(findingIdentity(a,target),findingIdentity(b,target));
  assert.deepEqual(compareScanReports(report([b]),report([a])).counts,{new:1,existing:0,resolved:1});
});
test('visual ratio changes do not create false-new findings', () => {
  const old = finding('visual.pixel-change','12.1% of pixels differ');
  const newer = finding('visual.pixel-change','13.4% of pixels differ');
  assert.deepEqual(compareScanReports(report([newer]),report([old])).counts,{new:0,existing:1,resolved:0});
});
test('resource HTTP status changes retain the same identity', () => {
  const old = finding('resources.http-error','image at https://site.test/a.png (HTTP 404)');
  const newer = finding('resources.http-error','image at https://site.test/a.png (HTTP 500)');
  assert.deepEqual(compareScanReports(report([newer]),report([old])).counts,{new:0,existing:1,resolved:0});
});
test('rejects reports with unrelated target addresses', () => {
  assert.throws(() => compareScanReports(report([]),report([],'https://other.test/')), /targets differ/);
});
test('CI threshold gates only newly introduced findings', () => {
  const low = finding('a11y.image-alt','Missing alt',target,'low');
  const high = finding('runtime.uncaught-error','Boom',target,'high');
  assert.equal(shouldFailOnNew([], 'any'),false);
  assert.equal(shouldFailOnNew([low],'high'),false);
  assert.equal(shouldFailOnNew([low],'medium'),false);
  assert.equal(shouldFailOnNew([high],'high'),true);
  assert.equal(shouldFailOnNew([low],'any'),true);
});
