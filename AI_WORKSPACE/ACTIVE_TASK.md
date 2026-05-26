# Current Active Task

**Objective:** Phase 9A preparation: strategy quote hygiene plus blocked-decision counterfactual audit.

**Status:** Final 25-pair calibration corpus exists and the first one-round paper shadow completed, but readiness remains blocked. Do not collect more live paper/shadow rounds until strategy behavior is cleaner and blocked decisions are audited.

**Branch:** `capture/controlled-corpus-expansion` at `origin/master` (`b006de7` before this closing checkpoint).

## Work Done

1. Phase 8U/8V capture hardening and orchestration fixes are merged on `origin/master`.
2. `data/pairs` now contains exactly 25 valid complete paired replay/L2 manifests used by the final calibration run.
3. Final calibration pipeline completed in `data/calibration-run-final-25`:
   - 75 Strategy Lab runs: 25 pairs x 3 variants.
   - 27,498 calibration records.
   - 23,523 trade-print-backed labeled records.
   - 478 conservative fill events.
   - Global readiness decision: `BLOCKED`.
4. Strategy performance from the final replay tournament:
   - `late-entry`: 25 runs, 0 trades, $0.00 PnL.
   - `late-entry-flow-aware`: 25 runs, 0 trades, $0.00 PnL.
   - `fair-value-maker`: 25 runs, 25 trade-active rounds, -$48.40 total PnL, 94.15% conservative adverse-selection rate.
5. A one-round live paper/sim shadow run completed for `btc-updown-5m-1779833100`:
   - Strategy: `fair-value-maker`.
   - Result: resolved `DOWN`, 0 fills, $0.00 PnL.
   - Generated 303 blocked BUY intents, all blocked because `predictive aggregate disagreement is true`.
   - Direction-only hindsight showed 163/303 blocked intents were on the winning side, but this is not execution-realistic evidence.

## Current Interpretation

- The capture/calibration machinery works and is producing useful diagnostics.
- The strategies are not ready for live or paper-scale deployment.
- `fair-value-maker` still shows toxic maker behavior under realistic fill scoring.
- The risk gate may be protective, overly strict, or both; the project cannot know until blocked decisions are scored counterfactually.
- Continuing paper/shadow collection before fixing quote hygiene will likely generate more noisy examples of the same failure modes.

## Next Step

Build a replay-only blocked-decision counterfactual audit before any more paper/shadow collection:

- For every blocked intent, score whether it would realistically fill.
- For maker strategies, use raw L2 and the conservative maker fill scorer.
- For late-entry variants, evaluate a taker/cross-spread counterfactual separately from maker fills.
- Report markout 1s/5s/30s, settlement result, hypothetical PnL, and block verdict by strategy and block reason.
- Add an explicit replay-only permissive risk mode only if it cannot be used in live/prod.

Also fix quote hygiene:

- Stop saturated fair-value probabilities from emitting near-max bids like `0.94`.
- Prevent negative candidate quote logging.
- Move predictive-disagreement/stale-feed checks before quote generation where possible.
- Deduplicate or throttle repeated blocked intents.

Do not claim profitability. Do not relax production risk gates. Do not run live trading.
