# AI Workspace Handoff

## Current State

- Repository: `polymarket-trade-engine`
- Branch: `feat/phase8m-isotonic-calibration`
- Phase: Phase 8M offline isotonic calibration scaffold.

## Recently Completed: Phase 8M

Phase 8M adds an offline calibration layer on top of the Phase 8L `CalibrationRecord` dataset.

## What Changed

- Added pool-adjacent-violators isotonic regression in `engine/replay/isotonic-calibration.ts`.
- Added calibration sample extraction, missing/invalid counts, and metrics in `engine/replay/calibration-metrics.ts`.
- Added `scripts/run-offline-calibration.ts` for JSONL-to-summary offline runs.
- Added tests for monotonicity, duplicate score handling, null/missing rows, insufficient data, and input immutability.
- Added `AI_WORKSPACE/PHASE8M_ISOTONIC_CALIBRATION.md`.

## Safety Boundaries

- No live execution changes.
- No live risk gate changes.
- No order placement changes.
- No runtime strategy behavior changes.
- No Strategy Lab ranking weight changes.
- No readiness gate changes.
- No profitability claim.
- Generated `data/`, logs, and JSON summaries remain uncommitted.

## Local Calibration Smoke

Command:

```bash
bun scripts/run-offline-calibration.ts --input data/reports/phase8l-calibration.jsonl --out-json data/reports/phase8m-calibration-summary.json
```

Result:

- status: `ok`
- score field: `fillPrice`
- label field: `adverseSelection`
- valid samples: 585
- positive-label rate: 0.948718
- missing labels dropped: 465
- Brier score: 0.021978
- log loss: 0.073611
- ECE: 0.000000

This validates the offline scaffold only. It does not establish a profitable strategy or a final calibration feature.

## Validation

- Master pre-branch validation passed:
  - `bun run check`
  - `bun test --max-concurrency=1`: 404 pass, 7 skip, 0 fail
- Phase 8M validation:
  - `bun run check`
  - `bun test --max-concurrency=1 test/engine/isotonic-calibration.test.ts test/engine/calibration-metrics.test.ts test/engine/calibration-extractor.test.ts`
  - `bun test --max-concurrency=1`

## Next Exact Task

Phase 8N should compare offline calibration feature choices against more paired out-of-sample data. Candidate score fields should be grounded in real `CalibrationRecord` evidence and reported with sample counts, positive-label rates, missing counts, and bucket stability before any tuning or live-readiness decision.
