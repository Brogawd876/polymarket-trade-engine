# Active Task: Phase 8L Corpus Calibration

## Current Objective

Build the offline corpus expansion and calibration data layer to extract `CalibrationRecord` features from paired Strategy Lab runs.

## Status

- Code repo branch: `feat/phase8l-corpus-calibration`
- HEAD: Phase 8L completed locally.
- Phase 8L verdict: **PASS**
- Offline calibration dataset extraction is available via `scripts/run-strategy-lab-paired-corpus.ts`.
- Corpus summary and `CalibrationRecord` extraction schema implemented.
- System strictly bounded to offline output; no changes to production readiness gates or profitability claims.
- Captured valid paired corpus including `btc-updown-5m-1779390000` with 5,389 normalized `market_trade` events.
- Paired Strategy Lab confirmed 70 usable fills with real trade-through evidence across 15 runs.
- No strategy tuning, ranking changes, readiness gate changes, or live trading occurred.
- Generated raw L2/replay artifacts remain uncommitted.

## Next Phase

Phase 8M: Calibration Modeling
1. Run the Phase 8L harness on a statistically significant paired corpus.
2. Feed the extracted `CalibrationRecord` JSONL output into a Platt scaling or isotonic regression model.
3. Validate probability correction accuracy against the measured adverse selection base rate.
