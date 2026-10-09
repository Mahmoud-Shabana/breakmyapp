# Release readiness: verification before publication

**Current status: developer preview, not published to npm.** Do not label the repository production-ready or advertise an installable npm package until the gates below pass on an actual clean machine.

## Minimum runtime

Node.js **22.12.0+** is required. The current `@axe-core/playwright` 4.13 dependency requires Node >=22.12.0, so earlier documentation advertising Node 20 was incorrect and has been updated.

## Local gates (no GitHub Actions required)

```bash
node --version
npm install
npx playwright install chromium
npm run test:offline       # no package download needed; good first check
npm run build
npm run doctor
npm run test:browser
npm run package:preview
npm run test:package
npm run test:consumer:fixture
npm run test:smoke:fixture
npm pack --dry-run .breakmyapp/package-preview
npm run test:consumer
npm run verify:release
```

- `npm run test:offline`: local Studio import/compare logic, Studio server, plugin example, and Doctor unit tests.
- `npm run build`: compile TypeScript core and CLI.
- `npm run doctor`: verify Node runtime, required packages, installed Chromium, compiled entrypoints and Studio. Returns nonzero on failed checks. `node scripts/doctor.mjs --json` generates machine-readable output.
- `npm test`: builds core/CLI, runs core unit tests including visual and reproduction logic, then runs offline tests.
- `npm run test:browser`: performs real Chromium integration checks for crawling, accessibility, plugins, trace ZIPs, replay files, and visual regression. It requires a usable Chromium installation.
- `npm run test:consumer:fixture`: packs a synthetic runtime without external dependencies, installs its tarball in an isolated consumer with `--offline`, and verifies its CLI `--help`/`--version` entrypoints.
- `npm run test:consumer`: creates the **real workspace** CLI package, packs it, installs it into a clean temporary project with public runtime dependencies, runs `--version` and `--help`, then performs a real Chromium scan against a temporary local two-page fixture. It asserts overflow, runtime exceptions, missing assets, accessibility, report files and generated reproductions. This needs npm Registry access (or cached compatible dependencies) and an installed Chromium.
- `npm run test:smoke:fixture`: checks that the installed-scanner smoke harness rejects missing or meaningless reports without launching Chromium.
- `npm run verify:release`: executes the full local gates, including a real browser scan from the independently installed package, and must finish with exit code 0.

## Regression-gate smoke test

Save a reference scan and run the same fixture with `--baseline-report <old-report.json> --fail-on-new medium`. Expect `regression.json` to report zero new findings. Verify the command exits 2 when a new high/medium issue is deliberately introduced. Automated comparison is heuristic; do not call a passed gate proof that a site has no bugs.

## User-facing smoke test

Open three terminals if necessary. Start the deliberately broken website with `npm run demo`, then:

```bash
npm run scan -- http://127.0.0.1:4173 --viewport 375x812 --crawl --a11y --repro
npm run studio
```

Open `.breakmyapp/index.html` and confirm the findings, screenshot and reproduction links. Import `.breakmyapp/report.json` into Studio at `http://127.0.0.1:4174`. Verify that a sample regression comparison works and that it clearly marks sample content as illustrative.

Next, run the controlled visual fixture:

```bash
npm run demo:visual
npm run scan -- "http://127.0.0.1:4175/?variant=before" --viewport 375x812 --visual-save .breakmyapp/baselines
npm run scan -- "http://127.0.0.1:4175/?variant=after" --viewport 375x812 --visual-compare .breakmyapp/baselines
```

Inspect baseline/current/diff images and the recorded mismatch ratio.

## Publication blockers

- [ ] Clean installation and full Chromium integration suite verified on at least one supported developer environment.
- [ ] Node.js 22.12+ compatibility and native Sharp installation verified on Windows and Linux.
- [ ] Dependable dependency lockfile created and checked in from a clean `npm install`.
- [ ] Review default trace/screenshot privacy, plugin trust boundary and generated scripts.
- [ ] Confirm that the `@breakmyapp` npm organization/scope is owned and controlled by the maintainer. Both workspace packages are intentionally `private: true`; do **not** publish them prematurely. Establish a package publishing strategy before removing `private`.
- [x] Create a **private local packaging preview** from the compiled CLI and core; `npm pack --dry-run` is covered by a fixture test.
- [x] Verify a synthetic package can be packed, installed and executed inside an unrelated temporary consumer with **no npm Registry access**.
- [ ] Run `npm run test:consumer` on the **actual compiled repository with real public dependencies** (not just synthetic fixtures), on a clean machine, and verify full Chromium scanning.
- [ ] Mark a release tag only after verifying reproducibility and documenting limitations.

GitHub Actions status is not a substitute for running these gates. If CI is blocked, use the local commands and attach redacted logs to the release discussion.
