# Current Active Task

**Objective:** Phase 8V / Capture Orchestration Fix, then Phase 8T Corpus Expansion

**Status:** Phase 8V implemented and smoke-tested locally. Phase 8T corpus expansion should continue only with clean valid/rejected output directories.

**Branch:** `master` plus local Phase 8V changes.

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

## Current Corpus State

- Legacy `data/pairs` contains 7 usable valid pairs after salvaging `btc-updown-5m-1779638100`.
- Legacy `data/pairs` may fail the capture-quality audit because old invalid/partial manifests remain there as diagnostics.
- Clean `data/pairs-clean` contains 1 valid complete smoke pair: `btc-updown-5m-1779643200`.
- Clean `data/pairs-rejected` had no rejected manifests after the smoke.
- Readiness is still blocked due to insufficient sample count and temporal spread.

## Next Step

Resume controlled corpus capture with clean directories:

```powershell
bun scripts/capture-calibration-corpus.ts --target-valid-pairs 25 --max-attempts 40 --slot-offset 1 --pairs-dir data/pairs-clean --invalid-pairs-dir data/pairs-rejected
```

Audit the clean output before and after capture batches:

```powershell
bun scripts/audit-capture-quality.ts --pairs-dir data/pairs-clean
```

Do not move to model training, strategy tuning, paper trading, or live trading yet.
