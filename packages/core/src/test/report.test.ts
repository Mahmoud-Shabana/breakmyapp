import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, renderHtmlReport } from '../report.js';
import type { ScanResult } from '../types.js';

const example: ScanResult = {
  schemaVersion: 1,
  toolVersion: '0.1.0',
  target: 'http://example.test/<unsafe>',
  browser: 'chromium',
  startedAt: '2026-10-08T00:00:00.000Z',
  finishedAt: '2026-10-08T00:00:01.000Z',
  viewports: [{ width: 375, height: 812 }],
  findings: [{
    id: 'example-id',
    ruleId: 'runtime.uncaught-error',
    category: 'runtime',
    severity: 'high',
    confidence: 'confirmed',
    title: '<script>alert(1)</script>',
    description: 'Injected <img src=x onerror=alert(1)>',
    viewport: { width: 375, height: 812 },
    selector: '#app',
    evidence: { detail: 'Captured via pageerror.' }
  }]
};

test('escapeHtml escapes markup and quotes', () => {
  assert.equal(escapeHtml('<p a="x">& ' + "'"), '&lt;p a=&quot;x&quot;&gt;&amp; &#39;');
});

test('HTML reporter escapes untrusted target and error messages', () => {
  const html = renderHtmlReport(example);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.match(html, /Finding[s]? \(1\)/);
});

test('empty findings report is explicit about its limits', () => {
  const html = renderHtmlReport({ ...example, findings: [] });
  assert.match(html, /not a guarantee/i);
});

test('reporter ignores screenshot URLs outside the generated evidence directory', () => {
  const modified: ScanResult = {
    ...example,
    findings: [{
      ...example.findings[0],
      evidence: { screenshot: 'javascript:alert(1)' }
    }]
  };
  const html = renderHtmlReport(modified);
  assert.ok(!html.includes('javascript:alert(1)'));
});

test('overflow candidates are rendered and escaped', () => {
  const html = renderHtmlReport({
    ...example,
    findings: [{
      ...example.findings[0],
      evidence: {
        candidates: [{ selector: '<img src=x onerror=alert(1)>', overflowPx: 42 }]
      }
    }]
  });
  assert.match(html, /Possible overflow elements/);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
});
