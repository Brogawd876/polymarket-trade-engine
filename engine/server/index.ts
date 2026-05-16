import { type Server, type ServerWebSocket } from "bun";
import { TelemetryBus, type TelemetryEvent } from "../telemetry/index.ts";
import type { EarlyBird } from "../early-bird.ts";

export type ControlServerOptions = {
  port?: number;
  telemetryBus: TelemetryBus;
  bot: EarlyBird;
  allowedOrigins?: string[];
};

/**
 * ControlPlane Server using Bun.serve.
 * Provides a WebSocket telemetry stream and REST control endpoints.
 */
export class ControlServer {
  private _server?: Server<{ sessionId: string }>;
  private _telemetryBus: TelemetryBus;
  private _bot: EarlyBird;
  private _port: number;
  private _allowedOrigins: Set<string>;

  constructor(opts: ControlServerOptions) {
    this._port = opts.port ?? 3000;
    this._telemetryBus = opts.telemetryBus;
    this._bot = opts.bot;
    this._allowedOrigins = new Set(opts.allowedOrigins ?? ["http://localhost:3000", "http://127.0.0.1:3000"]);
  }

  start() {
    const bus = this._telemetryBus;
    const allowedOrigins = this._allowedOrigins;

    this._server = Bun.serve<{ sessionId: string }>({
      port: this._port,
      hostname: "127.0.0.1", // Bind to localhost only for security
      
      fetch: async (req, server) => {
        const url = new URL(req.url);
        const origin = req.headers.get("origin");

        // Security: Origin validation
        if (origin && !allowedOrigins.has(origin)) {
            return new Response("Unauthorized Origin", { status: 403 });
        }

        // WebSocket Telemetry Path
        if (url.pathname === "/telemetry") {
          const success = server.upgrade(req, {
            data: { sessionId: crypto.randomUUID() },
          });
          return success
            ? undefined
            : new Response("WebSocket upgrade failed", { status: 400 });
        }

        // REST Endpoints
        if (url.pathname === "/api/status") {
            return Response.json(this._bot.getStatus());
        }

        if (url.pathname === "/api/health") {
            return new Response("OK");
        }

        return new Response("Not Found", { status: 404 });
      },

      websocket: {
        open: (ws) => {
          console.log(`[ControlServer] Telemetry client connected: ${ws.data.sessionId}`);
          // Subscribe this specific WS to the bus
          const unsubscribe = bus.subscribe((event: TelemetryEvent) => {
            ws.send(JSON.stringify(event));
          });
          (ws as any)._unsubscribe = unsubscribe;
        },
        message: (_ws, message) => {
          // Handle incoming commands via WS if needed
          console.log(`[ControlServer] Received message: ${message}`);
        },
        close: (ws) => {
          console.log(`[ControlServer] Telemetry client disconnected: ${ws.data.sessionId}`);
          if ((ws as any)._unsubscribe) {
              (ws as any)._unsubscribe();
          }
        },
      },
    });

    console.log(`[ControlServer] Listening on http://127.0.0.1:${this._port}`);
  }

  stop() {
    this._server?.stop();
    this._server = undefined;
  }
}
