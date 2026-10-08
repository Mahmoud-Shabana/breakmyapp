# BreakMyApp 🧪

**Your website looks perfect. Let's prove it wrong.**

BreakMyApp is an open-source, local-first website bug scanner. It uses a real Chromium browser to collect **evidence**, not guesses: responsive overflow, uncaught JavaScript errors, failed static resources, and screenshots you can inspect offline.

> **Status: developer preview (scanner v0.1.0, Studio v0.2 preview).** Not published to npm yet. The project is actively being built; the first release is intentionally limited in scope.

## What's working

- 📱 **Responsive overflow detection** at 375×812, 768×1024 and 1440×900, or custom viewport sizes.
- 🐛 **Browser runtime error tracking** for uncaught JavaScript errors, plus HTTP errors on the main page.
- 🖼️ **Failed resource detection** for images, scripts and stylesheets returning HTTP 4xx/5xx or experiencing network failures (labelled needs-review).
- 📸 **Visual evidence**, captured for viewport(s) where findings occur.
- 📄 **Offline HTML and machine-readable JSON reports**, stored on your own machine.
- 🛠 **CI-friendly exit codes** with an opt-in --fail-on severity threshold.
- 🔒 **Local-first:** no account, AI API key, or hosted backend is required.

This release does **not** crawl an entire site, replay arbitrary user journeys, verify button behavior or diagnose visual regressions. A clean report does not mean a bug-free application.

## 🧭 Studio — visualize and compare scans

**BreakMyApp Studio** is a standalone, local-first forensic dashboard. Import scan JSON files from your machine, visually explore findings, and compare today's report to a previous baseline.

**Run it locally** (Node.js 20+; no install, build, CI, API key, or Playwright required for Studio itself):

```bash
npm run studio
```

Open **http://127.0.0.1:4174**. Click **Explore sample report** for an illustrative comparison, or **Open scan report** to import a real `.breakmyapp/report.json`. Import an older scan using **Add baseline** to detect new, existing and resolved findings.

- Severity and change filters, search, viewport and diagnostic evidence inspector
- New / existing / resolved finding comparison (heuristic, review before acting)
- Export Markdown summaries and GitHub issue descriptions
- Browser-local JSON analysis with escaped DOM content and restrictive Content Security Policy
- Zero-dependency local test runner

Browsers cannot automatically load screenshots from arbitrary paths found in imported JSON files. For images, open the scanner-generated `.breakmyapp/index.html` report alongside Studio.

```bash
npm run test:studio
```

---

## Quick start

Requirements: Node.js 20+, npm and a system capable of launching Chromium.

~~~bash
git clone https://github.com/Mahmoud-Shabana/breakmyapp.git
cd breakmyapp
npm install
npx playwright install chromium
npm run build
~~~

Start our deliberately broken demo page in terminal one:

~~~bash
npm run demo
~~~

Then scan it in terminal two:

~~~bash
npm run scan -- http://127.0.0.1:4173
~~~

The demo deliberately causes layout overflow, a JavaScript exception, and missing image and CSS resources. Open **.breakmyapp/index.html** in your browser. The JSON report lives in **.breakmyapp/report.json**.

To scan a local development server with a custom viewport:

~~~bash
npm run scan -- scan http://localhost:3000 --viewport 390x844 --output .breakmyapp/mobile
~~~

To make a scan fail with exit code 2 when it finds medium or high severity issues:

~~~bash
npm run scan -- http://localhost:3000 --fail-on medium
~~~

Use **npm test** for TypeScript build and unit tests. After installing Chromium, run **npm run test:browser** to execute the real-browser integration test on Windows, macOS or Linux. No GitHub Actions setup is required.

## What you'll get

- A local, readable HTML report with finding cards, severity labels and screenshots.
- A structured JSON report with rule IDs, viewports, evidence and stable-ish finding fingerprints.
- Meaningful exit codes: 0 for successful scan (unless --fail-on triggers); 1 for operational errors; 2 for requested severity threshold.

> **Privacy:** screenshots and exception messages may include private data. Report folders are ignored by Git. Do not upload them publicly without reviewing their contents. URLs with credentials are rejected, and query strings are removed from the saved target address.

## Architecture

- **packages/core** — Playwright runner, diagnostic rules, evidence capture and report generation.
- **packages/cli** — argument parsing, summary output and exit codes.
- **examples/broken-site** — a reproducible, intentionally broken demonstration page.

Learn more in [docs/architecture.md](docs/architecture.md).

## Roadmap

- [x] First real-browser scanner with evidence and offline reports.
- [x] Detect failed static resources with conservative classification and privacy-safe URLs.
- [ ] Integrate axe-core accessibility rules.
- [ ] Add baselines for image-diff visual regression.
- [ ] Rule plugin SDK and shareable community packs.
- [ ] Optional AI-assisted explanations (without requiring an API key).
- [ ] Firefox and WebKit support.

## Contributing

We welcome fixes, test fixtures, documentation improvements and new detectors. Start with [CONTRIBUTING.md](CONTRIBUTING.md), then check [issues](https://github.com/Mahmoud-Shabana/breakmyapp/issues).

Found a security issue? Follow [SECURITY.md](SECURITY.md). **Only scan applications you own or are authorized to test.**

## License

MIT — see [LICENSE](LICENSE).
