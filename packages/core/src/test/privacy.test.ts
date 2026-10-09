import assert from 'node:assert/strict';
import test from 'node:test';
import { publicUrl, safeDiagnosticMessage, safeNetworkFailure } from '../privacy.js';

test('redacts URL query tokens, fragments and embedded credentials', () => {
  assert.equal(publicUrl('https://user:pass@example.test/path?token=private#secret'),
    'https://example.test/path');
  assert.equal(publicUrl('file:///etc/passwd'), '[unsupported URL]');
  assert.equal(publicUrl('unparseable'), '[invalid URL]');
});
test('redacts URLs embedded inside errors without destroying context', () => {
  const message = 'Navigation failed at https://example.test/app?token=private#secret, code ERR_ABORTED';
  const safe = safeDiagnosticMessage(message);
  assert.match(safe, /Navigation failed at https:\/\/example\.test\/app/);
  assert.ok(!safe.includes('private'));
  assert.ok(!safe.includes('secret'));
  assert.match(safe, /ERR_ABORTED/);
});
test('obscures passwords from URLs in driver errors', () => {
  const safe = safeDiagnosticMessage(new Error('GET http://alice:hunter2@localhost:4173/login?key=abc failed'));
  assert.ok(!safe.includes('hunter2'));
  assert.ok(!safe.includes('alice'));
  assert.ok(!safe.includes('key=abc'));
});
test('normalizes potentially private network error detail to a code', () => {
  assert.equal(safeNetworkFailure('net::ERR_CONNECTION_REFUSED at https://site.test?token=abc'),
    'NET::ERR_CONNECTION_REFUSED');
  assert.equal(safeNetworkFailure('Proxy denied /private?key=abc'), 'network request failed');
});
test('bounds and normalizes diagnostic output', () => {
  assert.equal(safeDiagnosticMessage('a\nb\tc', 3), 'a b');
});
