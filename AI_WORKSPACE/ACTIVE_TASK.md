# Active Task

**Status:** phase_8j_trade_print_source_audit_completed

## Current Objective

Prove where reliable Polymarket BTC 5-minute trade-print evidence comes from and repair recorder normalization so future paired captures can support conservative trade-through evidence.

## Phase 8J Verdict

Reliable trade prints are available, but a clean valid paired corpus still needs one capture/validation hardening pass:

- Polymarket market WebSocket emits complete public trade prints as `last_trade_price` with token ID, price, size, side, timestamp, market, and transaction hash.
- The raw L2 recorder now preserves `last_trade_price` and emits `market_trade` only when all trade-through evidence fields are present.
- CLOB last-trade-price endpoints are snapshot references only; they lack size/timestamp and are not trade-through proof.
- Data API trades are public and complete enough for audit/backfill checks, but observed samples were lagging relative to market WS.
- A short repaired-recorder capture produced normalized `market_trade`.
- A paired capture attempt produced raw L2 with `market_trade` coverage, but the manifest is invalid because recorder SIGINT was recorded as `null` and embedded Strategy Lab validation timed out.

## Updated Report

- `AI_WORKSPACE/PHASE8J_TRADE_PRINT_SOURCE_AUDIT.md`

## Next Exact Task

Phase 8K should harden paired capture validation, treat expected recorder shutdown correctly, and capture one clean valid paired BTC 5-minute corpus with normalized `market_trade` before any strategy tuning.
