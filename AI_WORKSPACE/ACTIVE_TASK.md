# Active Task: Phase 8N Offline Calibration Feature Comparison

## Current Objective

Compare candidate calibration score fields against adverse-selection and markout-derived labels using explicit train/holdout separation.

## Status

- Code repo branch: `feat/phase8n-calibration-holdout-validation`
- Phase 8N verdict: implemented locally.
- Added offline feature comparison in `engine/replay/calibration-feature-comparison.ts`.
- Added CLI runner `scripts/compare-offline-calibration-features.ts`.
- Added focused tests in `test/engine/calibration-feature-comparison.test.ts`.
- No live execution, live risk gate, order placement, runtime strategy, Strategy Lab ranking, readiness gate, or profitability-claim changes.
- Generated `data/` artifacts remain uncommitted.

## Local Holdout Run

```bash
bun scripts/compare-offline-calibration-features.ts --input data/reports/phase8l-calibration.jsonl --out-json data/reports/phase8n-calibration-feature-comparison.json
```

Headline:

- total records: 1,050
- valid labeled rows for `fillPrice` comparisons: 585
- train/holdout: 409 / 176
- `fillPrice -> adverseSelection` holdout Brier: 0.015955
- `fillPrice -> adverseSelection` holdout log loss: 0.057985
- `fillPrice -> adverseSelection` holdout ECE: 0.010227
- `spread` and `predictedProbability`: insufficient data because all scores are missing.
- markout score fields are flagged as post-outcome/leakage diagnostics, not pre-trade calibration features.

## Updated Report

- `AI_WORKSPACE/PHASE8N_CALIBRATION_FEATURE_HOLDOUT.md`

## Next Phase

Phase 8O should enrich `CalibrationRecord` with true pre-trade feature fields before any strategy tuning or readiness changes.
