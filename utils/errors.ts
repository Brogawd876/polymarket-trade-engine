/**
 * TerminalAccessError represents a non-retryable failure to access
 * external infrastructure, typically due to region restrictions (geoblocking)
 * or explicit IP blacklisting.
 */
export class TerminalAccessError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: string) {
    super(message);
    this.name = "TerminalAccessError";
  }
}

/**
 * Heuristic check to see if a response body looks like a Cloudflare or 
 * provider-level block page.
 */
export function isBlockedBody(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.includes("access denied") ||
    lower.includes("error code 1020") ||
    lower.includes("restricted access") ||
    lower.includes("not available in your country") ||
    lower.includes("cloudflare") && lower.includes("403")
  );
}
