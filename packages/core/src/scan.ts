import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { normalizeAxeViolations } from './accessibility.js';
import { runRulePlugins } from './plugins.js';
import { PageQueue } from './crawl.js';
import { checkVisualScreenshot, type VisualComparison } from './visual.js';
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
  if (options.visualMode) {
    if (!options.visualBaselineDir) throw new Error('Visual mode requires a baseline directory.');
    const threshold = options.visualThreshold ?? 0.01;
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error('Visual threshold must be between 0 and 100 percent.');
    }
    if (viewports.some(v => v.width * v.height > 12_000_000)) {
      throw new Error('Visual snapshots require viewports of at most 12 million pixels.');
    }
  }
  const startedAt = new Date().toISOString();
  await mkdir(join(options.outputDir, 'screenshots'), { recursive: true });
  if (options.trace) await mkdir(join(options.outputDir, 'traces'), { recursive: true });

  const findings: Finding[] = [];
  const pagesScanned: string[] = [];
  const visualComparisons: VisualComparison[] = [];
  const queue = new PageQueue(url, options.maxPages ?? 1);
  const targetOrigin = new URL(url).origin;
  const browser = await chromium.launch({ headless: true });
  try {
    let current: string | undefined;
    while ((current = queue.next()) !== undefined) {
      pagesScanned.push(current);
      for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      let tracingActive = false;
      try {
        if (options.trace) {
          await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
          tracingActive = true;
        }
        const page = await context.newPage();
        // Do not follow a page redirect that leaves the explicitly chosen origin.
        await page.route('**/*', route => {
          if (!route.request().isNavigationRequest()) return route.continue();
          try {
            if (new URL(route.request().url()).origin !== targetOrigin) {
              return route.abort('blockedbyclient');
            }
          } catch {
            return route.abort('blockedbyclient');
          }
          return route.continue();
        });
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
        const firstIndex = findings.length;
        // Preserve explicitly supplied query parameters in single-page scans.
        // The report still records a redacted page URL.
        const navigationUrl = (options.maxPages ?? 1) === 1 ? url : current;
        let response: Awaited<ReturnType<typeof page.goto>>;
        try {
          response = await page.goto(navigationUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
          await page.waitForTimeout(300);
        } catch (error) {
          // A failed discovered page should not discard evidence from other pages.
          if (pagesScanned.length === 1 && !findings.length && current === queue.planned[0]) {
            throw error;
          }
          // Avoid persisting navigation exception strings that may include secrets in URLs.
          const rawMessage = error instanceof Error ? error.message : String(error);
          const code = rawMessage.match(/net::[A-Z0-9_]+/)?.[0] ?? 'navigation failed';
          const finding = newFinding({
            ruleId: 'navigation.failed',
            category: 'navigation',
            severity: 'high',
            confidence: 'needs-review',
            title: 'Page navigation failed',
            description: code,
            viewport,
            pageUrl: current
          });
          finding.id = fingerprint([current, finding.id]);
          findings.push(finding);
          continue;
        }
        if (viewport === viewports[0] && (options.maxPages ?? 1) > 1) {
          const links = await page.locator('a[href]').evaluateAll(anchors =>
            anchors.slice(0, 500).map(anchor => (anchor as HTMLAnchorElement).href)
          );
          queue.offerMany(links);
        }

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

        if (options.accessibility) {
          try {
            const audit = await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
              .analyze();
            for (const a11yFinding of normalizeAxeViolations(audit.violations, viewport)) {
              findings.push(newFinding(a11yFinding));
            }
          } catch {
            findings.push(newFinding({
              ruleId: 'scanner.accessibility-audit-failed',
              category: 'accessibility',
              severity: 'low',
              confidence: 'needs-review',
              title: 'Accessibility audit could not finish',
              description: 'The automated axe-core audit did not complete for this page.',
              viewport,
              evidence: { detail: 'Retry on a stable page or disable --a11y. No compliance conclusion can be drawn.' }
            }));
          }
        }

        if (options.plugins?.length) {
          const pluginFindings = await runRulePlugins(options.plugins, {
            page, url: current, viewport
          });
          for (const pluginFinding of pluginFindings) {
            findings.push(newFinding(pluginFinding));
          }
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

        if (options.visualMode && options.visualBaselineDir) {
          try {
            // Normalize animation and caret state to reduce incidental differences.
            const screenshot = await page.screenshot({
              type: 'png', fullPage: false, animations: 'disabled', caret: 'hide'
            });
            const comparison = await checkVisualScreenshot(screenshot, {
              pageUrl: current,
              viewport,
              mode: options.visualMode,
              baselineDir: options.visualBaselineDir,
              outputDir: options.outputDir,
              threshold: options.visualThreshold ?? 0.01
            });
            visualComparisons.push(comparison);
            if (comparison.status === 'changed' || comparison.status === 'dimensions-changed') {
              const pct = ((comparison.mismatchRatio ?? 0) * 100).toFixed(2);
              findings.push(newFinding({
                ruleId: comparison.status === 'changed' ? 'visual.pixel-change' : 'visual.dimension-change',
                category: 'visual',
                severity: 'medium',
                confidence: 'needs-review',
                title: 'Visual snapshot differs from its baseline',
                description: comparison.status === 'changed'
                  ? pct + '% of pixels differ from the approved reference snapshot.'
                  : 'The baseline and current screenshots have different dimensions.',
                viewport,
                evidence: { detail: 'Visual differences may be intentional. Inspect baseline/current/diff images in the report.' }
              }));
            } else if (comparison.status === 'missing-baseline') {
              findings.push(newFinding({
                ruleId: 'visual.missing-baseline',
                category: 'visual',
                severity: 'low',
                confidence: 'needs-review',
                title: 'No reference screenshot exists',
                description: 'Save a baseline for this page and viewport before comparing.',
                viewport,
                evidence: { detail: 'Missing baseline is not a visual regression.' }
              }));
            }
          } catch {
            visualComparisons.push({ pageUrl: current, viewport, status: 'capture-failed' });
            findings.push(newFinding({
              ruleId: 'visual.capture-failed',
              category: 'visual',
              severity: 'low',
              confidence: 'needs-review',
              title: 'Visual screenshot comparison could not complete',
              description: 'The page could not be captured or its PNG comparison failed.',
              viewport,
              evidence: { detail: 'Check filesystem access, image dimensions and installed Sharp binaries.' }
            }));
          }
        }

        for (const finding of findings.slice(firstIndex)) {
          finding.pageUrl = current;
          finding.id = fingerprint([current, finding.id]);
        }
        if (findings.length > firstIndex && tracingActive) {
          const pageKey = createHash('sha256').update(current).digest('hex').slice(0, 12);
          const tracePath = 'traces/' + pageKey + '-' + viewport.width + 'x' + viewport.height + '.zip';
          await context.tracing.stop({ path: join(options.outputDir, tracePath) });
          tracingActive = false;
          for (const finding of findings.slice(firstIndex)) {
            finding.evidence = { ...finding.evidence, trace: tracePath };
          }
        }
        if (findings.length > firstIndex) {
          const pageKey = createHash('sha256').update(current).digest('hex').slice(0, 12);
          const name = pageKey + '-' + viewport.width + 'x' + viewport.height + '.png';
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
        if (tracingActive) await context.tracing.stop();
        await context.close();
      }
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
    pagesScanned,
    visualComparisons: options.visualMode ? visualComparisons : undefined,
    findings
  };
}
