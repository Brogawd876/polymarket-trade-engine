# AI Workspace Handoff

## Current State

- Repository: `polymarket-trade-engine`
- Branch: `master` with local Phase 8V changes
- Phase: Phase 8V / Capture Orchestration Fix implemented and smoke-tested

## Recently Completed

The 2026-05-24 background corpus capture run was stopped because the wrapper was producing mostly partial pairs.

Root cause:

- `scripts/capture-calibration-corpus.ts` incremented `slotOffset` after each attempt.
- `slotOffset` is relative to wall-clock time, so later attempts chased farther future markets and raw L2 coverage no longer aligned with bot replay coverage.
- `scripts/capture-paired-replay-l2.ts` also exited successfully for partial/invalid manifests.

Salvaged artifact:

- `btc-updown-5m-1779638100` is valid and complete.

Smoke artifact:

- `btc-updown-5m-1779643200` was captured into `data/pairs-clean` with valid pair status and complete coverage.

Diagnostic-only artifacts:

- `btc-updown-5m-1779639000`
- `btc-updown-5m-1779640200`
- `btc-updown-5m-1779641700`

## Files Changed

- `scripts/capture-corpus-utils.ts` (new)
- `scripts/capture-calibration-corpus.ts`
- `scripts/capture-paired-replay-l2.ts`
- `test/scripts/capture-calibration-corpus.test.ts`
- `AI_WORKSPACE/PHASE8V_CAPTURE_ORCHESTRATION_FIX.md` (new)
- `AI_WORKSPACE/ACTIVE_TASK.md`
- `AI_WORKSPACE/HANDOFF.md`

## Verification

Completed:

```powershell
bun run check
bun test --max-concurrency=1 test/scripts/capture-calibration-corpus.test.ts test/engine/paired-l2.test.ts test/scripts/audit-capture-quality.test.ts
bun test --max-concurrency=1
bun scripts/capture-calibration-corpus.ts --target-valid-pairs 1 --max-attempts 2 --pairs-dir data/pairs-clean --invalid-pairs-dir data/pairs-rejected
bun scripts/audit-capture-quality.ts --pairs-dir data/pairs-clean
```

The clean-directory audit returned `capture_quality_warn` only because the smoke has one pair and weak temporal spread. It reported 1 valid pair, 0 invalid pairs, 343,156 raw L2 events, and 2,788 raw L2 trade events.

## Next Exact Task

Resume controlled capture with clean valid/rejected directories:

```powershell
bun scripts/capture-calibration-corpus.ts --target-valid-pairs 25 --max-attempts 40 --slot-offset 1 --pairs-dir data/pairs-clean --invalid-pairs-dir data/pairs-rejected
```

Then audit only the clean valid directory:

```powershell
bun scripts/audit-capture-quality.ts --pairs-dir data/pairs-clean
```

Do not move to model training, strategy tuning, paper trading, or live trading yet.

No live trading behavior, strategy logic, risk gates, or order placement behavior changed.
