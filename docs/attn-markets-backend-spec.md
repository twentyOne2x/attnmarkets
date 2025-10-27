# attn.markets Backend & Indexer Specification (Pump.fun MVP)

## Objectives
- Implement all on-chain programs and off-chain services in Rust.
- Supply indexed data and APIs to the frontend (markets, portfolio, attnUSD metrics).
- Deliver Rust-based tooling for Pump CTO tracking, fee monitoring, SOL reward accrual, and alerts.
- Establish devnet/testnet pipelines, CI, and production readiness for guarded mainnet.

## Current Status (2025-10-23)
- Anchor 0.32.1 and Solana Agave 2.3.x are pinned via `Anchor.toml`; workspace builds use `rust-lld`.
- `stable_vault` handles initialize/deposit/redeem plus creator fee sweeping with SOL reward splits into RewardsVault.
- `rewards_vault` program live with stake/unstake/claim/fund, admin/allowed-funder controls, and property tests (linker crash still environmental).
- `attn_client` + `attn_cli` expose full rewards builders/commands (initialize, stake, claim, fund) in addition to stable vault flows.
- `attn_indexer` consumes program logs into Postgres with checkpoints, signature + operation-id dedupe, and cursor pagination; migrations 001–005 (`004_governance.sql`, `005_stable_pause.sql`) authored.
- `attn_api` serves `/v1/overview`, `/v1/markets`, `/v1/markets/:id`, `/v1/portfolio/:wallet`, `/v1/attnusd`, `/v1/rewards`, `/v1/rewards/:pool`, `/v1/governance`, `/readyz`, `/version` with weak ETags.
- Localnet E2E script in repo; devnet deploy + Squads migration scheduled next.

## Monorepo Structure (Rust-centric)
```
attnmarkets/
 ├─ programs/                     # Anchor crates
 │   ├─ creator_vault/
 │   ├─ splitter/
 │   ├─ stable_vault/
 │   ├─ rewards_vault/
 │   └─ amm/
 ├─ crates/
 │   ├─ attn_client/              # Rust SDK (Anchor-generated, helper functions)
 │   ├─ attn_indexer/             # Event ingestion & Postgres writer
 │   ├─ attn_api/                 # HTTP service (axum) serving frontend data
 │   ├─ attn_notifier/            # Alerts & scheduled tasks
 │   └─ attn_cli/                 # Command-line utilities
 ├─ web/                          # React/Next frontend (TS)
 ├─ scripts/                      # Shell scripts for deployments, validator setup
 └─ docs/
```

## On-Chain Programs (Rust / Anchor)

### 1. CreatorVault Program
- **Accounts**
  - `CreatorVault`: main PDA storing Pump PDA, fee totals, SY mint, `authority_seed`, governance fields (`admin`, `emergency_admin`, `sol_rewards_bps`, `paused`).
  - `VaultAuthority`: signer PDA derived from seeds (`creator-vault`, pump mint) using Anchor 0.32 `ctx.bumps`.
  - `FeeEscrow`: token account for accumulated SOL (wrapped) or USDC, owned by vault.
- **Instructions**
  - `initialize_vault { pump_creator_pda, quote_mint, admin, emergency_admin }`
  - `wrap_fees { creator_vault, user, amount }` – mints SY to user; blocked when `paused`.
  - `mint_for_splitter { creator_vault, splitter_authority, mint, destination, amount }` – CPI helper to mint PT/YT/SY on Splitter’s behalf.
  - `transfer_fees_for_splitter { creator_vault, splitter_authority, fee_vault, destination, amount }` – CPI helper moving accrued fees to Splitter users.
  - `set_rewards_split { sol_rewards_bps }`, `update_admin`, `update_emergency_admin`.
  - `toggle_pause { is_paused }` – guard rails for emergencies.
- **Out of scope**
  - Pump.fun fee sweeping via CPI (`collect_fees`) remains on the backlog; CreatorVault currently wraps fees that have already landed in the PDA.
- **Events**
  - `FeeCollected`, `SYMinted`, `SplitterMinted`, `SplitterFeeTransfer`, `CreatorVaultPaused`, `RewardsSplitUpdated`.
- **Key Considerations**
  - Support both direct Pump token deposits and raw SOL fee deposits (convert via wSOL).
  - Track `total_fees_collected`, `total_sy_minted`, `cta_status` flag (optional) for UI gating.

### 2. Splitter Program (SY → PT/YT)
- **Accounts**
  - `Market`: keyed by `pump_mint + maturity_ts` storing PT mint, YT mint, maturity, fee index, total minted.
  - `UserPosition`: optional PDA storing last fee index to compute owed yield lazily.
  - `SplitterAuthority`: PDA per CreatorVault; signer seeds come from Anchor `ctx.bumps` (no stored bump).
- **Instructions**
  - `create_market { creator_vault, maturity_ts }`
  - `mint_pt_yt { market, creator_vault, splitter_authority, user, sy_amount }` – burns SY and CPIs into CreatorVault `mint_for_splitter` with signer seeds from `ctx.bumps`.
  - `redeem_yield { market, creator_vault, splitter_authority, user }` – CPIs into `transfer_fees_for_splitter`.
  - `redeem_principal { market, creator_vault, splitter_authority, user }` – after maturity CPIs to re-mint SY before unwinding PT.
  - `close_market {}` – closes the market once PT/YT supply hits zero and both the stored creator authority and admin sign the transaction.
- **Events**
  - `MarketCreated`, `PTYT_Minted`, `YieldRedeemed`, `PrincipalRedeemed`, `MarketClosed { market, creator_authority, admin }`.
- **Considerations**
  - Use `Clock` sysvar to enforce maturity gating.
  - Markets remain under CreatorVault admin control (one admin per Pump token) and require both the stored admin and creator authority signers to close once PT/YT supply reaches zero.
  - All mint/burn/transfer CPIs are restricted to the classic SPL Token program (`Tokenkeg...`); Token-2022 mints must be wrapped externally.

### 3. Stable Yield Vault Program (`attnUSD`)
- **Accounts**
  - `StableVault`: stores total deposits, attnUSD mint, share index, conversion queue state, `authority_seed`, `keeper_authority`, `admin`, `emergency_admin`, `paused`, `pending_sol_lamports`, accepted mint list.
  - `DepositRecord`: optional tracking for KYC or big deposits.
- **Instructions**
  - `initialize_stable_vault { accepted_stable_mints[], conversion_strategy, admin, emergency_admin, keeper_authority }`
  - `deposit_stable { stable_vault, user, stable_mint, amount }` – mints attnUSD shares at current NAV.
  - `redeem_attnusd { stable_vault, user, shares }` – burns shares and returns stables.
  - `sweep_creator_fees { stable_vault, creator_vault, rewards_pool, fee_accounts[], operation_id }` – splits SOL between RewardsVault funding (CPI `fund_rewards`) and stable conversions, updates pending SOL/NAV using the configured `sol_rewards_bps`; replay-safe via `operation_id`.
  - `process_conversion { stable_vault, swap_accounts[], operation_id }` – optional asynchronous SOL→stable swap executor (Jupiter) with replay guard.
  - `set_conversion_strategy`, `set_rewards_split`, `update_admin`, `update_emergency_admin`, `update_keeper_authority`, `toggle_pause`.
- **Events**
  - `attnUSD_Minted`, `attnUSD_Redeemed`, `CreatorFeesSwept { operation_id, sol_rewards_bps, last_sweep_id }`, `ConversionExecuted { operation_id, last_conversion_id }`, `StableVaultPauseToggled`.
- **Considerations**
  - Share accounting (`total_assets / total_shares`) must stay exact; deposits/redemptions use price-per-share math.
  - Slippage limits, oracle pricing (Pyth/Jupiter quotes) to protect conversions.
  - CPI into RewardsVault occurs before conversion so SOL rewards leave the vault deterministically.
  - Option to disable auto-sweep for markets that prefer standalone YT.

### 4. RewardsVault Program (`sAttnUSD`)
- **Accounts**
  - `RewardsPool`: PDA storing pool config (`reward_bps`, admin, allowed_funder, total_staked`, `sol_per_share`, `pending_rewards`, `last_treasury_balance`, `last_fund_id`, `is_paused`).
  - `RewardsAuthority`: PDA signer over attn vault + sAttn mint.
  - `StakePosition`: PDA (`stake-position`, pool, wallet) tracking staked amount and reward debt.
  - `sAttnMint`: PDA mint (decimals match attnUSD) controlled by `RewardsAuthority`.
  - `AttnVault`: PDA token account holding users’ attnUSD while staked.
  - `SolTreasury`: PDA `SystemAccount` holding SOL rewards (owner = System Program).
- **Instructions**
  - `initialize_pool { creator_vault, reward_bps, allowed_funder }` – instantiates PDAs, enforces decimals, sets Squads-admin.
  - `stake_attnusd { pool, staker, amount }` – transfers attnUSD into vault, mints sAttnUSD 1:1, settles accrued SOL.
  - `unstake_attnusd { pool, staker, amount }` – burns sAttnUSD, returns attnUSD, settles SOL, updates index debt.
  - `claim_rewards { pool, staker }` – pays pending SOL without touching principal.
  - `fund_rewards { pool, creator_vault, allowed_funder, amount, operation_id }` – requires signer match + monotonic id, transfers SOL into treasury, folds pending rewards when stakers exist.
  - `update_allowed_funder`, `update_reward_bps`, `update_admin`, `toggle_pause`.
- **Events**
  - `RewardsPoolInitialized`, `RewardsFunded` (includes `operation_id`, `source_amount`, `treasury_balance`, `last_fund_id`), `Staked`, `Unstaked`, `RewardsClaimed`, `RewardsPoolPauseToggled`, `RewardsAdminUpdated`.
- **Considerations**
  - Index math monotonic: property tests enforce `sum(claimed) ≤ sum(funded)` and rounding safety at lamport scale.
  - Funding path is trust-minimized: CPI requires allowed funder signer + creator vault match.
  - Treasury rent + balance regression checks run each ix; SOL rewards never touch attnUSD NAV.

### 5. AMM Program
- **Accounts**
  - `Pool`: stores token mints, liquidity, fee parameters, tick/range data if concentrated.
  - `Position`: PDA representing user LP range.
- **Instructions**
  - `create_pool {}` – for PT/quote, attnUSD/quote.
  - `add_liquidity`, `remove_liquidity`.
  - `swap_exact_in`, `swap_exact_out`.
  - `collect_fees`.
- **Events**
  - `PoolCreated`, `LiquidityAdded`, `LiquidityRemoved`, `Swap`.
- **Considerations**
  - Start with simplified constant product with fee parameter and TWAP accumulator; upgrade to Pendle CWAMM once stable.
  - Evaluate compute budget; may require batching instructions.

## Rust SDK (`attn_client` crate)
- Generate Anchor IDLs and derive Rust clients via `anchor-client`.
- Provide wrapper structs/methods for each instruction (CreatorVault, Splitter, StableVault, RewardsVault, AMM).
- Expose utility modules:
  - PDA derivations (`creator_vault_pda`, `market_pda`, `attnusd_mint_pda`).
  - Jupiter swap helper (via HTTP client) for SOL→USDC conversions.
  - Serialization helpers for front-end bridging (if needed).
- Export CLI-friendly commands (wrap, split, redeem, stake, unstake, claim, `fund --operation-id`, `sweep --operation-id`, `convert --operation-id`) reused by `attn_cli`.

- **Stack**: Pure Rust using `anchor-client`, `solana-client`, and `tokio`. Store data in Postgres (with SQLx or Diesel) and optionally ClickHouse for analytics.
- **Ingestion**
  - Subscribe to program logs/events (CreatorVault, Splitter, StableVault, RewardsVault, AMM) via WebSocket or gRPC.
  - Maintain `ingest_checkpoints` keyed by program + signature + `operation_id` to dedupe and resume (`--from-slot` flag).
  - Periodically read account state for derived metrics (total fees, indexes, treasury balances, pause/admin state).
  - Ingest Pump.fun CTO approvals manually (if we store status) or via form webhook.
- **Schema (Postgres)** – migrations `001`–`005` (including `004_governance.sql`, `005_stable_pause.sql`) lay down these tables/columns:
- `creator_vaults` (pump_mint, vault_pubkey, authority_seed, authority, admin, emergency_admin, sol_rewards_bps, paused, total_fees, total_sy, last_collected_slot).
- `stable_vaults` (vault_pubkey, authority_seed, admin, emergency_admin, keeper_authority, share_mint, stable_mint, pending_sol_lamports, paused, last_sweep_id, last_conversion_id, updated_at).
- `markets` (market_pubkey, pump_mint, maturity_ts, pt_supply, yt_supply, fee_index, apy metrics).
- `user_positions` (wallet, market, pt_balance, yt_balance, last_index, accrued_yield).
- `attnusd_stats` (total_supply, index, apy_history).
- `swaps`, `liquidity_events`.
- `rewards_pools` (pool_pubkey, pump_mint, reward_bps, total_staked, sol_per_share, allowed_funder, admin, treasury_balance, last_fund_id, is_paused, updated_at).
- `rewards_positions` (wallet, pool_pubkey, staked_amount, reward_debt, total_claimed, updated_at).
- `reward_events` (pool_pubkey, wallet?, event_type, slot, signature, operation_id, source_amount, distributed_amount, treasury_balance).
- `ingest_checkpoints` (program_id, slot, signature, operation_id, cursor_state).
- **Processing**
  - Recompute YT APY: `(fees_last_24h / yt_outstanding) * annualization factor`.
  - Compute PT discount from AMM mid-price vs notional.
  - Convert SOL totals to USD via price oracle for UI.
  - Track latest `operation_id` per vault (sweep/conversion/fund) and pause states for alerting + frontend banners.
  - Add DB indexes on `(wallet)`, `(pool_pubkey)`, `(slot, signature)` for API pagination.
- **APIs** (REST, JSON; list endpoints accept `?limit=&cursor=` and return weak ETag headers; clients should send `If-None-Match` to leverage 304 responses)
  - `GET /v1/overview`
  - `GET /v1/markets`
  - `GET /v1/markets/{market}`
  - `GET /v1/portfolio/{wallet}`
  - `GET /v1/attnusd`
  - `GET /v1/rewards`
  - `GET /v1/rewards/{pool}`
  - `GET /v1/governance`
  - `GET /readyz`, `GET /version`
  - CORS allowlist includes demo + live frontend origins; optional API key header when public.
  - Current implementation: `attn_api` uses SQLx-backed store with pagination and dedupe, though full production tuning still ongoing.
- **Alerting**
  - Fire events if no fees collected for N slots.
  - Monitor attnUSD conversion queues for stuck swaps.
  - Alert on AMM pool imbalance (liquidity < threshold).

## CTO Tracking Service (`attn_cli` + `attn_api`)
- CLI command to log CTO submissions (`attn-cli cto submit`). Stores entries in Postgres (`cto_requests` table).
- Admin CLI to update status when Pump approves (`attn-cli cto update`).
- `attn_api` exposes `GET /cto-status/{pumpMint}` for frontend gating.

- **Local Development**
  - Rust toolchain: `cargo`, `anchor`, `solana` CLI. Scripts (`Makefile` or `justfile`) for `anchor build`, `anchor test`, `cargo fmt`, `cargo clippy`.
  - Local validator config with mocked Pump accounts (custom genesis or test harness).
- **CI/CD**
  - Lint (ESLint, Clippy), unit tests, integration tests on PR.
  - Deploy devnet artifacts on merge to main.
  - Tag releases for audit/mainnet.
- **Monitoring**
  - Use Helium or custom logs for transaction success/failure metrics.
- Grafana dashboards for fee flow, attnUSD supply, AMM TVL.

## Keeper Service
- Cron-style runner (Rust or Typescript) invoking `collect_fees`, `sweep_creator_fees(operation_id)`, `rewards_vault::fund_rewards(operation_id)`, and `process_conversion(operation_id)` while vaults are unpaused.
- Implements exponential backoff + idempotency by signature/slot/`operation_id` to avoid double funding; skips work if governance pauses a vault.
- Emits Prometheus metrics and writes audit rows to `reward_events` with keeper identity.
- Will later manage AMM rebalances once pools live.

## Governance & Admin (Squads)
- Two Squads multisigs: `creator_admin` (governs CreatorVault, RewardsVault pools) and `attn_admin` (stable vault, future router/AMM).
- Rotate program `admin` fields to Squads PDAs during devnet rollout; store admins on-chain for CPI validation.
- Critical config changes (reward_bps, allowed_funder, sol_rewards_bps defaults, pauses) require Squads proposal + timelock.
- Future router design decision (integrated vs standalone) will dictate whether liquidity/fees route through `attn_admin`; document once finalized.
- Governance playbook: create proposal templates for (a) adopting Pump creator PDAs, (b) reverting to creator control, (c) emergency pause/unpause.

## Security Considerations
- Vault ownership guarded by multisig/governance.
- Rate limits or permissions on `collect_fees` to avoid spamming Pump.
- attnUSD conversions must use reliable price oracles and slippage checks.
- Strict account size planning to avoid re-deploy; include padding.
- Unit and fuzz tests for fee distribution invariants (PT+YT conservation, attnUSD share index monotonicity).

## Implementation Checklist (Rust-first)
- [✅] Anchor project skeletons for all programs.
- [✅] SY→PT/YT mint/redeem integration tests (`cargo test -p splitter`).
- [ ] StableVault conversion tests with Jupiter mock (Rust integration).
- [✅] RewardsVault staking program (stake/unstake/claim/fund) with SOL reward index tests *(fix rust-lld linker locally to re-run).*
- [ ] AMM swap/liquidity tests (unit + integration).
- [✅] `attn_client` crate with program bindings and helpers *(StableVault + Rewards modules live; AMM bindings pending).*
- [✅] `attn_indexer` service ingesting events and populating Postgres *(SQLx pipeline with checkpoints/pagination; production load testing pending).*
- [✅] `attn_api` service exposing REST endpoints *(pagination, ETags, /readyz, CORS configured; auth toggle outstanding).*
- [✅] `attn_cli` commands for CTO logging, wrap/split/redeem, rewards staking/funding *(AMM ops pending).*
- [✅] Localnet E2E script exercising wrap→split→stake→fund→claim flows.
- [ ] Devnet deployment scripts + environment configuration (.env, keypairs).
- [ ] Keeper service deployment + alerting.
- [ ] Security checklist + external audit handoff.
