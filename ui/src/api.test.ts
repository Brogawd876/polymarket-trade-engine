/**
 * Tests for the shared API client (ui/src/api.ts).
 *
 * Covers:
 *   1. URL config — API_BASE and WS_URL resolve from env vars with correct defaults
 *   2. Auth header injection — apiFetch sends Authorization: Bearer when token is set
 *   3. No-auth path — header is absent when token is unset
 *   4. Connection failure — apiFetch returns { data: null, error: <message>, status: null }
 *   5. Auth error responses (401, 403) — surface a clear error string
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Re-import the module after setting env vars so module-level code re-runs. */
async function importApi() {
    // ESM module cache is reset per test via vi.resetModules()
    return import("./api");
}

// ── URL config ────────────────────────────────────────────────────────────────

describe('API client URL config', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('uses default API_BASE when VITE_API_BASE_URL is not set', async () => {
        vi.stubEnv('VITE_API_BASE_URL', '');
        const { API_BASE } = await importApi();
        expect(API_BASE).toBe('http://127.0.0.1:3000');
    });

    it('uses VITE_API_BASE_URL when set', async () => {
        vi.stubEnv('VITE_API_BASE_URL', 'http://10.0.0.5:4000');
        const { API_BASE } = await importApi();
        expect(API_BASE).toBe('http://10.0.0.5:4000');
    });

    it('strips trailing slash from VITE_API_BASE_URL', async () => {
        vi.stubEnv('VITE_API_BASE_URL', 'http://10.0.0.5:4000/');
        const { API_BASE } = await importApi();
        expect(API_BASE).toBe('http://10.0.0.5:4000');
    });

    it('uses VITE_WS_URL when set', async () => {
        vi.stubEnv('VITE_WS_URL', 'ws://myhost:9000/ws');
        const { WS_URL } = await importApi();
        expect(WS_URL).toBe('ws://myhost:9000/ws');
    });

    it('derives WS_URL from API_BASE when VITE_WS_URL is not set', async () => {
        vi.stubEnv('VITE_API_BASE_URL', 'http://10.0.0.5:4000');
        vi.stubEnv('VITE_WS_URL', '');
        const { WS_URL } = await importApi();
        expect(WS_URL).toBe('ws://10.0.0.5:4000/telemetry');
    });
});

// ── Auth header injection ─────────────────────────────────────────────────────

describe('apiFetch auth header injection', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('sends Authorization: Bearer when VITE_OPERATOR_AUTH_TOKEN is set', async () => {
        vi.stubEnv('VITE_OPERATOR_AUTH_TOKEN', 'test-secret-token');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

        const { apiFetch } = await importApi();
        await apiFetch('/api/operator/status');

        expect(fetchSpy).toHaveBeenCalledOnce();
        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer test-secret-token');
    });

    it('does NOT send Authorization header when VITE_OPERATOR_AUTH_TOKEN is not set', async () => {
        vi.stubEnv('VITE_OPERATOR_AUTH_TOKEN', '');
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

        const { apiFetch } = await importApi();
        await apiFetch('/api/operator/status');

        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(headers['Authorization']).toBeUndefined();
    });
});

// ── Connection failure ────────────────────────────────────────────────────────

describe('apiFetch connection failure handling', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, 'fetch');
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    afterEach(() => {
        fetchSpy.mockRestore();
        vi.resetModules();
    });

    it('returns error object on network failure', async () => {
        fetchSpy.mockRejectedValue(new Error('Failed to fetch'));
        const { apiFetch } = await importApi();
        const result = await apiFetch('/api/operator/status');

        expect(result.data).toBeNull();
        expect(result.status).toBeNull();
        expect(result.error).toContain('Network error');
    });

    it('returns auth error on 401', async () => {
        fetchSpy.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
        const { apiFetch } = await importApi();
        const result = await apiFetch('/api/operator/status');

        expect(result.data).toBeNull();
        expect(result.status).toBe(401);
        expect(result.error).toContain('401');
        expect(result.error).toContain('VITE_OPERATOR_AUTH_TOKEN');
    });

    it('returns auth error on 403', async () => {
        fetchSpy.mockResolvedValue(new Response('Forbidden', { status: 403 }));
        const { apiFetch } = await importApi();
        const result = await apiFetch('/api/operator/status');

        expect(result.data).toBeNull();
        expect(result.status).toBe(403);
        expect(result.error).toContain('403');
    });

    it('returns server error on 500', async () => {
        fetchSpy.mockResolvedValue(new Response('Internal error', { status: 500 }));
        const { apiFetch } = await importApi();
        const result = await apiFetch('/api/operator/status');

        expect(result.data).toBeNull();
        expect(result.status).toBe(500);
        expect(result.error).toContain('500');
    });

    it('returns data on 200 ok', async () => {
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ sessionState: 'idle' }), { status: 200 }));
        const { apiFetch } = await importApi();
        const result = await apiFetch<{ sessionState: string }>('/api/operator/status');

        expect(result.error).toBeNull();
        expect(result.data?.sessionState).toBe('idle');
    });
});
