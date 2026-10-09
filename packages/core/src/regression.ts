import type { Finding, ScanResult, Severity } from './types.js';

export type RegressionThreshold = Severity | 'any';

export interface RegressionReport {
  schemaVersion: 1;
  baselineTarget: string;
  currentTarget: string;
  generatedAt: string;
  counts: { new: number; existing: number; resolved: number };
  newFindings: Finding[];
  resolvedFindings: Finding[];
}

/** This intentionally follows the same page + rule + viewport identity as Studio. */
export function findingIdentity(finding: Finding, fallbackTarget: string): string {
  let detail = finding.selector ?? '';
  if (!detail && finding.ruleId.startsWith('resources.')) {
    // A 404 changing to a 500 is still the same broken resource.
    detail = finding.description.replace(/\s*\((?:HTTP \d{3}|(?:net::)?ERR_[A-Z0-9_]+|network request failed)\)\s*$/i, '');
  }
  if (!detail && finding.ruleId.startsWith('runtime.')) detail = finding.description;
  return JSON.stringify([
    finding.pageUrl ?? fallbackTarget, finding.ruleId,
    finding.viewport.width, finding.viewport.height, detail
  ]);
}

export function compareScanReports(current: ScanResult, baseline: ScanResult): RegressionReport {
  if (current?.schemaVersion !== 1 || baseline?.schemaVersion !== 1 ||
      !Array.isArray(current.findings) || !Array.isArray(baseline.findings)) {
    throw new Error('Expected compatible BreakMyApp report.json documents with schemaVersion 1.');
  }
  if (current.target !== baseline.target) {
    throw new Error('Current and baseline targets differ. Compare reports of the same site URL.');
  }
  if (current.findings.length > 100000 || baseline.findings.length > 100000) {
    throw new Error('Report has too many findings to compare safely.');
  }
  const old = new Map<string, Finding[]>();
  for (const finding of baseline.findings) {
    const id = findingIdentity(finding, baseline.target);
    const group = old.get(id) ?? [];
    group.push(finding);
    old.set(id, group);
  }
  const newFindings: Finding[] = [];
  let existing = 0;
  for (const finding of current.findings) {
    const oldGroup = old.get(findingIdentity(finding, current.target));
    if (oldGroup?.length) {
      oldGroup.pop();
      existing++;
    } else newFindings.push(finding);
  }
  const resolvedFindings = [...old.values()].flat();
  return {
    schemaVersion: 1,
    baselineTarget: baseline.target,
    currentTarget: current.target,
    generatedAt: new Date().toISOString(),
    counts: { new: newFindings.length, existing, resolved: resolvedFindings.length },
    newFindings, resolvedFindings
  };
}

export function shouldFailOnNew(findings: readonly Finding[], threshold?: RegressionThreshold): boolean {
  if (!threshold) return false;
  if (threshold === 'any') return findings.length > 0;
  if (threshold === 'high') return findings.some(f => f.severity === 'high');
  if (threshold === 'medium') return findings.some(f => f.severity === 'high' || f.severity === 'medium');
  if (threshold === 'low') return findings.length > 0;
  return false;
}
