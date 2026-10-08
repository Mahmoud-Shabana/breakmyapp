import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
  dedupeResourceProblems,
  problemFromHttpResponse,
  problemFromNetworkFailure,
  type ResourceProblem
} from './resources.js';
import {
  DEFAULT_VIEWPORTS,
  type Finding,
  type ScanOptions,
  type ScanResult,
  type Viewport
} from './types.js';

function fingerprint(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

function validateUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Please provide a valid absolute http:// or https:// URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http:// and https:// targets are supported.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs containing credentials are not supported.');
  }
  return parsed.href;
}

function assertViewport(viewport: Viewport): void {
  if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) ||
      viewport.width < 200 || viewport.width > 4096 ||
      viewport.height < 200 || viewport.height > 4096) {
    throw new Error('Viewport width and height must be integers from 200 to 4096.');
  }
}

function newFinding(finding: Omit<Finding, 'id'>): Finding {
  return {
    ...finding,
    id: fingerprint([
      finding.ruleId,
      String(finding.viewport.width),
      String(finding.viewport.height),
      finding.selector ?? '',
      finding.description
    ])
  };
}

interface OverflowProbe {
  overflowPx: number;
  candidates: Array<{ selector: string; rightPx: number }>;
}

async function detectOverflow(page: import('playwright').Page): Promise<OverflowProbe> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const width = window.innerWidth;
    const actualWidth = Math.max(doc.scrollWidth, document.body?.scrollWidth ?? 0);
    const overflowPx = Math.max(0, Math.round(actualWidth - width));
    if (overflowPx <= 2) {
      return { overflowPx: 0, candidates: [] };
    }

    function selectorFor(el: Element): string {
      if (el.id && typeof CSS !== 'undefined' && CSS.escape) {
        return '#' + CSS.escape(el.id);
      }
      const parts: string[] = [];
      let current: Element | null = el;
      for (let depth = 0; current && depth < 5; depth++) {
        const tag = current.tagName.toLowerCase();
        const siblings = current.parentElement
          ? Array.from(current.parentElement.children).filter(s => s.tagName === current!.tagName)
          : [];
        const index = siblings.indexOf(current) + 1;
        parts.unshift(tag + (siblings.length > 1 ? ':nth-of-type(' + index + ')' : ''));
        current = current.parentElement;
      }
      return parts.join(' > ');
    }

    const candidates: Array<{ selector: string; rightPx: number }> = [];
    for (const element of Array.from(document.querySelectorAll('*')).slice(0, 5000)) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.left < width && rect.right > width + 2) {
        candidates.push({
          selector: selectorFor(element),
          rightPx: Math.round(rect.right - width)
        });
      }
    }
    candidates.sort((a, b) => b.rightPx - a.rightPx);
    return { overflowPx, candidates: candidates.slice(0, 5) };
  });
}

export async function scanSite(options: ScanOptions): Promise<ScanResult> {
  const url = validateUrl(options.url);
  const timeoutMs = options.timeoutMs ?? 20000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new Error('Timeout must be between 1000 and 120000 milliseconds.');
  }
  const viewports = options.viewports ?? DEFAULT_VIEWPORTS;
  if (!viewports.length || viewports.length > 12) {
    throw new Error('Specify between 1 and 12 viewports.');
  }
  viewports.forEach(assertViewport);
  const startedAt = new Date().toISOString();
  await mkdir(join(options.outputDir, 'screenshots'), { recursive: true });

  const findings: Finding[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        const resourceProblems: ResourceProblem[] = [];
        page.on('pageerror', error => {
          if (errors.length < 20) errors.push(error.message);
        });
        // Register listeners before navigation; otherwise early failures are missed.
        page.on('response', response => {
          if (resourceProblems.length >= 200) return;
          const problem = problemFromHttpResponse(
            response.url(), response.request().resourceType(), response.status()
          );
          if (problem) resourceProblems.push(problem);
        });
        page.on('requestfailed', request => {
          if (resourceProblems.length >= 200) return;
          const problem = problemFromNetworkFailure(
            request.url(), request.resourceType(), request.failure()?.errorText
          );
          if (problem) resourceProblems.push(problem);
        });
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForTimeout(300);
        const firstIndex = findings.length;

        if (response && response.status() >= 400) {
          findings.push(newFinding({
            ruleId: 'navigation.http-error',
            category: 'navigation',
            severity: 'high',
            confidence: 'confirmed',
            title: 'Target page returned an HTTP error',
            description: 'The main document returned HTTP ' + response.status() + '.',
            viewport,
            evidence: { detail: 'HTTP status observed on the main navigation response.' }
          }));
        }
        const probe = await detectOverflow(page);

        if (probe.overflowPx > 2) {
          const candidate = probe.candidates[0];
          findings.push(newFinding({
            ruleId: 'layout.horizontal-overflow',
            category: 'layout',
            severity: 'medium',
            confidence: 'needs-review',
            title: 'Horizontal page overflow detected',
            description: 'The document is ' + probe.overflowPx +
              'px wider than the viewport. This may hide content on small screens.',
            viewport,
            selector: candidate?.selector,
            evidence: {
              detail: 'The overflow is measurable, but may be intentional (for example, a carousel). Verify the candidate elements.',
              candidates: probe.candidates.map(({ selector, rightPx }) => ({
                selector,
                overflowPx: rightPx
              }))
            }
          }));
        }

        for (const message of [...new Set(errors)].slice(0, 10)) {
          findings.push(newFinding({
            ruleId: 'runtime.uncaught-error',
            category: 'runtime',
            severity: 'high',
            confidence: 'confirmed',
            title: 'Uncaught JavaScript error',
            description: message.slice(0, 500),
            viewport,
            evidence: { detail: 'Captured via the browser pageerror event.' }
          }));
        }

        for (const problem of dedupeResourceProblems(resourceProblems)) {
          findings.push(newFinding({
            ruleId: 'resources.' + problem.kind,
            category: 'resources',
            severity: 'medium',
            confidence: 'needs-review',
            title: problem.kind === 'http-error'
              ? 'Static resource returned an HTTP error'
              : 'Static resource failed to load',
            description: problem.resourceType + ' at ' + problem.address +
              ' (' + problem.reason + ')',
            viewport,
            evidence: {
              detail: 'Observed by browser network events. Some resources may be optional or intentionally unavailable.'
            }
          }));
        }

        if (findings.length > firstIndex) {
          const name = viewport.width + 'x' + viewport.height + '.png';
          try {
            await page.screenshot({ path: join(options.outputDir, 'screenshots', name), fullPage: false });
            for (const finding of findings.slice(firstIndex)) {
              finding.evidence = { ...finding.evidence, screenshot: 'screenshots/' + name };
            }
          } catch {
            // Screenshots are optional evidence; findings remain useful if capture fails.
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  // Do not persist query strings or fragments, which may contain secrets.
  const safeTarget = new URL(url);
  safeTarget.search = '';
  safeTarget.hash = '';
  return {
    schemaVersion: 1,
    toolVersion: '0.1.0',
    target: safeTarget.href,
    browser: 'chromium',
    startedAt,
    finishedAt: new Date().toISOString(),
    viewports,
    findings
  };
}
