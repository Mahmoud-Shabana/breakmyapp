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
