# Active Task

**Status:** final_live_type3_acceptance_passed

## Current Objective
Execute the final live BTC 5-minute Type 3 acceptance test using the corrected POLY_1271 deposit wallet.

## Current Account Model
- Owner signer: `0x3528764a45bB13eC6BD8Deb1a73b5034742E6329`
- Correct POLY_1271 deposit wallet / `POLY_FUNDER_ADDRESS`: `0x9bB7C3aafCeb82665293f9cd784F61112fFa4c51`
- Static CLOB credentials are ignored for production CLOB auth; credentials are freshly derived from the owner signer.
- Previously investigated addresses `0xbcbae6BE8cE9AD38C4FFD71254202f2aA27a30CF` and `0x609df252DF1371DBABD7aA234e028ACe9EAd90A2` are not the live funder for this Type 3 flow.

## Completed Work
### 1. Account Connectivity (v1.8)
- **Deposit Wallet Correction**: Officially derived the POLY_1271 deposit wallet with `@polymarket/builder-relayer-client@0.0.9`.
- **CLOB Auth Mode**: `engine/client.ts` derives fresh CLOB API credentials from the owner signer and ignores stale static `POLY_API_*` / `BUILDER_*` CLOB credentials.
- **Balance Verification**: Verified approximately **$5.00 pUSD / CLOB balance** on the corrected deposit wallet.

### 2. Surgical Hardening
- **Observability**: Replaced empty catch blocks in `UserChannel` with structured warning logs to surface WebSocket parsing errors.
- **Type Safety**: Removed `any` from critical timers in `EarlyBird.ts` and `MarketLifecycle.ts`, enforcing strict interface compliance.
- **Risk Standards**: Tightened `DEFAULT_EXECUTION_QUALITY_LIMITS` to industrial standards (1% max slippage, 5s venue age) to protect capital by default.
- **Resilience**: Added proactive environment diagnostics for `curl` dependencies in `fetch-retry.ts`.

### 3. Verification
- **Compilation**: `bun run check` verified zero typing regressions.
- **Unit Tests**: Full test suite executed; identified 15 pre-existing `OrderBook` failures unrelated to current changes.
- **UI Validation**: Confirmed that the Operator Cockpit UI is fully functional and correctly renders the hardened risk limits.

## Next Steps
1. Continue from the corrected Type 3 deposit-wallet model.
2. Keep static CLOB credentials ignored for CLOB auth.
3. Do not reintroduce old Gnosis Safe / prior funder assumptions.

## Timestamp
- 2026-05-20T00:00:00-04:00
- Agent: Codex
