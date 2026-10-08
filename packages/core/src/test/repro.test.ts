import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateReproScript, planReproduction, safeReproUrl, writeReproductionPacks } from '../repro.js';
import type { Finding, ScanResult } from '../types.js';

const finding = (ruleId: string, description: string, id = '1234567890abcdef'): Finding => ({
  id, ruleId, description,
  category: 'runtime', severity: 'medium', confidence: 'needs-review',
  title: 'Observed finding', pageUrl: 'http://localhost:4173/pricing?token=hidden',
  viewport: { width: 375, height: 812 }, evidence: {}
});

test('redacts secrets and rejects unsupported protocols and credentials', () => {
  assert.equal(safeReproUrl('https://example.test/p?secret=hidden#part'), 'https://example.test/p');
  assert.equal(safeReproUrl('file:///etc/passwd'), null);
  assert.equal(safeReproUrl('http://user:secret@example.test'), null);
});

test('generates safe JavaScript for observable overflow', () => {
  const plan = planReproduction(finding('layout.horizontal-overflow', '42px overflow'), 'http://localhost');
  assert.ok(plan);
  assert.equal(plan.kind, 'overflow');
  const js = generateReproScript(plan);
  assert.match(js, /scrollWidth/);
  assert.ok(!js.includes('token=hidden'));
  assert.match(js, /isNavigationRequest/);
});

test('serializes hostile error text without interpreting it as code', () => {
  const payload = "bad'); process.exit(10); //";
  const plan = planReproduction(finding('runtime.uncaught-error', payload), 'http://localhost');
  assert.ok(plan);
  const js = generateReproScript(plan);
  assert.ok(js.includes(JSON.stringify(payload)));
  assert.ok(!js.includes('token=hidden'));
});

test('reproduces main-document HTTP status', () => {
  const plan = planReproduction(
    finding('navigation.http-error', 'The main document returned HTTP 500.'), 'http://localhost'
  );
  assert.ok(plan);
  assert.equal(plan.expected, 500);
  assert.match(generateReproScript(plan), /response\?\.status\(\)/);
});

test('reproduces static resource HTTP status', () => {
  const plan = planReproduction(
    finding('resources.http-error', 'image at https://example.test/missing.png (HTTP 404)'),
    'http://localhost'
  );
  assert.ok(plan);
  assert.equal(plan.expected, 404);
  assert.equal(plan.resourceUrl, 'https://example.test/missing.png');
});

test('supports axe violations but not unreliable plugin or network checks', () => {
  assert.equal(planReproduction(finding('a11y.image-alt', 'Missing alt'), 'http://localhost')?.kind, 'accessibility');
  assert.equal(planReproduction(finding('plugin.community.demo.check', 'Custom'), 'http://localhost'), null);
  assert.equal(planReproduction(finding('resources.network-error', 'Failure'), 'http://localhost'), null);
});

test('writes opt-in reproduction files and report references', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bma-repro-'));
  try {
    const report = {
      target: 'http://localhost:4173', findings: [
        finding('layout.horizontal-overflow', 'Overflow'),
        finding('runtime.uncaught-error', 'Crash', 'abcdef0123456789')
      ]
    } as ScanResult;
    assert.equal(await writeReproductionPacks(report, dir), 2);
    assert.equal((await readdir(join(dir, 'repros'))).length, 2);
    assert.ok(report.findings[0].evidence?.repro);
    const script = await readFile(join(dir, report.findings[0].evidence!.repro!), 'utf8');
    assert.match(script, /chromium\.launch/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('does not write unsupported findings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bma-skip-'));
  try {
    const report = { target: 'http://localhost:4173', findings: [
      finding('plugin.community.custom.observation', 'No deterministic script')
    ] } as ScanResult;
    assert.equal(await writeReproductionPacks(report, dir), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
