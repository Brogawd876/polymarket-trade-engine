# AI Workspace Handoff

## Current State

- Repository: `polymarket-trade-engine`
- Branch: `feat/phase8n-calibration-holdout-validation`
- Phase: Phase 8N offline calibration feature comparison and holdout validation.

## Recently Completed: Phase 8N

Phase 8N extends the Phase 8M offline isotonic scaffold with multi-feature comparison and deterministic train/holdout validation.

## What Changed

- Added `engine/replay/calibration-feature-comparison.ts`.
  - Candidate score/label extraction.
  - Adverse-selection and markout-derived labels.
  - Deterministic train/holdout split.
  - Train-only isotonic fit and holdout metrics.
  - Bucket stability reporting.
  - Leakage warnings for markout score fields.
- Added `scripts/compare-offline-calibration-features.ts`.
- Added `test/engine/calibration-feature-comparison.test.ts`.
- Added `AI_WORKSPACE/PHASE8N_CALIBRATION_FEATURE_HOLDOUT.md`.

## Safety Boundaries

- No live execution changes.
- No live risk gate changes.
- No order placement changes.
- No runtime strategy behavior changes.
- No Strategy Lab ranking weight changes.
- No readiness gate changes.
- No profitability claim.
- Generated `data/` artifacts remain uncommitted.

## Local Result

Command:

```bash
bun scripts/compare-offline-calibration-features.ts --input data/reports/phase8l-calibration.jsonl --out-json data/reports/phase8n-calibration-feature-comparison.json
```

Result:

- total records: 1,050
- malformed rows: 0
- split: 70% train / 30% holdout
- `fillPrice -> adverseSelection`: train 409, holdout 176, positive rate 0.948718, holdout Brier 0.015955, log loss 0.057985, ECE 0.010227.
- `spread`: insufficient data, 1,050 missing score values.
- `predictedProbability`: insufficient data, 1,050 missing score values.
- markout score fields produce diagnostic comparisons only and are flagged as post-outcome/leakage risks.

## Interpretation

The comparison harness works, but the current corpus is not ready for calibration-driven tuning. The available pre-trade-ish feature set is too thin. The project needs richer `CalibrationRecord` pre-trade fields before calibration can become decision-useful.

## Next Exact Task

Phase 8O should enrich `CalibrationRecord` with fields known at quote/decision time:

- quoted edge,
- fair-value edge,
- model probability,
- market-implied probability,
- spread,
- top-of-book liquidity/depth,
- time-to-close.

Then rerun Phase 8N-style train/holdout comparisons on a larger corpus before tuning or readiness changes.
