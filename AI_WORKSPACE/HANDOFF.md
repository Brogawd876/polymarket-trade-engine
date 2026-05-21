# Handoff: Phase 8J Trade-Print Source Audit

## Current Status

Branch: `feat/trade-print-source-audit`

Phase 8J proved where reliable public Polymarket trade-print evidence comes from and repaired raw L2 normalization without changing strategy logic, ranking weights, readiness gates, live trading behavior, or conservative fill scoring semantics.

## Changes

- `engine/recorders/raw-l2-recorder.ts` now treats complete Polymarket market-channel `last_trade_price` messages as public trade prints and emits a paired `market_trade` event when token ID, price, size, and timestamp are all present.
- Incomplete `last_trade_price` messages are still recorded as `last_trade_price` only; they do not become trade-through evidence.
- Added `scripts/probe-polymarket-trade-prints.ts` to compare market WebSocket, CLOB last-trade-price, and Data API trades for an active BTC 5-minute market.
- Added recorder tests proving incomplete last-trade messages stay weak and complete trade prints become `market_trade`.

## Source Findings

- Official Polymarket docs state the market WebSocket receives trade executions and defines `last_trade_price` as emitted when maker and taker orders match.
- Live probe on `btc-updown-5m-1779377400` saw 75 market-WS trade-like messages in 10 seconds with token ID, price, size, timestamp, and market match.
- CLOB last-trade-price endpoints return price/side snapshots without size/timestamp, so they are Tier 3 reference data only.
- Data API trades return public trade rows with token, price, size, timestamp, and slug/condition match, but observed samples lagged the market WS.

## Capture Result

- Short repaired-recorder capture on `btc-updown-5m-1779377400` produced 201 normalized `market_trade` events.
- Paired capture attempt on `btc-updown-5m-1779377700` produced complete raw L2 coverage with 3,874 `market_trade` events, but the pair manifest is invalid because recorder shutdown was recorded as `null` and embedded Strategy Lab validation timed out.
- Generated `data/` and `logs/` artifacts remain uncommitted.

## Interpretation

The public trade-print source exists and the repaired recorder can normalize it into scorer-ready `market_trade`. The old corpus still cannot prove realistic maker execution because its normalized files have zero `market_trade`. A clean valid paired capture is now the next blocker, not strategy tuning.

## Validation

- `bun run check` passed.
- `bun test --max-concurrency=1 test/engine/recorders/raw-l2-recorder.test.ts` passed.
- Probe command completed:
  - `bun scripts/probe-polymarket-trade-prints.ts --duration-ms 10000 --min-seconds-remaining 90`

## Next Exact Task

Phase 8K should harden paired capture validation:

1. Treat expected SIGINT recorder shutdown as success when the recorder writes `recorder_completed`.
2. Bound and report Strategy Lab validation for a just-captured pair.
3. Capture one clean valid paired BTC 5-minute corpus with normalized `market_trade`.
4. Rerun paired Strategy Lab and require trade-through evidence before any strategy tuning.
