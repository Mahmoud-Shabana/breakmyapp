/**
 * Conservative link discovery for an explicitly authorized website.
 * Only same-origin, read-only-looking paths are eligible.
 */
const BLOCKED_SEGMENTS = new Set([
  'logout', 'log-out', 'signout', 'sign-out', 'delete', 'remove', 'destroy',
  'unsubscribe', 'checkout', 'purchase', 'buy', 'payment', 'pay', 'admin',
  'reset-password', 'confirm', 'activate', 'revoke'
]);
const NON_PAGE_SUFFIX = /\.(?:png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|tar|7z|mp4|mp3|mov|webm|css|js|mjs|json|xml|txt|woff2?|ttf|eot|map)(?:$)/i;

/** Canonicalize and filter an anchor before navigation. Never follow cross-origin links. */
export function eligiblePageUrl(raw: string, root: string): string | null {
  try {
    const rootUrl = new URL(root);
    const url = new URL(raw, rootUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== rootUrl.origin) return null;
    if (url.username || url.password || url.search) return null;
    if (url.pathname.split('/').some(segment => BLOCKED_SEGMENTS.has(decodeURIComponent(segment).toLowerCase()))) return null;
    if (NON_PAGE_SUFFIX.test(url.pathname)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

/** Breadth-first, first-seen page order, bounded independently of input volume. */
export class PageQueue {
  private readonly pending: string[];
  private readonly seen: Set<string>;
  private cursor = 0;

  constructor(readonly root: string, readonly maxPages: number) {
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 25) {
      throw new Error('maxPages must be an integer between 1 and 25.');
    }
    const url = new URL(root);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('The starting URL must be HTTP(S) without credentials.');
    }
    url.hash = '';
    url.search = '';
    this.pending = [url.href];
    this.seen = new Set(this.pending);
  }

  offer(raw: string): boolean {
    if (this.pending.length >= this.maxPages) return false;
    const candidate = eligiblePageUrl(raw, this.root);
    if (!candidate || this.seen.has(candidate)) return false;
    this.pending.push(candidate);
    this.seen.add(candidate);
    return true;
  }

  offerMany(urls: readonly string[]): number {
    let added = 0;
    for (const url of urls.slice(0, 500)) if (this.offer(url)) added++;
    return added;
  }

  next(): string | undefined {
    return this.pending[this.cursor++];
  }

  get planned(): readonly string[] {
    return this.pending;
  }
}
