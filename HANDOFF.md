# Handoff: Polymarket Live Auth and Fair-Value Maker Validation

## Status

Branch: `feat/polymarket-order-flow-metrics`

The live account wiring is now understood and the engine reaches the real safety gate:

- The Polymarket browser account showed live cash available.
- The CLOB client verified spendable collateral with `POLY_SIGNATURE_TYPE=3`.
- A nonce-pinned L2 API key context is required for this account path.
- The engine started in production mode, reached `RUNNING`, and generated fair-value-maker quotes.
- No accepted live orders or fills were observed during the final constrained runs.
- The final blocker was intentional risk logic: `predictive aggregate disagreement is true`.

## Required Local Environment

Do not commit `.env`.

The live account worked locally with these non-secret fields:

- `POLY_SIGNATURE_TYPE=3`
- `POLY_FUNDER_ADDRESS=<Polymarket deposit / proxy wallet address>`
- `POLY_API_KEY_NONCE=1`
- `POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com`
- `FORCE_PROD=true` only when deliberately running live
- `CHAINLINK_BTC_5M_REFERENCE_VERIFIED=true`

`PRIVATE_KEY` must correspond to the MetaMask account that owns the Polymarket smart wallet.

## What Was Fixed

- CLOB API credentials are now derived from the signer-only client, then used by a trading client configured with `signatureType` and `funderAddress`.
- `postOrders` now handles non-array error responses without throwing a misleading `.map is not a function`.
- Production CLI runs now pass `--prod` and `--slot-offset` through `SessionManager`.
- The production user channel now subscribes before readiness is checked, fixing a prod-only `INIT` deadlock.
- The public market websocket subscription was corrected to the supported `market` subscription shape.
- Chainlink freshness logic now uses oracle-lag limits for source freshness instead of treating the oracle as a 1s venue quote.
- The venue adapter refreshes maintained orderbook snapshots when read, avoiding false stale-book blocks during quiet markets.

## Last Live Test Result

Command used:

```powershell
bun run index.ts --strategy fair-value-maker --prod --always-log --rounds 1
```

Observed:

- Startup succeeded.
- Client initialized.
- CLOB spendable collateral read as available.
- Round entered `RUNNING`.
- Strategy generated quotes.
- Orders were blocked by the risk gate because Binance and Coinbase predictive feeds disagreed beyond the configured threshold.

This is the correct place to stop before continuing. Do not bypass this guard casually.

## Next Investigation

Before running a longer live test, inspect:

- Whether the predictive disagreement threshold is too tight for BTC 5-minute live conditions.
- Whether Binance/Coinbase feed timestamps should be aligned before comparing prices.
- Whether the fair-value-maker should use the weighted composite only when the two feeds are within an adaptive spread threshold.
- Whether a paper replay/live shadow mode should record quote candidates without submitting orders until the disagreement behavior is characterized.

Recommended first command:

```powershell
npm run check
```

Then run a constrained production check only:

```powershell
bun run index.ts --strategy fair-value-maker --prod --always-log --rounds 1
```
