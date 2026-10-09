# CI Regression Gate: compare scans without failing on old bugs

BreakMyApp can use an earlier `report.json` to distinguish new, existing and resolved findings. With `--fail-on-new`, it returns an exit code that CI/CD can use without failing on all historical issues.

## Quick start

```bash
# Terminal A
npm run demo

# Terminal B — capture a known baseline
npm run scan -- http://127.0.0.1:4173 --viewport 375x812 --output .breakmyapp/reference

# Re-run later; only newly introduced medium/high findings trigger exit 2
npm run scan -- http://127.0.0.1:4173 --viewport 375x812 --output .breakmyapp/latest --baseline-report .breakmyapp/reference/report.json --fail-on-new medium
```

Under `.breakmyapp/latest/`, open `report.json` for the current scan and `regression.json` for the comparison. The latter includes `schemaVersion`, both targets, `counts`, `newFindings` and `resolvedFindings`. The scanner also prints a short comparison summary.

## Flags and exit status

- `--baseline-report <file>` reads an earlier BreakMyApp schema v1 JSON report and enables comparison. It does not change exit status by itself.
- `--fail-on-new high` returns exit 2 if **new high-severity** findings appear.
- `--fail-on-new medium` returns exit 2 if **new high- or medium-severity** findings appear.
- `--fail-on-new any` returns exit 2 for any new finding, including low severity.
- If neither gate fails, the command exits 0. Invalid inputs, missing baseline files and scan errors exit 1. Existing `--fail-on` still evaluates **all** current findings and can trigger exit 2 independently.

Without `--baseline-report`, `--fail-on-new` is rejected before the browser launches. To prevent accidental comparisons of unrelated sites, the baseline's target must match the URL being scanned after removing query/fragment data. Baseline JSON is limited to 50 MB.

## Matching algorithm and limitations

Findings are paired one-to-one by page URL, rule ID, viewport and identifying detail (element selector when present, resource address for static assets, and error message for runtime exceptions). A different resource HTTP status for the same address remains the same finding; changes to the measured pixel-diff percentage are not treated as a new visual rule. A changed runtime message can count as a new issue. This is heuristic; review the `regression.json` output if you see unexpected changes.

Use a stable staging/local URL; changing ports, hostnames or base paths intentionally fails the target check. Commit baseline **JSON only after checking for sensitive data**. Do not upload private trace archives or screenshots as CI artifacts without reviewing them. Both scanner outputs are local and no hosted account is required.

## Example continuous integration flow

1. Start the test server on a fixed URL.
2. Restore an approved baseline report from the repository or a trusted artifact source.
3. Install Node.js 22.12+ and dependencies; install Playwright Chromium.
4. Run `breakmyapp scan <url> --baseline-report <file> --fail-on-new medium`.
5. Review `regression.json` for fixes and unexpected newly introduced issues.

GitHub Actions is optional. You can run this flow in a local pre-release test, Jenkins or another permitted CI runner. A pass only means no *new detected findings* at that threshold; it is not proof of accessibility or security compliance.
