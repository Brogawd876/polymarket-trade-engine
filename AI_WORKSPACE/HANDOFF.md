# Handoff: Phase 8I Replay Immutability and Token Mapping Repair

## Current Status

Branch: `feat/replay-immutability-token-mapping`

Phase 8I repaired the paired Strategy Lab evaluation pipeline without changing strategy logic, ranking weights, readiness gates, live trading behavior, or conservative fill scoring semantics.

## Changes

- Strategy Lab replay runs now pass `marketLogMode: "disabled"` into `EarlyBird`.
- `MarketLifecycle` can disable the per-market `Logger`; normal runtime defaults remain unchanged.
- `ReplayVenueAdapter` accepts optional replay metadata and uses supplied `clobTokenIds` instead of defaulting to `replay-up` / `replay-down`.
- Added `engine/replay/paired-token-mapping.ts` to extract real CLOB token IDs from paired raw L2 files.
- Added tests for token extraction, source replay immutability, real-token Strategy Lab mapping, and synthetic trade-through evidence.

## Corpus Rerun

- Command completed:
  - `bun scripts/run-strategy-lab-paired-corpus.ts --pairs data/pairs --timeout-ms 180000 --variants late-entry late-entry-flow-aware fair-value-maker`
- Valid pairs used:
  - `btc-updown-5m-1779343200`
  - `btc-updown-5m-1779372900`
- Source replay SHA-256 hashes and byte sizes were unchanged after rerun.
- Late-entry and late-entry-flow-aware still produced no eligible fills.
- Fair-value-maker produced 31 eligible/evaluated usable fills, all `touch_only`, zero `trade_through_fill`.

## Interpretation

The token mismatch is repaired. The source-log mutation bug is repaired. Usable conservative evidence is possible in controlled conditions.

The current live corpus still does not prove realistic profitability because its raw L2 files have zero `market_trade` events and its late-entry runs still have zero eligible fills.

## Validation

- `bun run check` passed.
- `bun test --max-concurrency=1 test/engine/paired-corpus.test.ts` passed.
- `bun test --max-concurrency=1 test/engine/paired-l2.test.ts` passed.
- `bun test --max-concurrency=1 test/engine/strategy-lab-rigorous.test.ts` passed.
- `bun test --max-concurrency=1 test/engine/fill-scoring.test.ts` passed.
- `bun test --max-concurrency=1 test/engine/replay-immutability.test.ts` passed.
- `bun test --max-concurrency=1 test/engine/paired-token-mapping.test.ts` passed.
- Full suite `bun test --max-concurrency=1` passed: 390 pass, 7 skip, 0 fail.

## Next Exact Task

Phase 8J should gather a clean paired corpus with raw L2 `market_trade` coverage, or add a capture/recorder improvement that proves `market_trade` coverage can be observed. Only after trusted trade-through evidence exists should strategy tuning resume.
