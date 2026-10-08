/**
 * Resource diagnostics are deliberately conservative: a failed request is
 * evidence of a network problem, not proof of a user-visible application bug.
 */
export type StaticResourceType = 'image' | 'script' | 'stylesheet';

export interface ResourceProblem {
  kind: 'http-error' | 'network-error';
  resourceType: StaticResourceType;
  address: string;
  reason: string;
}

const STATIC_TYPES: ReadonlySet<string> = new Set(['image', 'script', 'stylesheet']);

/** Prevent query parameters and URL-embedded credentials leaking into reports. */
export function redactedResourceUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

export function problemFromHttpResponse(
  rawUrl: string,
  resourceType: string,
  status: number
): ResourceProblem | null {
  if (!STATIC_TYPES.has(resourceType) || !Number.isInteger(status) || status < 400 || status > 599) return null;
  const address = redactedResourceUrl(rawUrl);
  if (!address) return null;
  return {
    kind: 'http-error',
    resourceType: resourceType as StaticResourceType,
    address,
    reason: `HTTP ${status}`
  };
}

export function problemFromNetworkFailure(
  rawUrl: string,
  resourceType: string,
  errorText: string | undefined
): ResourceProblem | null {
  if (!STATIC_TYPES.has(resourceType) || !errorText) return null;
  // Navigations and applications routinely cancel resource requests on purpose.
  if (/ERR_ABORTED|NS_BINDING_ABORTED|cancell?ed|aborted/i.test(errorText)) return null;
  const address = redactedResourceUrl(rawUrl);
  if (!address) return null;
  return {
    kind: 'network-error',
    resourceType: resourceType as StaticResourceType,
    address,
    reason: errorText.slice(0, 100).replace(/[\r\n\t]/g, ' ')
  };
}

/** Dedupe repeat attempts, preserving the first diagnostic for each type and URL. */
export function dedupeResourceProblems(problems: ResourceProblem[], limit = 25): ResourceProblem[] {
  const seen = new Set<string>();
  return problems.filter(problem => {
    const key = `${problem.resourceType}|${problem.address}|${problem.kind}|${problem.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}
