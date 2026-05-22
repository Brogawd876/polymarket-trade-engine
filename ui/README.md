# Operator Cockpit UI

Real-time operator control plane for the Polymarket BTC 5-minute trading engine.

> **This is an operator monitoring and control surface, not a retail exchange UI.**
> It does not expose trading credentials, wallet keys, or signing material.

---

## Purpose

The cockpit gives a local operator visibility into the live engine state:

| Panel | Purpose |
|---|---|
| **Live Monitor** | Main cockpit — all panels below |
| **System Status** | Engine mode, strategy, version, active lifecycles |
| **Round Decision** | Current market round: state, countdown, BTC price, P(UP), gap |
| **Market Book** | Live bid/ask, slippage estimate, spread |
| **Feed Health** | Per-feed status (live / stale / error / forbidden) |
| **Predictive Signals** | Aggregate BTC price, divergence %, lead-lag timing |
| **Why No Trade?** | Full diagnostic: risk blockers, stale feeds, spread/slippage, signal quality |
| **Execution Blotter** | Intent → Risk → Order → Fill → Settlement row trail |
| **Event Timeline** | Raw telemetry event log |
| **Corpus Summary** | Replay/corpus quality, readiness decision, blockers |
| **Session Summary** | Cumulative PnL, replay progress |
| **Control Center** | Start/stop sessions, configure strategy preset |
| **Replay Lab** | Select and start replay from captured fixtures |
| **Strategy Lab** | Multi-strategy batch evaluation on fixture corpus |
| **Live Readiness** | Calibration / readiness gate audit |
| **Diagnostics / Logs** | Raw log viewer |

---

## Environment Variables

Copy `.env.example` to `.env.local` (never commit `.env.local`):

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://127.0.0.1:3000` | REST base URL for the backend |
| `VITE_WS_URL` | `ws://127.0.0.1:3000/telemetry` | WebSocket telemetry URL |
| `VITE_OPERATOR_AUTH_TOKEN` | _(empty)_ | Bearer token for `/api/operator/*`. Mirrors backend `OPERATOR_AUTH_TOKEN`. Leave empty if auth is disabled. |

> ⚠️ `VITE_OPERATOR_AUTH_TOKEN` is a UI-only operator control token, not a wallet key, private key, or trading credential. Do not put signing material here.

---

## Dev / Build / Test

```bash
# Install
bun install

# Dev server (hot reload)
bun run dev

# Lint
bun run lint

# Unit tests (Vitest)
bunx vitest run

# Unit tests (watch mode)
bunx vitest

# Build (production bundle)
bun run build

# Preview production build
bun run preview
```

---

## Architecture

- **Framework**: React 19 + Vite + TypeScript
- **State**: Zustand centralized store (`src/store/index.ts`)
- **Telemetry**: `useTelemetry` hook — WebSocket + REST polling — all state flows through store
- **API client**: `src/api.ts` — shared `apiFetch()` with configurable base URL and optional Bearer auth
- **Routing**: React Router v7
- **Charts**: lightweight-charts (canvas, not React)
- **Styling**: Tailwind CSS v4

### Data flow

```
Engine WebSocket → useTelemetry → processEvent → Zustand store → Panel components
Engine REST API  → useTelemetry → setOperatorStatus → Zustand store → Panel components
```

### Store slices

| Slice | Updated by |
|---|---|
| `isConnected` | `useTelemetry` WS open/close |
| `connectionError` | `useTelemetry` on auth/network failure |
| `operatorStatus` | REST `/api/operator/status` poll |
| `corpusSummary` | `CorpusSummaryPanel` REST poll |
| `feeds` | `FEED_STATUS` telemetry events |
| `markets` | `MARKET_TICK` telemetry events |
| `predictiveAggregate` | `PREDICTIVE_AGGREGATE` events |
| `latestRiskDecisions` | `RISK_DECISION` events |
| `executionRows` | `ORDER_INTENT`, `RISK_DECISION`, `ORDER_LIFECYCLE`, `ROUND_PNL`, `ROUND_RESOLUTION` |
| `decisionSnapshots` | `DECISION_FEATURE_SNAPSHOT` events |

---

## Safety

- No wallet keys, private keys, API secrets, or signing credentials are read or stored.
- `VITE_OPERATOR_AUTH_TOKEN` is kept in module scope inside `api.ts` and never logged or exported.
- The UI cannot place trades — all trade execution is inside the backend engine.
