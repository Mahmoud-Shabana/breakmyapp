/**
 * Privacy-safe diagnostic strings. URLs may contain session IDs in query strings.
 * Never change the actual navigation URL; only sanitize its representation.
 */
export function publicUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '[unsupported URL]';
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    return '[invalid URL]';
  }
}

export function safeDiagnosticMessage(input: unknown, maxLength = 500): string {
  const message = input instanceof Error ? input.message : String(input ?? '');
  const sanitized = message.replace(/https?:\/\/[^\s<>"']+/gi, candidate => {
    const suffix = candidate.match(/[),;.!]+$/)?.[0] ?? '';
    const url = candidate.slice(0, candidate.length - suffix.length);
    return publicUrl(url) + suffix;
  });
  return sanitized.replace(/[\r\n\t]/g, ' ').slice(0, Math.max(0, maxLength));
}

/** Driver errors can include private request details, so retain only known codes. */
export function safeNetworkFailure(input: unknown): string {
  const text = String(input ?? '');
  const code = text.match(/\b(?:net::)?ERR_[A-Z0-9_]+\b/i)?.[0];
  return code ?? 'network request failed';
}
