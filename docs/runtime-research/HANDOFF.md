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

Phase 8H update:

- Paired Strategy Lab corpus execution and zero-fill-evidence diagnosis completed on `feat/paired-corpus-zero-fill-diagnostics`.
- Clean late-entry paired captures produce no eligible fills, so `unavailable_no_fills` is correct for those runs.
- All inspected raw L2 captures contain book events and `last_trade_price`, but zero `market_trade` events.
- Active Strategy Lab variants can produce candidate fills, but replay token IDs currently default to `replay-up` / `replay-down` while raw L2 uses real CLOB token IDs. This prevents conservative scorer token matching.
- Strategy Lab replay can append generated output back into source slug replay logs, so corpus inputs must be protected before more paired execution.

Next exact task:

First make Strategy Lab replay execution immutable-safe and pass real paired CLOB token IDs into replay venue metadata. Then add a synthetic fill-bearing paired fixture with `market_trade` evidence before larger corpus capture or strategy tuning. Do not tune strategies yet.
