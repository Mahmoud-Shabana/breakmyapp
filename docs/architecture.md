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
