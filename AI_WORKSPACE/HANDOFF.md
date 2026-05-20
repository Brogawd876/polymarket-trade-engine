# Handoff: Type 3 Deposit Wallet Corrected

## Current Status
- **Authentication:** Type 3 POLY_1271 flow is the active account model.
- **Owner signer:** `0x3528764a45bB13eC6BD8Deb1a73b5034742E6329`
- **Correct POLY_FUNDER_ADDRESS:** `0x9bB7C3aafCeb82665293f9cd784F61112fFa4c51`
- **Account Balance:** Corrected deposit wallet shows approximately **$5.00 pUSD / CLOB balance**.
- **CLOB Credentials:** Static `POLY_API_*` and `BUILDER_*` values are ignored for CLOB auth; credentials are freshly derived from the owner signer.
- **Engine State:** Surgical Hardening Plan executed and verified. Engine is running in background (`--idle`) at port 3000.
- **UI State:** Operator Cockpit is running in background at port 5173.

## Completed Work
1. **Bug Fixes:**
   - Corrected `.env` to use the officially derived Type 3 deposit wallet.
   - Kept `engine/client.ts` on fresh owner-derived CLOB credentials; stale static CLOB creds are not used.
2. **Surgical Hardening:**
   - Added WebSocket error logging in `UserChannel` (preventing silent parser failures).
   - Removed `any` from timers in `EarlyBird` and `MarketLifecycle` for better type safety.
   - Tightened `DEFAULT_EXECUTION_QUALITY_LIMITS` (1% slippage, 5s venue age) for industrial safety.
   - Added environment diagnostics for `curl` in `fetch-retry.ts`.
3. **Verification:**
   - Latest acceptance run should use `npm run check`.
   - `bun test` passed (except for 15 pre-existing `OrderBook` failures).
   - Visual verification of UI completed via browser snapshot.

## Pending Tasks
1. Build future live-trading work on the corrected Type 3 account model.
2. Keep final acceptance tests as a preflight before additional order-posting changes.

## Final Acceptance Evidence
- `npm run check` passed.
- Fresh owner-derived CLOB API key ID: `36054297-494c-54d3-c706-cd34749dfbc5`.
- Balance checks: USDC.e `0`, pUSD `5`, CLOB balance `5`.
- Raw order verification: maker/signer `0x9bB7C3aafCeb82665293f9cd784F61112fFa4c51`, `signatureType=3`, order version `2`.
- Live BTC 5-minute market `btc-updown-5m-1779266400` accepted test order `0xcd265e048093af8a07f4a5aa323d80698d4a99a1f0dab747cde7575196690028`.
- Cancellation succeeded and open orders returned to `0`.

## Processes
- [PID 9808] `bun run index.ts --idle --always-log --port 3000`
- [PID 8892] `npm run dev` (UI)
