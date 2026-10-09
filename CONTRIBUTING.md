# Contributing to BreakMyApp

Thanks for helping make bug reports more useful.

## Before you start

1. Look through the open issues. For a first contribution, choose one tagged good first issue.
2. For a new feature, open an issue explaining the problem and expected behavior before spending significant time implementing it.
3. Be respectful, practical and specific in code reviews.

## Local development

You need Node.js 20+ and npm.

~~~bash
npm install
npx playwright install chromium
npm run build
npm test
~~~

The project does not depend on GitHub Actions: run build and tests locally, and paste your test output in the PR description. The default test suite does not launch a browser; run `npm run test:browser` to execute the Chromium integration test without platform-specific environment variables.

## Pull requests

- Keep PRs focused on one issue.
- Add a failing test or a minimal reproducible fixture for bug fixes.
- Avoid adding remote telemetry or requiring an AI service.
- Preserve user privacy when recording HTML, console output or screenshots.
- Use conventional commit messages, e.g. feat(core): add resource checks.

## Adding detectors

The scanner currently has built-in rules. A public, versioned plugin SDK is planned but not implemented. Please propose new rules as small core changes with a fixture and documented confidence level.

Rule results should distinguish **confirmed**, reproducible failures from **needs-review** observations. False positives harm trust more than a smaller but accurate feature set.

## Community expectations

No harassment, spam, scraping of private data or testing websites without authorization. Follow responsible disclosure for security issues.


## Contributing to Studio

Studio lives in `apps/studio/` and runs using `npm run studio`. It does not need Playwright or a build step. Run `npm run test:studio` for its dependency-free comparison and server checks. Keep imported strings as DOM text, preserve local-only processing, and clearly label synthetic data.


## Multi-page scanner development

Use `npm run demo` followed by `npm run scan -- http://127.0.0.1:4173 --crawl --viewport 375x812` to exercise page discovery and page-aware screenshots. Run `npm test` for the pure PageQueue tests and `npm run test:browser` for Chromium integration checks. The crawler is intentionally conservative; changes to URL eligibility require a clear security rationale, regression tests, and backwards-compatibility considerations for JSON reports.

## Community rules

See [docs/plugins.md](docs/plugins.md) and [the meta-description example](examples/plugins/meta-description.mjs). Add deterministic rules and positive/negative fixtures. Default to needs-review for ambiguous problems. The SDK is experimental. Never run untrusted code on your personal machine.

## Reproduction Packs

New repro rules need deterministic assertions and unit tests in `packages/core/src/test/repro.test.ts`. Avoid embedding untrusted strings as executable JavaScript. Generated scripts must be reviewed before running, and traces must not be committed without inspecting private data. See [docs/reproduction.md](docs/reproduction.md).

## Visual comparison development

The pixel comparison implementation is in `packages/core/src/visual.ts`. It uses Sharp to decode viewport PNGs and highlights pixels with a channel difference over the configured color tolerance. Add deterministic fixtures and unit tests for new comparison behavior; see `visual.test.ts`, `docs/visual-regression.md`, and the optional Chromium integration test. Avoid describing intentional design changes as confirmed bugs. Do not commit screenshots containing private information.

## Release quality gate

Run `npm run test:offline` first to verify the dependency-free tools, then `npm install`, `npx playwright install chromium`, and `npm run verify:release`. Do not claim the CLI has been validated end-to-end based only on unit tests. Follow [docs/release-checklist.md](docs/release-checklist.md). Avoid submitting private screenshots or traces.

## Test the distributable tarball

Use `npm run test:consumer:fixture` for an offline, zero-external-dependency package installation test; it builds and executes a synthetic compiled CLI in a clean consumer. After installing the real workspace dependencies and Chromium, run `npm run test:consumer` to pack and install the actual compiled product in a disposable temporary consumer. A successful fixture is **not** proof that the real scanner's dependencies, browser and native Sharp binaries install correctly. Never publish or tag a release without a clean environment verification.

## New-finding CI gates

If you change the comparison algorithm, update `packages/core/src/test/regression.test.ts` and [docs/regression-gate.md](docs/regression-gate.md). Tests must cover duplicate IDs, differing pages, resource HTTP status changes, and severity thresholds. `--fail-on-new` should never fail due solely to existing findings in the baseline. Keep baseline and current reports on the same sanitized target URL.
