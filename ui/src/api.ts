/**
 * Shared API client for the Operator Cockpit.
 *
 * Reads backend connection settings from Vite env vars:
 *   VITE_API_BASE_URL      — REST base URL  (default: http://127.0.0.1:3000)
 *   VITE_WS_URL            — WebSocket URL  (default: ws://127.0.0.1:3000/telemetry)
 *   VITE_OPERATOR_AUTH_TOKEN — Optional Bearer token for /api/operator/* endpoints.
 *                              Mirrors backend env var OPERATOR_AUTH_TOKEN.
 *                              NEVER log or expose this value to users.
 *
 * All outbound token handling happens inside apiFetch(). Components and hooks
 * must NOT read VITE_OPERATOR_AUTH_TOKEN directly — use apiFetch() so the
 * secret is not scattered across the codebase.
 */

/** REST base URL (no trailing slash). */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:3000';

/** WebSocket telemetry URL. */
export const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ||
  `${API_BASE.replace(/^http/, 'ws')}/telemetry`;

/** Operator REST endpoints base path. */
export const OPERATOR_API = `${API_BASE}/api/operator`;

// Token is kept in module scope — not exported — to prevent accidental logging.
const _operatorToken: string | undefined =
  import.meta.env.VITE_OPERATOR_AUTH_TOKEN as string | undefined;

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
  status: number | null;
}

/**
 * Thin fetch wrapper that:
 *  - Builds the full URL from API_BASE + path.
 *  - Injects `Authorization: Bearer <token>` if VITE_OPERATOR_AUTH_TOKEN is set.
 *  - Returns a typed `ApiResult<T>` so callers can handle auth/network errors
 *    explicitly without try/catch at every call site.
 *
 * @param path  Path relative to API_BASE (must start with /).
 * @param init  Optional RequestInit (method, body, etc.).
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (_operatorToken) {
    headers['Authorization'] = `Bearer ${_operatorToken}`;
  }

  try {
    const res = await fetch(url, { ...init, headers });
    if (res.ok) {
      const data = (await res.json()) as T;
      return { data, error: null, status: res.status };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        data: null,
        error: `Auth error ${res.status}: check VITE_OPERATOR_AUTH_TOKEN`,
        status: res.status,
      };
    }
    return {
      data: null,
      error: `Server error ${res.status}`,
      status: res.status,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: null, error: `Network error: ${msg}`, status: null };
  }
}
