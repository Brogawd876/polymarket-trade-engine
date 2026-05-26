# AI Workspace Handoff

## Current State

- Repository: `polymarket-trade-engine`
- Branch at close: `capture/controlled-corpus-expansion`
- Remote state: branch was aligned with `origin/master` at `b006de7` before this closing checkpoint.
- Phase: Phase 9A preparation, but readiness remains blocked.
- Safety boundary: simulation/paper/replay only. No live trading, no production risk relaxation, no profitability claim.

## Final Corpus and Calibration State

The full Phase 8 corpus/calibration pipeline completed after the earlier capture-orchestration fixes.

Current final artifacts:

- Paired corpus: `data/pairs`
- Final pipeline output: `data/calibration-run-final-25`
- One-round paper/shadow replay artifact: `logs/early-bird-btc-updown-5m-1779833100.log`

Final 25-pair calibration results:

- 25 valid complete pairs used.
- 75 Strategy Lab runs completed: 25 pairs x 3 variants.
- 0 failed and 0 canceled Strategy Lab runs.
- 27,498 calibration records generated.
- 23,523 trade-print-backed labeled records.
- 478 conservative fill events.
- Global readiness decision: `BLOCKED`.
- No candidate is `paper_candidate`.

Strategy tournament summary:

- `late-entry`
  - 25 runs.
  - 0 trades.
  - $0.00 total PnL.
- `late-entry-flow-aware`
  - 25 runs.
  - 0 trades.
  - $0.00 total PnL.
- `fair-value-maker`
  - 25 runs.
  - Trade-active in all 25.
  - -$48.40 total PnL.
  - Average PnL: -$1.936.
  - Best PnL: +$26.55.
  - Worst PnL: -$34.45.
  - Conservative adverse-selection rate: 94.15%.
  - Conservative 5s markout: about -0.0569.

Final readiness interpretation:

- The data and replay/calibration machinery are useful.
- The strategies are not ready for live deployment or larger paper automation.
- `fair-value-maker` participates but is still adversely selected.
- The late-entry variants are currently execution-starved.
- More paper collection before quote/risk diagnostics would likely add noisy examples rather than improve the system.

## Paper Shadow Run Result

One paper/sim round was run:

```powershell
bun index.ts --strategy fair-value-maker --rounds 1 --always-log
```

Result:

- Slug: `btc-updown-5m-1779833100`
- Strategy: `fair-value-maker`
- Settlement: `DOWN`
- Open: 75817.46157340691
- Close: 75740.96830327988
- Orders approved: 0
- Fills: 0
- Final PnL: $0.00
- Replay fixture validation: valid/replayable.

Important diagnostic:

- 303 BUY intents were blocked.
- All 303 were blocked for `predictive aggregate disagreement is true`.
- Direction-only hindsight: 163/303 blocked intents were on the winning `DOWN` side.
- That is not enough to call the blocks wrong because maker fill realism, duplicate intents, wallet exposure, inventory, fees, and markouts were not counterfactually scored.

## Next Exact Task

Build a blocked-decision counterfactual audit before collecting more paper/shadow rounds.

Recommended deliverable:

```powershell
bun scripts/audit-blocked-counterfactuals.ts --pairs-dir data/pairs --out-json data/reports/blocked-counterfactuals.json --out-md data/reports/blocked-counterfactuals.md
```

The audit should classify each blocked intent:

- strategy / variant / slug / timestamp
- side / action / price / shares
- block reason(s)
- maker or taker execution model
- would-fill verdict
- fill evidence type: `no_fill`, `touch_only`, `probable_fill`, `trade_through_fill`, `unknown`
- markout 1s / 5s / 30s
- adverse-selection flag
- settlement direction
- hypothetical PnL
- verdict: `good_block`, `bad_block`, `inconclusive`, `blocked_but_no_fill`, or `unrealistic_duplicate`

Also consider adding a replay-only risk mode:

- `normal`
- `permissive-counterfactual`
- `selective-counterfactual`

Hard requirement: permissive/counterfactual risk bypass must be impossible to use in live/prod mode.

## Quote Hygiene Work To Do

- Prevent saturated fair-value probabilities from producing near-max maker bids like `0.94`.
- Prevent negative candidate quote logging.
- Move predictive-disagreement and stale-feed checks before quote generation where possible.
- Deduplicate or throttle repeated blocked intents.
- Compare normal Strategy Lab vs permissive/counterfactual Strategy Lab only as diagnostic evidence, not profitability proof.

## Verification Already Completed Earlier

The latest final artifacts were produced by the completed capture/calibration runs. During this closing pass, no strategy logic, live execution path, risk gate, or order-placement behavior was changed.
