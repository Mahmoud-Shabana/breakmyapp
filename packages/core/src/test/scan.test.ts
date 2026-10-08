import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scanSite } from '../scan.js';
import { writeReports } from '../report.js';

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
    '<style>body{margin:0}.box{width:1000px;height:200px;background:tomato}</style></head>' +
    '<body><div class="box"></div><img src="/missing.png" alt="Missing fixture"><script>setTimeout(()=>{throw new Error("fixture crash")},20)</script></body></html>';
  const server = createServer((req, res) => {
    if (req.url === '/missing.png') {
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
      viewports: [{ width: 375, height: 812 }]
    });
    assert.ok(report.findings.some(f => f.ruleId === 'layout.horizontal-overflow'));
    assert.ok(report.findings.some(f => f.ruleId === 'runtime.uncaught-error'));
    assert.ok(report.findings.some(f => f.ruleId === 'resources.http-error' &&
      f.description.includes('/missing.png')));
    await writeReports(report, dir);
    const raw = await readFile(join(dir, 'report.json'), 'utf8');
    assert.equal(JSON.parse(raw).schemaVersion, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
