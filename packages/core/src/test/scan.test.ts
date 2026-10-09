import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scanSite } from '../scan.js';
import { writeReports } from '../report.js';
import { writeReproductionPacks } from '../repro.js';

test('rejects unsupported target protocols before launching a browser', async () => {
  await assert.rejects(
    scanSite({ url: 'file:///etc/passwd', outputDir: join(tmpdir(), 'unused-breakmyapp') }),
    /Only http/
  );
});

test('detects real overflow and page errors in Chromium', {
  skip: process.env.BREAKMYAPP_BROWSER_TESTS !== '1'
}, async () => {
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{margin:0}.box{width:1000px;height:200px;background:tomato}</style><link rel="stylesheet" href="/missing.css"></head>' +
    '<body><button></button><a href="/child">Child page</a><a href="/logout">Do not crawl logout</a><div class="box"></div><img src="/missing.png" alt="Missing fixture"><script>setTimeout(()=>{throw new Error("fixture crash")},20)</script></body></html>';
  let sawExplicitQuery = false;
  const server = createServer((req, res) => {
    if (req.url === '/?preview=true') sawExplicitQuery = true;
    if (req.url === '/child') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
        '<body><h1>Child</h1><script>throw new Error("child fixture")</script></body></html>');
      return;
    }
    if (req.url === '/missing.png' || req.url === '/missing.css') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Missing intentionally');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  const dir = await mkdtemp(join(tmpdir(), 'breakmyapp-test-'));
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const report = await scanSite({
      url: 'http://127.0.0.1:' + address.port,
      outputDir: dir,
      viewports: [{ width: 375, height: 812 }],
      maxPages: 2,
      accessibility: true,
      trace: true,
      plugins: [{
        id: 'community.test-rule',
        description: 'Records a plugin finding',
        check: async () => [{ id: 'observed', title: 'Fixture observation',
          description: 'Test plugin ran in the browser.', severity: 'low' as const }]
      }]
    });
    const overflow = report.findings.find(f => f.ruleId === 'layout.horizontal-overflow');
    assert.ok(overflow);
    assert.equal(overflow.confidence, 'needs-review');
    assert.ok(overflow.evidence?.candidates?.length);
    assert.equal(report.pagesScanned?.length, 2);
    assert.ok(report.pagesScanned?.[1].endsWith('/child'));
    assert.ok(!report.pagesScanned?.some(p => p.endsWith('/logout')));
    assert.ok(report.findings.some(f => f.ruleId === 'a11y.button-name'),
      'axe should detect a button without an accessible name');
    assert.ok(report.findings.some(f => f.ruleId === 'plugin.community.test-rule.observed'),
      'custom plugin should run against visited pages');
    assert.ok(report.findings.some(f => f.ruleId === 'runtime.uncaught-error'));
    assert.ok(report.findings.some(f => f.pageUrl?.endsWith('/child') &&
      f.description.includes('child fixture')));
    const screenshotPaths = [...new Set(report.findings.flatMap(f =>
      f.evidence?.screenshot ? [f.evidence.screenshot] : []))];
    assert.ok(screenshotPaths.length >= 2, 'different pages keep distinct screenshots');
    assert.ok(report.findings.some(f => f.ruleId === 'resources.http-error' &&
      f.description.includes('/missing.png')));
    assert.ok(report.findings.some(f => f.ruleId === 'resources.http-error' &&
      f.description.includes('/missing.css')));
    const generated = await writeReproductionPacks(report, dir);
    assert.ok(generated >= 2, 'expected generated reproduction tests');
    const traced = report.findings.find(f => f.evidence?.trace);
    assert.ok(traced, 'expected trace evidence for a finding');
    const zip = await readFile(join(dir, traced.evidence!.trace!));
    assert.equal(zip.subarray(0, 2).toString(), 'PK', 'trace should be a ZIP');
    const repro = report.findings.find(f => f.evidence?.repro);
    assert.ok(repro);
    assert.match(await readFile(join(dir, repro.evidence!.repro!), 'utf8'), /chromium\.launch/);
    await writeReports(report, dir);
    const raw = await readFile(join(dir, 'report.json'), 'utf8');
    assert.equal(JSON.parse(raw).schemaVersion, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('single-page scan uses query params for navigation but redacts browser errors and reports', {
  skip: process.env.BREAKMYAPP_BROWSER_TESTS !== '1'
}, async () => {
  let sawQuery = false;
  const server = createServer((req, res) => {
    if (req.url === '/?preview=yes&access_token=private-token') sawQuery = true;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><body><h1>Query fixture</h1>' +
      '<script>setTimeout(()=>{throw new Error("Page URL: " + location.href)},30)</script></body></html>');
  });
  const dir = await mkdtemp(join(tmpdir(), 'breakmyapp-query-'));
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const report = await scanSite({
      url: 'http://127.0.0.1:' + addr.port + '/?preview=yes&access_token=private-token',
      outputDir: dir,
      viewports: [{ width: 375, height: 812 }]
    });
    assert.equal(sawQuery, true);
    assert.ok(!report.target.includes('private-token'));
    assert.ok(!report.pagesScanned?.[0].includes('private-token'));
    assert.ok(report.findings.some(f => f.ruleId === 'runtime.uncaught-error'),
      'the URL-bearing error should still be detected');
    assert.ok(!JSON.stringify(report).includes('private-token'),
      'the query token must never appear in serialized findings');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});


test('real browser visual baseline detects a deliberate theme regression', {
  skip: process.env.BREAKMYAPP_BROWSER_TESTS !== '1'
}, async () => {
  const server = createServer((req, res) => {
    const changed = (req.url ?? '').includes('variant=after');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{margin:0;background:' + (changed ? '#ff2244' : '#112233') +
      ';color:white;font:16px system-ui}main{height:400px}</style></head>' +
      '<body><main><h1>Stable content</h1></main></body></html>');
  });
  const dir = await mkdtemp(join(tmpdir(), 'bma-visual-browser-'));
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const url = 'http://127.0.0.1:' + addr.port + '/';
    const baselineDir = join(dir, 'baselines');
    const opts = {
      outputDir: join(dir, 'report'), viewports: [{width:375,height:812}],
      visualBaselineDir: baselineDir
    };
    const baseline = await scanSite({...opts, url: url + '?variant=before', visualMode:'save'});
    assert.equal(baseline.visualComparisons?.[0].status, 'saved');
    const changed = await scanSite({...opts, url: url + '?variant=after', visualMode:'compare'});
    assert.equal(changed.visualComparisons?.[0].status, 'changed');
    assert.ok((changed.visualComparisons?.[0].mismatchRatio ?? 0) > .01);
    assert.ok(changed.findings.some(f => f.ruleId === 'visual.pixel-change'));
    const diffPath = changed.visualComparisons?.[0].diff;
    assert.ok(diffPath);
    const png = await readFile(join(dir, 'report', diffPath));
    assert.equal(png.subarray(0, 4).toString('hex'), '89504e47');
    await writeReports(changed, opts.outputDir);
    const html = await readFile(join(opts.outputDir, 'index.html'), 'utf8');
    assert.match(html, /Visual regression/);
    assert.match(html, /Diff \(highlighted pixels\)/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive:true, force:true });
  }
});
