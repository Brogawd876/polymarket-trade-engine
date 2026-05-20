# Data Foundation Plan

## Implemented In This Tranche

- Typed profit-critical event schema in `engine/event-store/events.ts`.
- Append-only NDJSON writer and no-op writer in `engine/event-store/writer.ts`.
- Runtime scaffold that mirrors run start/completion, price anchor, strategy/risk decisions, order lifecycle, spread/depth snapshots, and settlement result.
- Replay markout calculator scaffold in `engine/replay/markout.ts`.
- Conservative queue-aware fill model scaffold in `engine/replay/fill-model.ts`.
- Wallet invariant tests and fail-fast checks for impossible sell/settlement inventory.
- CI now runs `bun run check` and focused data-foundation tests.

## Next Wiring Tasks

1. Capture raw `OrderBook.handleMessage` websocket book/delta/trade messages into the event writer with receive timestamps.
2. Persist Binance/Coinbase price ticks and feed freshness events directly from adapters.
3. Feed markout outputs into Strategy Lab execution summaries.
4. Replace optimistic replay fill scoring with the conservative fill model behind an explicit option, then make it the default for research metrics.
5. Add maker/taker and fee/rebate event emission for every fill; rebates must remain estimates, not guaranteed PnL.

## Go/No-Go Gates

- Do not tune strategy until markouts and pessimistic fills are populated.
- Do not tiny-live until maker/taker classification and fail-closed risk limits are in evidence.
- Do not scale until tiny-live maker fills show positive expected markout and simulator/live fill behavior aligns.
