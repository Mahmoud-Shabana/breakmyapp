import assert from 'node:assert/strict';
import test from 'node:test';
import { defineRule, runRulePlugins, validateRulePlugin } from '../plugins.js';

const context = {
  page: {} as Parameters<Parameters<typeof defineRule>[0]['check']>[0]['page'],
  viewport: { width: 390, height: 844 },
  url: 'http://localhost:3000/'
};

test('requires namespaced IDs and rule execution functions', () => {
  assert.throws(() => validateRulePlugin({ id: 'demo', description: 'x', check: () => [] }), /namespaced/);
  assert.throws(() => validateRulePlugin({ id: 'demo.ok', description: 'x' }), /check/);
});
test('converts a community rule result into a standard Finding', async () => {
  const plugin = defineRule({
    id: 'community.meta-description',
    description: 'Flags pages without a meta description.',
    check: () => [{ id: 'missing', title: 'Missing meta description',
      description: 'Add a concise summary.', severity: 'low' as const }]
  });
  const output = await runRulePlugins([plugin], context);
  assert.equal(output.length, 1);
  assert.equal(output[0].ruleId, 'plugin.community.meta-description.missing');
  assert.equal(output[0].confidence, 'needs-review');
});
test('plugin errors are observable without leaking exception details', async () => {
  const plugin = defineRule({ id: 'community.thrower', description: 'Test failure',
    check: () => { throw new Error('private token: abc123'); } });
  const output = await runRulePlugins([plugin], context);
  assert.match(output[0].ruleId, /execution-failed/);
  assert.ok(!JSON.stringify(output).includes('abc123'));
});
test('invalid returned rules cannot break the scan', async () => {
  const plugin = defineRule({ id: 'community.invalid', description: 'Bad result',
    check: () => [{ id: 'bad', title: 'x', description: 'y', severity: 'urgent' as 'high' }] });
  const output = await runRulePlugins([plugin], context);
  assert.match(output[0].ruleId, /execution-failed/);
});
test('untrusted excessive plugin collections are rejected', async () => {
  const plugin = defineRule({ id: 'community.valid', description: 'x', check: () => [] });
  await assert.rejects(runRulePlugins(Array(11).fill(plugin), context), /up to 10/);
});
