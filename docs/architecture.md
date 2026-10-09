# Architecture: First vertical slice

The first version is a deliberately small npm workspace.

~~~text
CLI (@breakmyapp/cli)
  -> scanSite (@breakmyapp/core)
      -> PageQueue (opt-in; 1–25 same-origin pages)
      -> Playwright Chromium
          -> responsive overflow probe (DOM measurements)
          -> pageerror listener (runtime failures)
          -> response/requestfailed listeners (static asset failures)
          -> main navigation HTTP status check
          -> axe-core accessibility audit (opt-in)
          -> community rule plugins (opt-in)
          -> per-viewport screenshot evidence
      -> typed ScanResult v1
  -> HTML and JSON reporter
~~~

## Data contract

ScanResult includes schemaVersion, toolVersion, a sanitized target URL without a query string, scan timestamps, tested viewport sizes, and findings.

Each finding carries a ruleId, severity, confidence, page URL, viewport, stable-ish fingerprint, explanatory text and optional relative screenshot path. ScanResult includes the visited page URLs as pagesScanned. Screenshots have a page-specific hash prefix to prevent filename collisions. Fingerprints help group similar findings; they are not globally unique issue identifiers.

## Rule behavior

**navigation.http-error** reports 4xx/5xx status codes returned by the main document; unlike asset failures, a failed main navigation is a high-severity confirmed result.

**layout.horizontal-overflow** measures document scrollWidth versus viewport width, and identifies up to five candidate elements whose bounding boxes extend outside the viewport. Up to five candidate elements are included in structured evidence and the HTML report. Because overflow can be a valid intentional design (such as a carousel), its confidence is needs-review; users must inspect the screenshot.

**resources.http-error** and **resources.network-error** observe image, script and stylesheet requests. The report strips query parameters and credentials from asset URLs, deduplicates repeats and excludes canceled requests. Findings are labelled needs-review because some failed resources may be optional or intentionally missing.

**runtime.uncaught-error** listens to Playwright pageerror and records at most ten distinct errors per viewport in the first 300ms after DOMContentLoaded. It does not diagnose failures that occur later or only after interaction.

## Non-goals for v0.1.0

No unrestricted crawling, arbitrary scripted user journeys, authenticated flows, AI guesses, remote scans or public scan service. Explicit crawling uses same-origin link discovery and skips potential action URLs; JavaScript on visited pages is still executed by the browser. Future rules should be developed against reproducible fixtures and should minimize false positives.

## Security

The HTML report is built from escaped text with no external dependencies. Screenshot paths are generated internally; the report does not embed scripts from the scanned page. Artifacts stay in a local directory and may contain sensitive data. See SECURITY.md.

## Accessibility & extensibility

The optional --a11y flag invokes @axe-core/playwright against each loaded viewport. It normalizes results to per-element findings, with axe impact, failure text and a trusted Deque guidance URL. Automation does not establish WCAG compliance.

The optional --plugin flag imports local trusted .mjs JavaScript modules exposing check({page,url,viewport}); see [plugins.md](plugins.md). Plugins have full Node.js privileges and are not sandboxed.

## Reproduction Packs

`packages/core/src/repro.ts` maps selected structured findings to Node.js test-runner scripts using Playwright, capped at 100 files per scan. Opt-in `BrowserContext.tracing` saves operations, DOM snapshots and screenshots in ZIP archives for viewports with findings. Browser traces do not store test assertions. See [reproduction.md](reproduction.md).

## Visual regression

When enabled, `checkVisualScreenshot()` compares a viewport screenshot with a saved baseline keyed by sanitized URL and viewport. `comparePngBuffers()` counts changed pixels using a fixed per-channel tolerance, with a separate maximum mismatch ratio. Each comparison is recorded in `ScanResult.visualComparisons`; differences yield `visual.pixel-change` findings marked needs-review. The offline HTML report renders protected relative URLs under `visual/{baseline,current,diff}/`. See [visual-regression.md](visual-regression.md) for capture reproducibility limits.

## Console and diagnostic redaction

The CLI prints only a sanitized target URL (no query, fragment, or URL-embedded credentials). Playwright browser-exception messages are normalized before becoming findings, and static-resource network failures store a recognized browser error code instead of arbitrary driver text. This reduces accidental leakage into logs and reports but **does not redact screenshots, traces, or arbitrary data emitted by trusted community plugins**. Tests: `packages/core/src/test/privacy.test.ts` and `resources.test.ts`.
