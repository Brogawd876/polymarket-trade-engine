# Paired Replay + Raw L2 Dataset Capture

This document outlines the usage, artifacts, and safety boundaries for the Paired Replay + Raw L2 Capture script (`scripts/capture-paired-replay-l2.ts`).

## Overview

The paired capture script is designed to run the trading bot runtime (in shadow/paper mode) while simultaneously recording raw Level 2 Orderbook and Trade events from the Polymarket websocket feed. This generates perfectly synchronized datasets used to validate conservative fill scoring in Strategy Lab without relying on synthetic mocks.

## Command

```bash
bun scripts/capture-paired-replay-l2.ts --strategy <strategy-name> --rounds 1 --slot-offset <offset> [--always-log]
```

### Example
```bash
bun scripts/capture-paired-replay-l2.ts --strategy late-entry --rounds 1 --slot-offset 1 --always-log
```

## Output Artifacts

Running a successful capture generates three key artifacts:

1. **Replay Log**: `logs/early-bird-<slug>.log`
   Contains the state execution, intent outputs, and runtime telemetry.
2. **Raw L2 Log**: `data/raw-l2/raw-l2-<slug>.ndjson`
   Contains the raw `market_book_snapshot`, `market_book_delta`, and `market_trade` events wrapped in NDJSON envelopes.
3. **Pair Manifest**: `data/pairs/<slug>.pair.json`
   Contains metadata about the capture run, coverage bounds, parsing results, and validation verdicts.

## Pair Manifest Fields

- `slug`: The deterministic ID of the captured slot (e.g., `btc-updown-5m-1234567890`).
- `replayLogPath`: Path to the runtime log.
- `rawL2LogPath`: Path to the raw L2 log.
- `coverageVerdict`: `"complete" | "partial" | "missing"`. Valid pairs must be "complete" (L2 data must strictly lead and tail the replay events).
- `pairValidity`: `"valid" | "invalid"`. Tracks if the pair passed basic checks, coverage bounds, and Strategy Lab evaluation without internal execution failure. No-fill runs can still be marked valid.
- `strategyLabEvidenceVerdict`: Evaluates whether Strategy Lab was able to use the capture (`usable`, `unavailable_no_fills`, etc).

## Safety Restrictions & Boundaries

- **No Live Trading**: The orchestrator absolutely forbids using `--prod`, `--live`, or matching environment variables. It enforces `NODE_ENV=development` and fail-closes if it detects live flags.
- **Credential-Free Recorder**: The L2 recorder process does not load or access private keys, avoiding potential security leaks.
- **No Profitability Claims**: The capture and scoring mechanism does not assert trading profitability. It purely evaluates the fidelity and conservativeness of the execution model relative to raw L2 data.
- **Strategy Lab Validation**: The paired manifest integrates with `StrategyLabBatchManager` to ensure that raw evidence maps securely without granting phantom/optimistic fills.

## Validating Existing Pairs

To manually re-validate a capture pair without running a new capture:
```bash
bun scripts/validate-paired-l2.ts --pair data/pairs/<slug>.pair.json
```
