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
npm run verify:release
```

- `npm run test:offline`: local Studio import/compare logic, Studio server, plugin example, and Doctor unit tests.
- `npm run build`: compile TypeScript core and CLI.
- `npm run doctor`: verify Node runtime, required packages, installed Chromium, compiled entrypoints and Studio. Returns nonzero on failed checks. `node scripts/doctor.mjs --json` generates machine-readable output.
- `npm test`: builds core/CLI, runs core unit tests including visual and reproduction logic, then runs offline tests.
- `npm run test:browser`: performs real Chromium integration checks for crawling, accessibility, plugins, trace ZIPs, replay files, and visual regression. It requires a usable Chromium installation.
- `npm run verify:release`: executes the full local gates and must finish with exit code 0.

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
- [ ] Confirm `npm pack --dry-run` includes built artifacts and that packed CLI installation can resolve all published dependencies.
- [ ] Mark a release tag only after verifying reproducibility and documenting limitations.

GitHub Actions status is not a substitute for running these gates. If CI is blocked, use the local commands and attach redacted logs to the release discussion.
