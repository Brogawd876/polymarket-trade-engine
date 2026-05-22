# AI Workspace Handoff

## Current State

- Repository: `polymarket-trade-engine`
- Branch: `feat/phase8o-calibration-pretrade-features`
- Phase: Phase 8O CalibrationRecord pre-trade decision feature enrichment.

## Recently Completed: Phase 8O

Phase 8O enriches offline calibration rows with features available at decision/quote time. This builds on Phase 8N/8M calibration scaffolding and does not touch live trading behavior.

## What Changed

- `engine/strategy-lab.ts`
  - Conservative fill evidence now carries the matched `DecisionFeatureSnapshot` when replay telemetry provides one.
  - Fill evidence also records `fillTsMs` separately from placement/decision time.
- `engine/replay/calibration-extractor.ts`
  - Adds flattened pre-trade fields for model probability, fair value, implied probability, edges, order book state, liquidity, time-to-close, volatility, predictive divergence, resolution distance, side/action, strategy IDs, config hash, and timestamps.
  - Preserves nulls and adds explicit `dataQuality.missingReasons` for missing decision/model/edge evidence.
- `scripts/compare-offline-calibration-features.ts`
  - Default score candidates now include the enriched pre-trade fields.
- `test/engine/calibration-extractor.test.ts`
  - Covers populated decision fields, DOWN-side side-adjusted probability/edge, predictive divergence fallback, and missing/null behavior.

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

Commands:

```bash
bun scripts/run-strategy-lab-paired-corpus.ts --pairs data/pairs --timeout-ms 180000 --variants late-entry late-entry-flow-aware fair-value-maker --out-calibration-jsonl data/reports/phase8o-calibration.jsonl
bun scripts/compare-offline-calibration-features.ts --input data/reports/phase8o-calibration.jsonl --out-json data/reports/phase8o-calibration-feature-comparison.json
```

Corpus rerun:

- valid pair manifests used: 5
- variants: `late-entry`, `late-entry-flow-aware`, `fair-value-maker`
- calibration records written: 1,050
- late-entry variants: no eligible fills
- fair-value-maker: 70 / 70 usable touch-only fill evidence; still not trade-through proof

Phase 8N-style comparison:

- split: 409 train / 176 holdout on labeled filled rows
- missing labels: 465
- pre-trade fields with enough train/holdout samples:
  - `modelProbability`
  - `rawProbability`
  - `fairValue`
  - `marketImpliedProbability`
  - `quotedEdge`
  - `fairValueEdge`
  - `spread`
  - `bestBid`
  - `bestAsk`
  - `topOfBookLiquidity`
  - `timeToCloseMs`
  - `volatilityEstimate`
  - `predictiveDivergence`
  - `resolutionDistance`
  - `distanceToOpenAnchor`

Selected `adverseSelection` holdout metrics:

| score field | train | holdout | missing score | Brier | log loss | ECE | bucket delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `modelProbability` | 409 | 176 | 15 | 0.016118 | 0.057080 | 0.012175 | 0.012175 |
| `fairValueEdge` | 409 | 176 | 15 | 0.047594 | 0.174086 | 0.028981 | 0.028981 |
| `spread` | 409 | 176 | 0 | 0.047822 | 0.188564 | 0.008523 | 0.008523 |
| `bestBid` | 409 | 176 | 0 | 0.017382 | 0.079339 | 0.020833 | 0.020833 |
| `timeToCloseMs` | 409 | 176 | 0 | 0.017149 | 0.072733 | 0.017984 | 0.017984 |
| `predictiveDivergence` | 409 | 176 | 0 | 0.045665 | 0.161746 | 0.009834 | 0.009834 |
| `resolutionDistance` | 409 | 176 | 0 | 0.017018 | 0.082470 | 0.016561 | 0.016561 |

## Interpretation

Phase 8O removes the immediate feature sparsity blocker from Phase 8N. The calibration pipeline can now compare actual pre-trade candidate fields offline. The corpus is still too small and label-skewed for strategy tuning, and current live evidence remains touch-only rather than trade-through-heavy.

## Next Exact Task

Phase 8P should build a larger clean calibration corpus with explicit temporal train/holdout separation and trade-print-backed fills, then rerun feature comparison before any tuning or readiness promotion.
