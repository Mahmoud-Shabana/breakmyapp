# Bounded same-origin crawling

BreakMyApp starts with a **single page** by default. Use opt-in link discovery to visit additional pages without clicking links or sending forms.

```bash
npm run demo
# In another terminal:
npm run scan -- http://127.0.0.1:4173 --crawl --viewport 375x812
npm run scan -- http://127.0.0.1:4173 --max-pages 10 --viewport 390x844
```

## How it works

1. Open the explicit target URL in Chromium.
2. Collect up to 500 rendered anchor `href` values from the first viewport of each visited page.
3. Add eligible URLs to a FIFO queue, deduplicating fragments and canonical addresses.
4. Visit at most **5 pages** for `--crawl`, or **1–25 pages** when explicitly using `--max-pages`.
5. Run the existing detectors at every requested viewport for every discovered page.
6. Record `pagesScanned` in `report.json` and `pageUrl` for each finding. Screenshots include a page-specific hash prefix so they do not overwrite each other. Studio compares errors using source-page identity.

## Boundaries

- Only the *same origin*, including protocol and port.
- Skip external schemes, embedded credentials, query-bearing discovered URLs, file-like assets and common action paths (logout, delete, payment, etc.).
- Strip hash fragments and deduplicate links.
- Only actual links in rendered anchor elements count. There is no aggressive guessing, sitemap probing, form submission, click automation, authentication workflow or site-wide URL brute forcing.
- Starting URL query parameters are retained for navigation in single-page mode but redacted in reports. In crawl mode they are removed before visiting the seed.
- Detecting a link or a page is not a guarantee its contents are safe to visit: **JavaScript can run as soon as the page loads**. Scan only authorized staging/development environments when possible.

## Testing

```bash
npm test               # TypeScript build + unit tests, including PageQueue
npm run test:browser    # Optional real Chromium integration test (install Chromium first)
```

`packages/core/src/test/crawl.test.ts` covers same-origin policies, excluded links, deduplication and limits. The browser fixture in `scan.test.ts` checks page-aware errors and distinct evidence files.

## Planned improvements

Robots-aware opt-in policy, configurable per-page delays, user-defined path excludes and include lists, richer page graph visualization, and integration into the Studio timeline. These are intentionally **not** implemented in the preview.
