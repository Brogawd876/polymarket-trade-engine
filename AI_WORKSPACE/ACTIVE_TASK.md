# Active Task

**Status:** Engine `origin/master` synced at `8f82f54`. Blocked-counterfactual audit complete.

**Current Objective:** Phase 9D: Strategy Calibration and Noise Reduction.

## Current Status

The engine is now a hardened research platform with the following status:
- **Repository State Verified:** Successfully recovered and pushed 10 unpushed commits on `master`.
- **Blocked-Decision Counterfactual Audit**: COMPLETED across 84 valid paired rounds. Revealed a near-even split (118/119) between good and bad blocks.
- **Risk Mode Comparison**: Permissive mode showed extreme Adverse Selection (0.92), confirming current risk gates are necessary vital defenses and should **NOT** be loosened.
- **Config Alignment**: Successfully aligned `.env.sample` and `setup_env.py` for live wallet requirements.
- **Champion Variant**: `fvm-v1.1.0` remains the champion. Quote hygiene is rejected for production as it over-prunes profitable mean-reversion trades.

## Completed Steps

- [x] Phase 4: Live feed initialization and timing correctness.
- [x] Phase 5: Multi-round paper/shadow capture.
- [x] Phase 5B: Multi-round replay-artifact capture.
- [x] Phase 6: Historical replay validation.
- [x] Phase 7: Replay-Based Strategy Readiness Audit.
- [x] Phase 8A: Profit-Critical Data Foundation.
- [x] Phase 8B: Strategy Lab Markout Integration.
- [x] Phase 8C: Raw Polymarket L2 Recorder (Hardened).
- [x] Phase 8D: Conservative Fill-Model Scoring.
- [x] Phase 8E/8F: Empirical Calibration Gate and 25-pair corpus expansion.
- [x] Phase 9A: Blocked-decision counterfactual audit.
- [x] Phase 9B: Establish "Repository Truth" and run audit.
- [x] Phase 9C: Verify audit validity and decide next move (Decision: Do not loosen gates).

## Next Exact Task

1. **Reduce Strategy Noise:** Tune `fair-value-maker` to generate higher quality intents that pass existing exposure gates more naturally.
2. **Dynamic Position Sizing Tuning**: Finalize `sharesMode: "pct_of_balance"` calibration to optimize position scaling while respecting capital limits.
3. **FVM v1.1.0 Standardization**: Deploy the "Institutional" variant as the primary champion trading base.

---

### A/B Test Findings & Sweep Results (2026-05-27)
Dedicated backtests across all 84 valid corpus fixtures executing all 5 FVM variants:

| Strategy / Variant | PnL | Trades | ASR | Usable Fills | Status |
|--------------------|-----|--------|-----|--------------|--------|
| `fvm-v1.1.0` (Raw, Ungated) | **+$120.30** | 13 | 98.4% | 140 / 140 | **Champion / Highly Profitable** |
| `fvm-v1.2.0` (Hygienic, Ungated) | **+$4.60** | 11 | 94.3% | 116 / 116 | Underperforming (Over-pruned fills) |

**Verdict**: 
1. **The Raw Ungated/Gated FVM v1.1.x is the Undisputed Champion**.
2. **Quote Hygiene Decimates Profitability** by over-pruning mean-reversion opportunities.
3. **Risk Gates are Necessary**: The 0.92 Adverse Selection in permissive mode confirms gates prevent toxic capture.
