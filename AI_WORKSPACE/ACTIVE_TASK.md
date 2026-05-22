# Active Task: Phase 8M Offline Isotonic Calibration

## Current Objective

Add offline probability calibration scaffolding for Phase 8L `CalibrationRecord` JSONL output.

## Status

- Code repo branch: `feat/phase8m-isotonic-calibration`
- Phase 8M verdict: implemented locally.
- Offline isotonic regression calibration is available via `engine/replay/isotonic-calibration.ts`.
- Calibration extraction and metrics are available via `engine/replay/calibration-metrics.ts`.
- CLI runner is available via `scripts/run-offline-calibration.ts`.
- This phase is offline-only and does not modify live execution, live risk gates, order placement, runtime strategy behavior, Strategy Lab ranking weights, or readiness gates.
- Missing/null evidence is dropped with explicit counts; no fake zeros are introduced.
- Generated `data/` artifacts remain uncommitted.

## Local Calibration Smoke

Using the local Phase 8L JSONL:

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

This is a scaffold smoke test, not a profitability claim.

## Updated Report

- `AI_WORKSPACE/PHASE8M_ISOTONIC_CALIBRATION.md`

## Next Phase

Phase 8N should evaluate defensible calibration feature choices offline and require enough out-of-sample paired data before using calibration to inform any strategy or readiness decision.
