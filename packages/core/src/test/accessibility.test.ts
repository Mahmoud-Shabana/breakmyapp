import assert from 'node:assert/strict';
import test from 'node:test';
import { axeSelector, axeSeverity, normalizeAxeViolations } from '../accessibility.js';

const viewport = { width: 390, height: 844 };
test('axe impact levels map to finite severity values', () => {
  assert.equal(axeSeverity('critical'), 'high');
  assert.equal(axeSeverity('serious'), 'high');
  assert.equal(axeSeverity('moderate'), 'medium');
  assert.equal(axeSeverity('minor'), 'low');
  assert.equal(axeSeverity(null), 'low');
});
test('nested frame selectors are readable', () => {
  assert.equal(axeSelector(['#iframe', ['.nested', '#button']]), '#iframe >> .nested >> #button');
});
test('creates an actionable finding for every affected node', () => {
  const results = normalizeAxeViolations([{
    id: 'image-alt', impact: 'critical', help: 'Images must have alternate text',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.13/image-alt',
    nodes: [
      { target: ['img.hero'], failureSummary: 'Fix any of the following: add alt' },
      { target: ['img.card'] }
    ]
  }], viewport);
  assert.equal(results.length, 2);
  assert.deepEqual(results.map(f => f.selector), ['img.hero', 'img.card']);
  assert.ok(results.every(f => f.ruleId === 'a11y.image-alt' && f.category === 'accessibility'));
  assert.equal(results[0].evidence?.impact, 'critical');
  assert.match(results[0].evidence?.helpUrl ?? '', /^https:\/\/dequeuniversity\.com/);
});
test('untrusted documentation links are not emitted', () => {
  const results = normalizeAxeViolations([{
    id: 'x', help: 'test', helpUrl: 'javascript:alert(1)', nodes: [{ target: ['img'] }]
  }], viewport);
  assert.equal(results[0].evidence?.helpUrl, undefined);
});
test('caps large violation reports at a predictable bound', () => {
  const findings = normalizeAxeViolations(Array.from({ length: 30 }, (_, index) => ({
    id: 'rule-' + index, help: 'Large rule', nodes: Array.from({ length: 15 }, () => ({ target: ['img'] }))
  })), viewport, 9);
  assert.equal(findings.length, 9);
});
