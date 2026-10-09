import assert from 'node:assert/strict';
import test from 'node:test';
import {
  redactedResourceUrl,
  problemFromHttpResponse,
  problemFromNetworkFailure,
  dedupeResourceProblems
} from '../resources.js';

test('does not report successful requests, documents, or canceled requests', () => {
  assert.equal(problemFromHttpResponse('https://example.test/image.png', 'image', 200), null);
  assert.equal(problemFromHttpResponse('https://example.test/', 'document', 404), null);
  assert.equal(problemFromNetworkFailure('https://example.test/app.js', 'script', 'net::ERR_ABORTED'), null);
});

test('captures missing static resources without persisting private query parameters', () => {
  const image = problemFromHttpResponse('https://user:pass@example.test/missing.png?secret=token#frag', 'image', 404);
  assert.deepEqual(image, {
    kind: 'http-error', resourceType: 'image', address: 'https://example.test/missing.png', reason: 'HTTP 404'
  });
});

test('captures genuine network failure, but rejects unsupported schemes', () => {
  assert.deepEqual(problemFromNetworkFailure('https://example.test/app.js', 'script', 'net::ERR_NAME_NOT_RESOLVED'), {
    kind: 'network-error', resourceType: 'script', address: 'https://example.test/app.js', reason: 'net::ERR_NAME_NOT_RESOLVED'
  });
  assert.equal(redactedResourceUrl('data:text/html,bad'), null);
});

test('deduplicates repeated resource errors', () => {
  const problem = problemFromHttpResponse('https://example.test/error.css', 'stylesheet', 500)!;
  assert.equal(dedupeResourceProblems([problem, problem, problem]).length, 1);
});

test('network failure diagnostics never echo secrets or arbitrary driver text', () => {
  const problem = problemFromNetworkFailure(
    'https://example.test/app.js?auth=hidden-token',
    'script',
    'proxy failure on https://example.test/x?apiKey=private-value'
  );
  assert.equal(problem?.reason, 'network request failed');
  assert.ok(!JSON.stringify(problem).includes('private-value'));
  assert.ok(!JSON.stringify(problem).includes('hidden-token'));
});
