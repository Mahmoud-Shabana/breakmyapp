import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function runCli(entry, cwd, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const capture = (data, stream) => { const text = String(data); if (stream === 'out') stdout = (stdout + text).slice(-8192); else stderr = (stderr + text).slice(-8192); };
    child.stdout.on('data', data => capture(data, 'out'));
    child.stderr.on('data', data => capture(data, 'err'));
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(Error('Installed scanner exited ' + code + ': ' + stderr.slice(-1500) + stdout.slice(-1000)));
      else resolve({ stdout, stderr });
    });
  });
}

/** Exercise the *installed* CLI on an explicitly local, temporary, deterministic site. */
export async function smokeInstalledScanner({ entry, cwd, withAccessibility = true } = {}) {
  if (!entry || !cwd) throw Error('Installed entry and consumer cwd are required.');
  const page = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{margin:0}.wide{width:1200px;height:90px}</style><link rel="stylesheet" href="/missing.css"></head>' +
    '<body><button></button><div class="wide">Wide component</div><img src="/missing.png" alt="Fixture">' +
    '<a href="/details">Visit details</a><script>setTimeout(()=>{throw Error("bma fixture crash")},30)</script></body></html>';
  const server = createServer((req, res) => {
    if (req.url === '/details') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Details</h1></body></html>');
    } else if (req.url === '/missing.png' || req.url === '/missing.css') {
      res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Missing fixture');
    } else {
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(page);
    }
  });
  const temp = await mkdtemp(join(tmpdir(), 'bma-packaged-browser-'));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Fixture server did not bind');
    const url = 'http://127.0.0.1:' + address.port + '/';
    const output = join(temp, 'report');
    await runCli(entry, cwd, ['scan', url, '-o', output, '--viewport', '375x812', '--max-pages', '2',
      '--repro', ...(withAccessibility ? ['--a11y'] : [])]);
    const result = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
    if (result.schemaVersion !== 1 || !Array.isArray(result.findings)) throw Error('Invalid scanner report schema');
    const visited = result.pagesScanned ?? [];
    if (visited.length !== 2 || !visited[1].endsWith('/details')) throw Error('Installed scanner failed to crawl fixture second page');
    const rules = new Set(result.findings.map(f => f.ruleId));
    for (const rule of ['layout.horizontal-overflow', 'runtime.uncaught-error', 'resources.http-error']) {
      if (!rules.has(rule)) throw Error('Installed scanner missed expected rule: ' + rule);
    }
    if (withAccessibility && !rules.has('a11y.button-name')) throw Error('Installed scanner failed accessibility check');
    if (!result.findings.some(f => f.evidence?.repro)) throw Error('Installed scanner did not generate reproduction files');
    const html = await readFile(join(output, 'index.html'), 'utf8');
    if (!html.includes('Findings') || !html.includes('Download reproducer')) throw Error('Installed scanner report is incomplete');
    const repro = result.findings.find(f => f.evidence?.repro).evidence.repro;
    await access(join(output, repro));
    return { pages: visited.length, findings: result.findings.length, rules: [...rules].sort() };
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
}
