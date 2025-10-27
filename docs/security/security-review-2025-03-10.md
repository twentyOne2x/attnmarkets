# attn.markets Security & Fuzzing Review (2025-03-10)

This review covers the on-chain Rust programs under `protocol/programs` and the production Next.js app under `apps/dapp-prod`. Focus areas include invariant safety, privilege separation, replay protection, and areas where fuzz or property-based testing should be expanded. The findings below are organised by component and prioritised by severity.

## Executive Summary
- **CreatorVault:** Core invariants (`paused`, admin gating, splitter authority PDA) hold, but there is no on-chain enforcement of the documented Squads-safe admin requirements or any `collect_fees` instruction. A dedicated fuzz harness should stress CPI mint/transfer flows under pause toggles and signer spoofing attempts.
- **Splitter:** Yield accrual math previously mixed market- and position-level state updates inline, making overflow handling difficult to isolate. We extracted and tested the computation helper, but fuzzing is still recommended for edge scenarios (large fee deltas, long-tail pending remainder rollover).
- **StableVault:** Replay guards (`last_sweep_id`, `last_conversion_id`) and admin/keeper checks are in place. Additional tests are needed for extreme `accepted_mints` counts, pause enforcement, and SOL conversion queues.
- **Frontend (prod):** API bridge correctly propagates ETag headers and distinguishes 304s, but retries/backoff are absent and cached data can return stale rewards snapshots if upstream invalidates without ETag change. Actions rely on runtime cluster checks; there is no signing guard for "Live" mode beyond `NEXT_PUBLIC_DATA_MODE`.
- **Documentation Drift:** README/specs describe emergency-admin flows, AMM features, and Pump CTO checklists that the codebase does not yet expose. Task stubs are tracked in `docs/tasks/doc-sync-2025-03-10.md`.

## Detailed Findings & Recommendations

### CreatorVault Program (`protocol/programs/creator_vault`)
- **Admin/Authority Controls:** `initialize_vault` persists a single `admin` pubkey without enforcing the Squads 2-of-2 multisig described in the docs. Consider storing both admin keys (creator + attn) and adding a dual-signature CPI or cross-program verification. Fuzz scenarios should attempt to re-use historical signer seeds after admin updates to ensure pause toggles remain gated (`set_pause`, `update_admin`).
- **Pause Invariants:** `wrap_fees`, `mint_for_splitter`, and `transfer_fees_for_splitter` call `assert_not_paused`, but there is no integration test verifying reentrancy attempts once `paused` flips. Add tests that execute an instruction while paused to guarantee failure. Property-based tests can mutate `total_fees_collected`/`total_sy_minted` to ensure `checked_add` underflows are surfaced.
- **Missing Fee Sweep Instruction:** The specification references a `collect_fees` handler; nothing in the program performs a Pump.fun CPI. Either remove the documentation reference or implement the instruction with replay protection.

### Splitter Program (`protocol/programs/splitter`)
- **Yield Accrual Helper:** `compute_yield_claim` now encapsulates fee index math and guards against `u128` overflow (`MathOverflow`). Unit tests cover no-delta, remainder rollover, and overflow propagation. Extend coverage with property tests that randomise fee deltas, pending remainder, and token balances to verify `claimable * FEE_INDEX_SCALE + remainder == total_scaled`.
- **Global Fee Index Updates:** `redeem_yield` accepts any non-decreasing `new_fee_index`. Malicious callers can push the index forward prematurely; safeguards rely on fee vault liquidity (`InsufficientYieldLiquidity`). Consider deriving `new_fee_index` internally from actual vault balances or introducing keeper-supplied proofs. Fuzz harness should iterate through sequences of `mint_pt_yt` → `redeem_yield` → `redeem_principal` to ensure `total_pt_issued` never underflows.
- **Market Closure:** `close_market` requires PT supply to hit zero but does not check YT supply. Confirm whether `total_yt_issued` is expected to remain non-zero post-maturity; otherwise add an assertion before marking the market closed.

### StableVault Program (`protocol/programs/stable_vault`)
- **Replay & Keeper Controls:** `sweep_creator_fees`/`process_conversion` guard on strictly increasing `operation_id`. Add tests to cover equal/lower IDs and ensure the vault halts as expected. Verify CPI paths to `RewardsVault` in a local validator test to confirm rent exemptions and SOL splits are honoured.
- **Accepted Mint Limit:** `initialize_stable_vault` enforces an upper bound but lacks coverage when the list length equals `MAX_ACCEPTED_MINTS`; write a unit test for the upper boundary. Also fuzz deposit/withdraw flows with randomised share supply to validate `preview_deposit` and `preview_redeem` math.
- **Emergency Admin:** Unlike CreatorVault, StableVault stores `emergency_admin` and `assert_admin_or_emergency`, aligning with the docs. Add integration coverage to ensure emergency admin can pause/unpause without modifying primary admin.

### RewardsVault Program (`protocol/programs/rewards_vault`)
- **Operation IDs:** Confirm (via test) that `fund_rewards` rejects stale `operation_id` values and that SOL accounting never lets `total_claimed` exceed funded amounts. Fuzz tests should mutate `stake`/`unstake`/`claim` sequences to uncover rounding drift.

### AMM Program (`protocol/programs/amm`)
- Currently a stub with `placeholder` instruction only. Remove production claims that AMM v0 is live or track work to implement swap/LP maths. Ensure future development includes bound checks for tick ranges and per-market authorities.

### Frontend (Prod App)
- **API Bridge:** `BridgeDataProvider` caches responses keyed by endpoint and ETag, but cache eviction never occurs. Introduce TTL-based invalidation or a manual refresh hook, especially for `/v1/rewards` where treasury balances change frequently.
- **Error Handling:** `api.ts` throws `ApiError` on non-OK status, yet action hooks often swallow errors into generic `setError('Failed to fetch quote')`. Surface HTTP status codes in UI and add logging for 429/5xx responses.
- **Live Mode Guardrails:** Mode toggles rely on `NEXT_PUBLIC_API_BASE` being configured. Add a check to ensure `NEXT_PUBLIC_DATA_MODE === 'live'` triggers a `/readyz` probe on mount (see `DataModeContext`) and disable write actions when the probe fails. Consider verifying wallet cluster alignment before dispatching transactions to prevent mainnet signatures against devnet IDs.
- **Security Headers:** `fetchMintDecimals` uses provider RPC without rate limiting or fallback. Evaluate caching mint decimals and validating them against local IDL metadata before accepting user input.

## Fuzzing & Testing Roadmap
- Extend unit/property tests around `compute_yield_claim` (Splitter) and `preview_deposit` (StableVault).
- Build Solana program-test harnesses for `CreatorVault`/`Splitter` flows with pause toggles and signer spoofing to emulate malicious CPIs.
- Add frontend integration tests (Cypress) that toggle Live/Demo modes, assert pause banners, and simulate API 304 responses to confirm caching logic.

## Artifacts
- Helper extraction & tests: `protocol/programs/splitter/src/lib.rs` (see tests section at bottom).
- Documentation drift tracking: `docs/tasks/doc-sync-2025-03-10.md` (new file).

Please prioritise implementing the documented task stubs and schedule follow-up fuzz/property test development before the next audit window.
