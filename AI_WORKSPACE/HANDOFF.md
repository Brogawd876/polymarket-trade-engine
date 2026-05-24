# AI Workspace Handoff

## Current State

- Repository: `polymarket-trade-engine`
- Branch: `master`
- Phase: Phase 8V / Capture Orchestration Fix implemented; corpus expansion paused for strategy audit

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

Longer capture run:

- Started `bun scripts/capture-calibration-corpus.ts --target-valid-pairs 25 --max-attempts 40 --slot-offset 1 --pairs-dir data/pairs-clean --invalid-pairs-dir data/pairs-rejected`.
- Stopped PID `18300` on 2026-05-24 because the capture had already proven orchestration was fixed and exposed a separate strategy-quality issue: repeated simulated extreme quotes such as `BUY UP @ 0.94`.
- Preserved clean corpus now contains 5 valid complete pairs:
  - `btc-updown-5m-1779643200`
  - `btc-updown-5m-1779644100`
  - `btc-updown-5m-1779644700`
  - `btc-updown-5m-1779645300`
  - `btc-updown-5m-1779645900`
- `data/pairs-rejected` had no rejected manifests from this run.

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

After the stopped longer run, the clean-directory audit still returned `capture_quality_warn` only because temporal spread was weak. It reported 5 valid pairs, 0 invalid pairs, complete coverage for all 5, 1,707,270 raw L2 events, and 13,316 raw L2 trade events.

## Next Exact Task

Do a strategy/quote hygiene audit before collecting more corpus:

- List every strategy module and identify which shared quote helpers and execution loops they use.
- Replay or inspect the 5 clean pairs against each strategy where possible.
- Produce a matrix with extreme quote rate, duplicate blocked-intent rate, blocked rate, simulated fill behavior, and usability.
- Investigate the fair-value path repeatedly emitting clamped near-max bids such as `0.94`.
- Decide whether saturated probabilities should result in `no quote`, whether blocked identical intents should be throttled/deduped, and whether predictive disagreement/stale feeds should block before quote generation.

Then audit only the clean valid directory:

```powershell
bun scripts/audit-capture-quality.ts --pairs-dir data/pairs-clean
```

Do not move to model training, strategy tuning, paper trading, or live trading yet.

No live trading behavior, strategy logic, risk gates, or order placement behavior changed.
