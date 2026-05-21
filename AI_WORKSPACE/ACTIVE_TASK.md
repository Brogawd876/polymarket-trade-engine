# Active Task

**Status:** phase_8i_replay_immutability_token_mapping_completed

## Current Objective

Repair paired Strategy Lab evaluation trust by making replay inputs immutable and mapping paired raw L2 real CLOB token IDs into replay venue metadata.

## Phase 8I Verdict

The evaluation pipeline is safer and more informative:

- Strategy Lab replay no longer appends generated market logger output into source replay fixtures.
- Paired runs extract real CLOB token IDs from raw L2 recorder metadata or unambiguous side-labeled events.
- Token mapping fails closed as `token_mapping_missing` or `token_mapping_ambiguous`.
- A synthetic fill-bearing paired test proves `replay fill + real token ID + placement timestamp + raw L2 market_trade` can produce `trade_through_fill`.
- Current corpus rerun completed with source replay hashes unchanged.
- Current live corpus still has no `market_trade`, so fair-value-maker evidence is touch-only and late-entry still has no eligible fills.

## Updated Report

- `AI_WORKSPACE/PHASE8I_REPLAY_IMMUTABILITY_TOKEN_MAPPING.md`

## Next Exact Task

Collect or construct the next clean paired evidence corpus with raw L2 `market_trade` coverage, then rerun Strategy Lab under the immutable, real-token-mapped pipeline before any strategy tuning.
