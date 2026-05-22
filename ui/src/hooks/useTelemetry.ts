import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import type { TelemetryEvent } from '../types/telemetry';
import { apiFetch, WS_URL } from '../api';

const STATUS_POLL_INTERVAL_MS = 2000;

export function useTelemetry() {
    const {
        processEvent,
        setConnected,
        setOperatorStatus,
        setConnectionError,
        isConnected,
        clearAllTelemetry,
    } = useStore();

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastSessionState = useRef<string | null>(null);
    const lastEngineMode = useRef<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchStatus = async () => {
            const result = await apiFetch<import('../types/telemetry').OperatorStatus>(
                '/api/operator/status',
            );
            if (!isMounted) return;

            if (result.error) {
                // Auth error (401/403) or network failure — show prominently
                setConnectionError(result.error);
                return;
            }

            // Clear any previous error on success
            setConnectionError(null);

            const status = result.data!;
            // Detect transition to idle and clear telemetry
            if (
                lastSessionState.current &&
                lastSessionState.current !== 'idle' &&
                status.sessionState === 'idle' &&
                lastEngineMode.current !== 'replay'
            ) {
                console.log('[Telemetry] Session ended, clearing telemetry state.');
                clearAllTelemetry();
            }
            lastSessionState.current = status.sessionState;
            lastEngineMode.current = status.engineMode;
            setOperatorStatus(status);
        };

        const connect = () => {
            if (
                wsRef.current &&
                (wsRef.current.readyState === WebSocket.OPEN ||
                    wsRef.current.readyState === WebSocket.CONNECTING)
            ) {
                return;
            }

            console.log(`[Telemetry] Connecting to ${WS_URL}...`);
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[Telemetry] Connected.');
                if (isMounted) {
                    setConnected(true);
                    setConnectionError(null);
                    fetchStatus(); // Fetch full status on connect
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as TelemetryEvent;
                    if (isMounted) processEvent(data);
                } catch (err) {
                    console.error('[Telemetry] Failed to parse message:', err);
                }
            };

            ws.onclose = () => {
                console.log('[Telemetry] Disconnected.');
                if (isMounted) {
                    setConnected(false);
                    setConnectionError('WebSocket disconnected — reconnecting…');
                    // Schedule reconnect
                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (isMounted) connect();
                    }, 3000);
                }
                wsRef.current = null;
            };

            ws.onerror = () => {
                // Errors are followed by close — just close to trigger reconnect
                ws.close();
            };
        };

        connect();

        // Status Polling
        statusPollRef.current = setInterval(fetchStatus, STATUS_POLL_INTERVAL_MS);

        return () => {
            isMounted = false;
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (statusPollRef.current) clearInterval(statusPollRef.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { isConnected };
}
