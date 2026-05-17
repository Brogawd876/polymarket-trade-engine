import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import type { TelemetryEvent, SystemStatus } from '../types/telemetry';

const WEBSOCKET_URL = "ws://127.0.0.1:3000/telemetry";
const REST_STATUS_URL = "http://127.0.0.1:3000/api/status";

export function useTelemetry() {
    const { processEvent, setConnected, setSystemStatus, isConnected } = useStore();
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchStatus = async () => {
            try {
                const res = await fetch(REST_STATUS_URL);
                if (res.ok) {
                    const status = await res.json() as SystemStatus;
                    if (isMounted) setSystemStatus(status);
                }
            } catch (err) {
                console.error("Failed to fetch system status:", err);
            }
        };

        const connect = () => {
            if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
                return;
            }

            console.log(`[Telemetry] Connecting to ${WEBSOCKET_URL}...`);
            const ws = new WebSocket(WEBSOCKET_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("[Telemetry] Connected.");
                if (isMounted) {
                    setConnected(true);
                    fetchStatus(); // Fetch full status on connect
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as TelemetryEvent;
                    if (isMounted) processEvent(data);
                } catch (err) {
                    console.error("[Telemetry] Failed to parse message:", err);
                }
            };

            ws.onclose = () => {
                console.log("[Telemetry] Disconnected.");
                if (isMounted) {
                    setConnected(false);
                    // Schedule reconnect
                    reconnectTimeoutRef.current = setTimeout(connect, 3000);
                }
                wsRef.current = null;
            };

            ws.onerror = (err) => {
                console.error("[Telemetry] WebSocket error:", err);
                ws.close();
            };
        };

        connect();

        return () => {
            isMounted = false;
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [processEvent, setConnected, setSystemStatus]);

    return { isConnected };
}
