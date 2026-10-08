# Community rule SDK (preview)

Create a local JavaScript plugin that contributes findings to BreakMyApp.

## Run the example

```bash
npm install
npx playwright install chromium
npm run build
npm run demo
# Run in another terminal:
npm run scan -- http://127.0.0.1:4173 --plugin ./examples/plugins/meta-description.mjs
npm run scan -- http://127.0.0.1:4173 --a11y --plugin ./examples/plugins/meta-description.mjs
```

## Write your own check

Save the following as a local `.mjs` file:

```js
export default {
  id: 'community.title-check',
  description: 'Detect pages without a title',
  async check({ page, viewport }) {
    if ((await page.title()).trim()) return [];
    return [{
      id: 'missing-title',
      title: 'Missing document title',
      description: 'Add a descriptive title in the document head.',
      severity: 'medium',
      confidence: 'confirmed',
      selector: 'head',
      detail: 'Observed at ' + viewport.width + 'px'
    }];
  }
};
```

The plugin must have a namespaced ID such as `community.title-check`, a description, and a `check({page,url,viewport})` method returning an array of observations. Every observation requires an ID, title, description and severity (`high`, `medium`, `low`). Optional fields are confidence, selector and detail. `check()` may be async. The scanner attaches the page URL, viewport and standard issue fingerprint.

Up to 10 plugins per scan and 30 observations per plugin per viewport are supported. A plugin exception results in a low-severity diagnostic without exposing exception details. This experimental interface may change.

## Security: critical restriction

**Plugins are not sandboxed.** Modules imported with `--plugin` execute as normal Node.js code and receive the Playwright Page object. They can read local files, modify browser state, navigate pages and access networks. Run only modules whose source you trust, preferably on an isolated staging environment. Never automatically install community code.

## Contribution process

Propose a measurable check in an issue, provide positive and negative fixtures, add documentation and tests, and ensure ambiguous findings are labelled `needs-review`. Run `npm test` and the opt-in `npm run test:browser` when Chromium is installed.
