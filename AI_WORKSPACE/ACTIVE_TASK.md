# Current Active Task

**Objective:** Phase 8U / Phase 8T — Capture Quality Hardening & Corpus Expansion

**Status:** ⏸️ Paused (Session ended). Phase 8U hardening completed. Phase 8T corpus expansion started but interrupted.

**Branch:** `master` (Phase 8U PR #10 merged)

**Work done this session:**
1. **Phase 8U Hardening:** Added explicit capture-quality audit gate (`scripts/audit-capture-quality.ts`). Added missing Chainlink anchor logic and diagnostic logging. Added pair-validator warnings for zero-trade and unknown-stop-reason cases. Verified with 15 new tests.
2. **Review & Merge:** Merged `phase8u-capture-quality-hardening` to `master` (PR #10).
3. **Tests:** Full test suite passed on master (468 pass, 0 fail).
4. **Corpus Expansion:** Started background run of `bun scripts/capture-calibration-corpus.ts` to gather 25 valid pairs. Interrupted to close session cleanly.

**Current corpus state:**
- Total valid pairs: 6
- Capture quality: `capture_quality_warn` (acceptable, no feature/anchor failures).
- Readiness: **BLOCKED** due to lack of samples (~1,458 records currently, need 5,000+).

**Next step upon resume:**
- Resume running `bun scripts/capture-calibration-corpus.ts --target-valid-pairs 25 --reuse-existing-pairs data/pairs --max-attempts 40` to collect the remaining ~19 valid pairs.
- Run `bun scripts/audit-capture-quality.ts --pairs-dir data/pairs` before/after each batch.
- Run the readiness pipeline once target sample size and temporal spread are met.
- **Do not move to model training yet.**
