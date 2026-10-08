import type { Finding, Viewport } from './types.js';

/** Minimal public data contract so the axe normalization can be tested without a browser. */
export interface AxeNode {
  target: Array<string | string[]>;
  failureSummary?: string;
}
export interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl?: string;
  nodes: AxeNode[];
}

export function axeSeverity(impact?: string | null): Finding['severity'] {
  if (impact === 'critical' || impact === 'serious') return 'high';
  if (impact === 'moderate') return 'medium';
  return 'low';
}

export function axeSelector(target: AxeNode['target']): string {
  return target.map(segment => Array.isArray(segment) ? segment.join(' >> ') : segment)
    .join(' >> ').slice(0, 400);
}

/**
 * Return one Finding per affected node to make diagnostics actionable.
 * Cap all results to avoid accidentally producing massive JSON reports.
 */
export function normalizeAxeViolations(
  violations: readonly AxeViolation[],
  viewport: Viewport,
  limit = 80
): Array<Omit<Finding, 'id'>> {
  const findings: Array<Omit<Finding, 'id'>> = [];
  for (const violation of violations.slice(0, 100)) {
    if (!violation?.id || !Array.isArray(violation.nodes)) continue;
    for (const node of violation.nodes.slice(0, 15)) {
      const selector = axeSelector(node.target ?? []);
      findings.push({
        ruleId: 'a11y.' + violation.id.slice(0, 100),
        category: 'accessibility',
        severity: axeSeverity(violation.impact),
        confidence: 'confirmed',
        title: ('Accessibility: ' + (violation.help || violation.id)).slice(0, 220),
        description: ('Automated axe-core rule violation (' + (violation.impact ?? 'unknown') +
          '). Review the affected element and verify the suggested remediation.').slice(0, 500),
        viewport,
        selector,
        evidence: {
          detail: (node.failureSummary || 'Element failed the axe-core accessibility rule.').slice(0, 1200),
          impact: (violation.impact ?? 'unknown').slice(0, 30),
          helpUrl: sanitizeAxeHelpUrl(violation.helpUrl)
        }
      });
      if (findings.length >= limit) return findings;
    }
  }
  return findings;
}

function sanitizeAxeHelpUrl(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && (url.hostname === 'dequeuniversity.com' ||
        url.hostname.endsWith('.dequeuniversity.com'))) {
      url.username = '';
      url.password = '';
      return url.href;
    }
  } catch { /* ignore untrusted URL */ }
  return undefined;
}
