# Handoff: Phase 8H Zero Fill Evidence Diagnostic

## Current Status

Branch: `feat/paired-corpus-zero-fill-diagnostics`

Phase 8H completed the paired Strategy Lab corpus execution and diagnosis without changing strategy logic, scoring, ranking weights, readiness gates, or live trading behavior.

## Findings

- Late-entry paired captures currently yield `eligibleFillCount = 0`, so `unavailable_no_fills` is the correct Strategy Lab verdict for clean late-entry runs.
- Every raw L2 capture inspected has `market_trade = 0`. The files contain book snapshots, book deltas, `last_trade_price`, and raw messages, but no trade-through input.
- Strategy Lab accepted `l2Files`; fair-value-maker produced 31 evaluated candidate fills over the current valid pairs, but all were `unknown_insufficient_data`.
- The fair-value-maker insufficiency is caused by replay token ID mismatch: `ReplayVenueAdapter` defaults to `replay-up` / `replay-down`, while raw L2 events use real CLOB token IDs.
- Re-running Strategy Lab can append generated replay output to source `logs/early-bird-<slug>.log` files via `engine/logger.ts`, contaminating corpus inputs. Two pair manifests became partial/invalid on re-validation after appended output extended replay timestamps beyond raw L2 coverage.

## Added Artifact

- `scripts/diagnose-replay-fill-evidence.ts`
- `AI_WORKSPACE/PHASE8H_ZERO_FILL_DIAGNOSTIC.md`

## Validation

- `bun run check` passed.
- `bun test --max-concurrency=1 test/engine/paired-corpus.test.ts` passed.
- `bun test --max-concurrency=1 test/engine/paired-l2.test.ts` passed.

## Next Exact Task

1. Make Strategy Lab replay logging immutable-safe by redirecting or disabling slug-file market logging during batch runs.
2. Pass real paired CLOB token IDs from raw L2 or pair manifests into replay venue metadata.
3. Add a fill-bearing synthetic paired fixture with a real token ID and `market_trade` to prove conservative fill evidence reaches `trade_through_fill`.
4. Only then capture more corpus or evaluate active benchmark strategies.
