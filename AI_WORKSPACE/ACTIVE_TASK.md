# Active Task: Phase 8O CalibrationRecord Pre-Trade Feature Enrichment

## Current Objective

Enrich offline `CalibrationRecord` rows with decision-time features so Phase 8N-style calibration comparisons can use real pre-trade predictors instead of only `fillPrice` and post-outcome markouts.

## Status

- Code repo branch: `feat/phase8o-calibration-pretrade-features`
- Phase 8O verdict: implemented locally.
- No live execution, live risk gate, order placement, runtime strategy, Strategy Lab ranking, readiness gate, or profitability-claim changes.
- Generated `data/` artifacts remain uncommitted.

## What Changed

- `StrategyLab` conservative fill evidence now carries the matched decision feature snapshot when available.
- `CalibrationRecord` now flattens decision-time fields:
  - `modelProbability`, `rawProbability`, `fairValue`
  - `marketImpliedProbability`, `quotedEdge`, `fairValueEdge`
  - `bestBid`, `bestAsk`, `mid`, `spread`, `topOfBookLiquidity`
  - `timeToCloseMs`, `volatilityEstimate`
  - `predictiveDisagreement`, `predictiveDivergence`
  - `resolutionDistance`, `distanceToOpenAnchor`
  - `action`, `strategyId`, `variantId`, `configHash`
  - `quoteTsMs`, `decisionTsMs`, `fillTsMs`
- Missing decision evidence remains explicit via `dataQuality.missingReasons`; nulls are not backfilled with fake zeros.
- Phase 8N comparison defaults now include the new pre-trade candidate fields.

## Local Phase 8O Run

```bash
bun scripts/run-strategy-lab-paired-corpus.ts --pairs data/pairs --timeout-ms 180000 --variants late-entry late-entry-flow-aware fair-value-maker --out-calibration-jsonl data/reports/phase8o-calibration.jsonl
bun scripts/compare-offline-calibration-features.ts --input data/reports/phase8o-calibration.jsonl --out-json data/reports/phase8o-calibration-feature-comparison.json
```

Headline:

- total records: 1,050
- malformed rows: 0
- split: 409 train / 176 holdout for labeled filled rows
- labels still missing on 465 rows, mostly no-fill/no-eligible-fill rows
- most decision-time fields now have enough train/holdout samples
- `modelProbability`, `rawProbability`, `fairValue`, and `predictedProbability` have 15 missing score values
- `spread`, `bestBid`, `bestAsk`, `topOfBookLiquidity`, `timeToCloseMs`, `volatilityEstimate`, `predictiveDivergence`, and `resolutionDistance` have 0 missing score values in the labeled subset

## Current Interpretation

Phase 8O fixes the feature-coverage blocker from Phase 8N. The current corpus is now usable for offline calibration plumbing comparisons across multiple pre-trade fields, but the corpus is still small and label-heavy toward adverse outcomes. These results are not a tuning signal and do not prove profitability.

## Updated Report

- `AI_WORKSPACE/PHASE8O_CALIBRATION_PRETRADE_FEATURES.md`

## Next Phase

Phase 8P should validate calibration on a larger, cleaner, temporally separated corpus before any strategy tuning or readiness changes.
