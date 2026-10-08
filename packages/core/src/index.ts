export { scanSite } from './scan.js';
export { writeReports, renderHtmlReport, escapeHtml } from './report.js';
export { DEFAULT_VIEWPORTS } from './types.js';
export type {
  ScanOptions,
  ScanResult,
  Finding,
  Viewport,
  Confidence,
  Severity,
  Category
} from './types.js';
export { problemFromHttpResponse, problemFromNetworkFailure, redactedResourceUrl, dedupeResourceProblems } from './resources.js';
export type { ResourceProblem, StaticResourceType } from './resources.js';

export { PageQueue, eligiblePageUrl } from './crawl.js';

export { axeSeverity, axeSelector, normalizeAxeViolations } from './accessibility.js';
export type { AxeNode, AxeViolation } from './accessibility.js';

export { defineRule, validateRulePlugin, runRulePlugins } from './plugins.js';
export type { RulePlugin, PluginContext, PluginObservation } from './plugins.js';

export { safeReproUrl, planReproduction, generateReproScript, writeReproductionPacks } from './repro.js';
export type { ReproKind, ReproPlan } from './repro.js';
