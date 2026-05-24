# Current Active Task

**Objective:** Phase 8V / Capture Orchestration Fix, then Phase 8T Corpus Expansion

**Status:** Phase 8V implemented and smoke-tested locally. Phase 8T corpus expansion is paused pending strategy/quote hygiene audit.

**Branch:** `master`

## Work done

1. Phase 8U capture-quality hardening was already completed and merged.
2. A 2026-05-24 background corpus capture run was stopped because it started producing mostly partial pairs.
3. The salvageable artifact from that run is `btc-updown-5m-1779638100`, which is valid and complete.
4. Old partial pairs from the stopped run remain diagnostic only and should not be used as clean calibration corpus inputs.
5. Phase 8V fixed capture orchestration:
   - stable relative `--slot-offset`
   - duplicate-artifact skipping
   - clean valid/rejected output directory support
   - strict paired-capture exit semantics
   - watchdog timeout for stuck capture attempts
6. A controlled smoke capture wrote `btc-updown-5m-1779643200` to `data/pairs-clean` as a valid complete pair.
7. A longer 25-pair capture was started, then intentionally stopped on 2026-05-24 after repeated extreme simulated quotes (`BUY UP @ 0.94`) showed a strategy/quote hygiene issue worth investigating before collecting more corpus.

## Current Corpus State

- Legacy `data/pairs` contains 7 usable valid pairs after salvaging `btc-updown-5m-1779638100`.
- Legacy `data/pairs` may fail the capture-quality audit because old invalid/partial manifests remain there as diagnostics.
- Clean `data/pairs-clean` contains 5 valid complete pairs:
  - `btc-updown-5m-1779643200`
  - `btc-updown-5m-1779644100`
  - `btc-updown-5m-1779644700`
  - `btc-updown-5m-1779645300`
  - `btc-updown-5m-1779645900`
- Clean `data/pairs-rejected` has no rejected manifests from the run.
- Latest clean audit reported 5 valid, 0 invalid, complete coverage for all 5, 1,707,270 raw L2 events, and 13,316 raw L2 trade events.
- Readiness is still blocked due to insufficient sample count and temporal spread.

## Next Step

Audit strategy and shared quote/execution hygiene before collecting more corpus:

- Identify all strategy modules and shared quote-building paths.
- Measure extreme quote rate, duplicate blocked-intent rate, blocked rate, fill behavior, and usable/not-usable status per strategy.
- Investigate why the fair-value path repeatedly emits clamped near-max bids such as `0.94` while the risk gate blocks them.
- Decide whether saturated probabilities should become `no quote`, whether blocked duplicate intents should be throttled/deduped, and whether disagreement/stale-feed states should prevent quote generation earlier.

Audit the clean output before and after capture batches:

```powershell
bun scripts/audit-capture-quality.ts --pairs-dir data/pairs-clean
```

Do not move to model training, strategy tuning, paper trading, or live trading yet.
