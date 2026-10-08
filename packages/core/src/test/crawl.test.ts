import assert from 'node:assert/strict';
import test from 'node:test';
import { eligiblePageUrl, PageQueue } from '../crawl.js';

const root = 'http://localhost:3000/docs/';

test('resolves relative pages and strips fragments', () => {
  assert.equal(eligiblePageUrl('../about#details', root), 'http://localhost:3000/about');
});
test('rejects cross-origin and unsupported schemes', () => {
  for (const url of ['https://example.com/', '//evil.com/', 'mailto:hi@me.com',
    'javascript:alert(1)', 'https://localhost:3000/docs']) {
    assert.equal(eligiblePageUrl(url, root), null, url);
  }
});
test('avoids sensitive paths, assets, and URLs with query parameters', () => {
  for (const url of ['/logout', '/user/delete/123', '/checkout',
    '/admin/settings', '/file.pdf', '/x.png', '/x.js', '/api?token=abc']) {
    assert.equal(eligiblePageUrl(url, root), null, url);
  }
});
test('deduplicates, bounds, and preserves discovery order', () => {
  const queue = new PageQueue(root, 3);
  assert.equal(queue.offerMany(['/a', '/a#section', '/b', '/c']), 2);
  assert.deepEqual([queue.next(), queue.next(), queue.next(), queue.next()], [
    'http://localhost:3000/docs/', 'http://localhost:3000/a',
    'http://localhost:3000/b', undefined
  ]);
});
test('rejects invalid candidates and excessive scan size', () => {
  assert.equal(eligiblePageUrl('http://%/', root), null);
  assert.throws(() => new PageQueue(root, 26), /between 1 and 25/);
  assert.throws(() => new PageQueue(root, 0), /between 1 and 25/);
});
test('rejects credentials and private query strings', () => {
  for (const url of ['/docs?a=1', 'http://bob:secret@localhost:3000/foo']) {
    assert.equal(eligiblePageUrl(url, root), null);
  }
});
