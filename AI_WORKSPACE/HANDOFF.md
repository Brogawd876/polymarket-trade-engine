# AI Workspace Handoff

## Current State

- Repository: `polymarket-trade-engine`
- Branch: `feat/phase8l-corpus-calibration`
- HEAD: Phase 8L completed locally.
- Phase: Phase 8L offline calibration dataset extraction is available. complete

## Recently Completed: Phase 8L

Phase 8L successfully built the offline corpus expansion harness and calibration record extraction framework.

### What Changed

- **Corpus Expansion Harness:** Modified `scripts/run-strategy-lab-paired-corpus.ts` to process entire directories of paired corpus manifests and output aggregated metrics and JSON/JSONL datasets.
- **Calibration Record Schema:** Created `engine/replay/calibration-extractor.ts` to map offline strategy variant results into a flat `CalibrationRecord` suitable for Platt scaling or isotonic regression models.
- **Data Quality Preservation:** System explicitly logs missing reasons for metrics (like missing 1s, 5s, 30s markouts) and does not fake profitability or backfill unsupported values.
- **Live Isolation:** Maintained strict isolation from live trading logic and did not alter Strategy Lab ranking weights or readiness gates.

### Corpus Status

- **Latest Valid Pair:** `btc-updown-5m-1779390000`
- **Market Trades:** 5,389 normalized prints (for this pair alone).
- **Evidence Proof:** 70 usable fills confirmed via real trade-throughs across 15 runs.
- **Metric Insight:** Identified a 95.2% adverse selection rate on uncalibrated market making.

## Next Up: Calibration Modeling

Build isotonic regression or Platt scaling calibration models to correct probabilities based on the offline `CalibrationRecord` corpus.

## Constraints & Rules

- Do not commit generated NDJSON, pair manifests, or replay log files.
- Do not tune strategies.
- Do not change Strategy Lab ranking weights.
- Do not change Live Readiness Gates.
- Do not claim profitability.
