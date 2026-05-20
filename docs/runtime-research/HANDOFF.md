# Handoff: Profit-Critical Data Foundation And Markout Integration

Current Phase 8B branch: `feat/strategy-lab-markouts`

Starting checkpoint: `a56d2ad fix(data): keep event capture nonfatal and bounded`

Scope completed:

- Added normalized event schema and NDJSON/no-op writers.
- Added narrow runtime event-store integration without touching validated Type 3 auth or market discovery.
- Added replay markout scaffold.
- Added conservative maker fill simulator scaffold.
- Strengthened wallet and settlement inventory invariants.
- Strengthened CI.
- Integrated replay token-side post-fill markout calculation into Strategy Lab summaries.

Not completed:

- Raw websocket L2 delta capture.
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

Choose either raw L2 recorder implementation or conservative fill-model Strategy Lab integration. Raw L2 recorder is preferred if the next objective is better queue/adverse-selection data; conservative fill-model integration is preferred if the next objective is reducing replay fill optimism immediately. Do not tune strategies yet.
