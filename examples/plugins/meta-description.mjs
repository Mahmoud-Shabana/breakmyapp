/**
 * Opt-in BreakMyApp community rule example.
 *
 * Run:
 *   npm run scan -- http://127.0.0.1:4173 --plugin ./examples/plugins/meta-description.mjs
 *
 * You can copy this file, change the ID, and implement your own check().
 */
export default {
  id: 'community.meta-description',
  description: 'Report pages missing a descriptive meta description.',
  async check({ page }) {
    const content = await page.locator('meta[name="description"]').first().getAttribute('content');
    if (content?.trim()) return [];
    return [{
      id: 'missing',
      title: 'Missing meta description',
      description: 'The document lacks a populated <meta name="description"> element.',
      severity: 'low',
      confidence: 'confirmed',
      selector: 'head',
      detail: 'Add a concise page description for search and link previews.'
    }];
  }
};
