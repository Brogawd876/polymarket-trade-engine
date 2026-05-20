# Handoff: Profit-Critical Data Foundation

Branch: `feat/profit-critical-data-foundation`

Starting checkpoint: `d1c6af3 fix(replay): propagate strategy through operator replay path`

Scope completed:

- Added normalized event schema and NDJSON/no-op writers.
- Added narrow runtime event-store integration without touching validated Type 3 auth or market discovery.
- Added replay markout scaffold.
- Added conservative maker fill simulator scaffold.
- Strengthened wallet and settlement inventory invariants.
- Strengthened CI.

Not completed:

- Raw websocket L2 delta capture.
- Strategy Lab use of markout/fill-model outputs.
- Tiny-live execution measurement.
- Any strategy tuning or profitability claim.

Next exact task:

Wire `OrderBook.handleMessage` into an optional raw event observer and record `market_book_snapshot`, `market_book_delta`, and `market_trade` with receive timestamps. Then add replay fixture tests proving raw events can reconstruct top-of-book state.
