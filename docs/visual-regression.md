# Visual Regression Testing (Developer Preview)

BreakMyApp compares an approved screenshot baseline with a freshly rendered browser viewport. It reports the ratio of changed pixels and produces a diff image where changed pixels are highlighted in pink. This is a **deterministic pixel comparison**, not an AI judgment of design quality.

## Reproduce the built-in demo

```bash
npm install
npx playwright install chromium
npm run demo:visual
# Open a second terminal:
npm run scan -- "http://127.0.0.1:4175/?variant=before" --viewport 375x812 --visual-save .breakmyapp/baselines
npm run scan -- "http://127.0.0.1:4175/?variant=after" --viewport 375x812 --visual-compare .breakmyapp/baselines --visual-threshold 1
```

Open `.breakmyapp/index.html` to inspect baseline, current and highlighted diff images. The raw JSON report has a `visualComparisons` array with page, viewport, status, pixel ratio and evidence filenames.

## Commands

- `--visual-save <dir>`: save reference screenshots for each page/viewport, replacing previously saved references with the same key.
- `--visual-compare <dir>`: compare screenshots against the selected reference directory and save evidence under the scan's output folder.
- `--visual-threshold <percentage>`: maximum changed pixels allowed (0–100); default is 1%. It is distinct from the internal per-channel color tolerance of 32/255.
- `--crawl` or `--max-pages <N>`: optional bounded scanning of multiple same-origin pages and viewports.

Save and compare options are mutually exclusive. If no baseline exists, the result is `missing-baseline`, **not** a confirmed regression. If the pixel ratio exceeds the threshold, the result is `changed` and a `visual.pixel-change` Finding is generated with confidence `needs-review`. PNG dimension mismatches receive a separate status. A result of `passed` only means the pixel ratio was under the configured threshold.

## File layout

```text
.breakmyapp/
  baselines/           # saved reference images; user-selected path
  visual/
    baseline/          # copies of reference screenshots used for comparison
    current/           # screenshots from the latest scan
    diff/              # highlighted pixels for comparisons over threshold
  report.json
  index.html
```

Baseline keys use SHA-256 of a sanitized origin/path URL plus the viewport dimensions. Query strings and fragments are excluded from names. The demo intentionally uses `?variant=before` and `?variant=after` so two renderings of the same page share a reference key. You may store approved baselines in a controlled repository with synthetic data; do not commit private screenshots.

## Why results vary

Even unchanged pages may differ due to fonts, delayed images, timestamps, randomized content, device pixel ratios, network requests, or browser-version upgrades. Capture uses a fixed viewport with animations disabled and the caret hidden to reduce incidental differences. Tests should use stable fixtures or staging environments. Review visual findings before treating them as bugs.

## Test coverage

`npm test` includes 7 unit tests for image identity, pixel ratios, dimension mismatch, baseline handling, thresholds, and diff generation. `npm run test:browser` includes an opt-in Chromium integration test for the full save/compare/report path. The project does not currently have verified CI for this environment.

## Privacy and safety

These PNGs contain the **actual pixels** rendered by the target page and are not redacted. Report folders can include personal or private content. Run only against authorized websites, ideally local fixtures. Restrict access to output directories, review artifacts before sharing, and avoid using unstable or private production pages.
