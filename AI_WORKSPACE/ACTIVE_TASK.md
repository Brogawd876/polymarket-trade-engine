# Current Active Task

**Objective:** Phase 8U — Capture Quality Hardening

**Status:** ✅ Completed. All tests pass. Audit gate implemented.

**Branch:** `phase8u-capture-quality-hardening`

**Work done:**

### 1. Chainlink Settlement Truth Hardening
- Audited `chainlink-resolution-adapter.ts` — confirmed authoritative Chainlink-only anchor, fail-closed missing anchor behavior, all required metadata recorded.
- Added 3 new tests in `test/engine/chainlink-resolution-adapter.test.ts`:
  - `priceToBeat` returns null when no qualifying events exist before round start
  - `priceToBeat` returns null when all observed events are stale
  - `priceToBeat` returns valid anchor when fresh event exists before round start

### 2. Raw L2 / Pair Validator Hardening
- Added zero-trade-event **warning** (not error) to `engine/replay/pair-validator.ts`
- Added unknown recorder stop reason **warning** to `engine/replay/pair-validator.ts`
- Added 4 new tests in `test/engine/paired-l2.test.ts`:
  - Book-only (zero trade events) produces warning, pair is still valid
  - Unknown stop reason produces warning (not error)
  - SIGINT without `recorder_completed` event produces error
  - SIGINT with `recorder_completed` event produces `expected_sigint` (clean)

### 3. Calibration Extractor — Chainlink Missing Reasons
- Added `missing_chainlink_anchor` and `missing_chainlink_round_id` tracking in `engine/replay/calibration-extractor.ts`

### 4. Capture-Quality Audit Script
- Created `scripts/audit-capture-quality.ts` with:
  - Reads `*.pair.json` manifests from `--pairs-dir`
  - Reads optional calibration NDJSON from `--calibration-jsonl`
  - Writes JSON and Markdown reports
  - Overall verdict: `capture_quality_pass` | `capture_quality_warn` | `capture_quality_fail`
  - Fail conditions: zero pairs, below min-valid, invalid ≥ valid (≥10 pairs), zero L2 events on valid pair, incomplete coverage on valid pair, missing Chainlink anchor, missing feature rate > 5%
  - Warn conditions: low trade events, weak temporal spread, unknown stop reason, touch-only heavy

### 5. Audit Script Tests
- Created `test/scripts/audit-capture-quality.test.ts` with 15 tests covering all major branches

### 6. Phase 8U Audit Documentation
- Created `AI_WORKSPACE/PHASE8U_CAPTURE_QUALITY_AUDIT.md` with field classification table (A/B/C/D), Chainlink audit, L2 audit, decision-feature audit, and current verdict.

**Current corpus audit result:**
- Decision: `capture_quality_warn`
- 6 valid pairs, 5 invalid pairs
- 1.88M raw L2 events, 25,362 trade events
- 2 warnings: 2 older valid pairs have unknown recorder stop reason (pre-Phase 8U captures)
- No Chainlink anchor failures
- No decision-feature failures

**Controlled capture may continue.** Serious large-scale capture should proceed after collecting more pairs.

**Safety confirmation:**
- No live execution behavior changed
- No live risk gates changed
- No order placement behavior changed
- No generated data artifacts committed
