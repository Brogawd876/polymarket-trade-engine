# Handoff: Profit-Critical Data Foundation And Markout Integration

Current Phase 8C branch: `feat/raw-l2-recorder`

Starting checkpoint: `43fae9f docs(research): document markout integration limits`

Scope completed:

- Added `RawL2Recorder` to capture direct Polymarket WS book/delta/trade events.
- Hardened L2 recorder with robust async `enqueueWrite`, explicit `tokenId` mapping, `last_trade_price` semantic fixes, and rigorous test coverage.
- Added `scripts/record-raw-l2.ts` for standalone data capture with `--auto-slug` support.
- Normalized incoming L2 JSON into `events.ts` structure.
- Updated docs to clarify feed-reported limits (e.g. `side` on trades).
- Added normalized event schema and NDJSON/no-op writers.
- Added narrow runtime event-store integration without touching validated Type 3 auth or market discovery.
- Added replay markout scaffold.
- Added conservative maker fill simulator scaffold.
- Integrated replay token-side post-fill markout calculation into Strategy Lab summaries.

Not completed:

- Strategy Lab use of the conservative fill-model outputs as truth.
- Tiny-live execution measurement.
- Any strategy tuning or profitability claim.
- Any ranking/scoring change based on markouts.

Markout notes:

- Markouts are measured where replay fixtures include token-side orderbook observations.
- Unavailable horizons remain null with explicit reasons.
- BTC ticker or generic market price events are not used as token markout prices.
- Strategy Lab still does not prove profitability; it now exposes a better adverse-selection diagnostic.

Next exact task:

Integrate conservative fill-model outputs into Strategy Lab scoring, or proceed to capture a larger corpus of L2 data for validation. Do not tune strategies yet.
