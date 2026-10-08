# Reproduction Packs

BreakMyApp can generate runnable **Playwright-powered Node.js tests** and Playwright Trace ZIPs while scanning an authorized site. Both are opt-in, local artifacts.

## Try the local demo

```bash
npm install
npx playwright install chromium
npm run demo
# In a second terminal:
npm run scan -- http://127.0.0.1:4173 --viewport 375x812 --evidence
npm run test:repros
```

The `.breakmyapp/index.html` report links findings to tests in `repros/<finding-id>.test.mjs`, optional traces in `traces/<page-hash>-<viewport>.zip`, and screenshots. `--repro` writes tests only. `--trace` records traces only. `--evidence` enables both. Without these flags, neither is created.

## Observations supported

| Finding | Playwright-based check |
| --- | --- |
| Horizontal overflow | Document width exceeds viewport by more than 2px |
| Uncaught runtime exception | Exact observed error message occurs after navigation |
| Navigation HTTP 4xx/5xx | Main document still returns the observed status |
| Static resource HTTP 4xx/5xx | Specific resource returns its observed status |
| axe-core `a11y.*` rule | Same axe rule ID is reported again |

Unsupported findings (including community plugins and transient network failures) intentionally receive no automatic test. Generated tests confirm an observable condition, **not necessarily a user-visible bug**. They may fail if the page changes or requires authentication/query parameters.

## Re-run and inspect

```bash
npm run test:repros
npm run test:repros -- path/to/report/repros
npx playwright show-trace .breakmyapp/traces/<file>.zip
```

Scripts run with Node's built-in `node:test` and the installed `playwright` dependency; they do not require `@playwright/test`. They will revisit the target and execute its JavaScript. Use only against websites you are allowed to test. BrowserContext tracing records browser actions, DOM snapshots, network requests and screenshots, but **not assertion results**.

## Privacy and limitations

Traces and screenshots can contain **sensitive page information and network data** and are **not redacted**. Review them before sharing. `.gitignore` excludes `.breakmyapp/` by default. Generated tests sanitize URLs by removing query strings, fragments and credentials, which can limit reproduction for signed links. No automated form submission, login workflow or arbitrary click replay is recorded. Avoid running multiple reports in the same output directory without reviewing stale files. Trace recording consumes extra disk space.
