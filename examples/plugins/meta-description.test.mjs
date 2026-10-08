import assert from 'node:assert/strict';
import test from 'node:test';
import plugin from './meta-description.mjs';

function fakePage(value, present = true) {
  return {
    locator: (selector) => {
      assert.equal(selector, 'meta[name="description"]');
      return { first: () => ({
        count: async () => present ? 1 : 0,
        getAttribute: async () => {
          if (!present) throw Error('getAttribute should not be called on missing elements');
          return value;
        }
      }) };
    }
  };
}

test('missing meta description produces a finding immediately', async () => {
  const items = await plugin.check({ page: fakePage(null, false) });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'missing');
  assert.equal(items[0].confidence, 'confirmed');
});

test('blank description produces a finding', async () => {
  assert.equal((await plugin.check({ page: fakePage('  ') })).length, 1);
});

test('populated description yields no finding', async () => {
  assert.deepEqual(await plugin.check({ page: fakePage('A useful summary.') }), []);
});
