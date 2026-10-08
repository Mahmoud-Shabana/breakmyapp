import type { Page } from 'playwright';
import type { Finding, Viewport } from './types.js';

export interface PluginContext {
  /** Same page being scanned by the built-in rules. Plugins run with full page privileges. */
  readonly page: Page;
  /** Query strings are omitted from this page URL. */
  readonly url: string;
  readonly viewport: Viewport;
}

export interface PluginObservation {
  /** Short ID unique within the plugin. */
  id: string;
  title: string;
  description: string;
  severity: Finding['severity'];
  confidence?: Finding['confidence'];
  selector?: string;
  detail?: string;
}

export interface RulePlugin {
  /** Namespaced rule ID, for example community.meta-description */
  id: string;
  description: string;
  check(context: PluginContext): Promise<readonly PluginObservation[]> | readonly PluginObservation[];
}

const NAME = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

export function validateRulePlugin(value: unknown): asserts value is RulePlugin {
  if (!value || typeof value !== 'object') throw new Error('Plugin must export an object.');
  const plugin = value as Partial<RulePlugin>;
  if (typeof plugin.id !== 'string' || !NAME.test(plugin.id) || plugin.id.length > 100) {
    throw new Error('Plugin ID must be namespaced, e.g. community.meta-description.');
  }
  if (typeof plugin.description !== 'string' || plugin.description.length > 500) {
    throw new Error('Plugin needs a string description (up to 500 characters).');
  }
  if (typeof plugin.check !== 'function') throw new Error('Plugin must implement check(context).');
}

export function defineRule<T extends RulePlugin>(rule: T): T {
  validateRulePlugin(rule);
  return rule;
}

const SEVERITIES = new Set(['high', 'medium', 'low']);
const RULE_ID = /^[a-z][a-z0-9-]{0,80}$/;

/**
 * Plugins are local, explicitly opted-in JavaScript modules: NOT sandboxed.
 * Do not use plugins from untrusted publishers.
 */
export async function runRulePlugins(
  plugins: readonly RulePlugin[],
  context: PluginContext
): Promise<Array<Omit<Finding, 'id'>>> {
  if (plugins.length > 10) throw new Error('Only up to 10 plugins are supported per scan.');
  const findings: Array<Omit<Finding, 'id'>> = [];
  for (const plugin of plugins) {
    validateRulePlugin(plugin);
    try {
      const output = await plugin.check(context);
      if (!Array.isArray(output)) throw new Error('Plugin check() must return an array.');
      for (const raw of output.slice(0, 30)) {
        if (!raw || !RULE_ID.test(raw.id) || !SEVERITIES.has(raw.severity) ||
            typeof raw.title !== 'string' || typeof raw.description !== 'string') {
          throw new Error('Plugin returned an invalid finding.');
        }
        findings.push({
          ruleId: 'plugin.' + plugin.id + '.' + raw.id,
          category: 'plugin',
          severity: raw.severity,
          confidence: raw.confidence === 'confirmed' ? 'confirmed' : 'needs-review',
          title: raw.title.slice(0, 200),
          description: raw.description.slice(0, 600),
          viewport: context.viewport,
          selector: typeof raw.selector === 'string' ? raw.selector.slice(0, 400) : undefined,
          evidence: { detail: typeof raw.detail === 'string' ? raw.detail.slice(0, 1200) : 'Community rule observation.' }
        });
      }
    } catch {
      // Plugins should not stop the entire scan, but failures must remain visible.
      findings.push({
        ruleId: 'plugin.' + plugin.id + '.execution-failed',
        category: 'plugin',
        severity: 'low',
        confidence: 'needs-review',
        title: 'Community plugin failed to execute',
        description: 'Plugin ' + plugin.id + ' did not complete successfully.',
        viewport: context.viewport,
        evidence: { detail: 'Inspect this plugin locally. The scanner has suppressed its exception to avoid leaking secrets.' }
      });
    }
  }
  return findings;
}
