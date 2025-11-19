# attn MVP Scope (Pump.fun Creator Fees)

## Goal
Ship the minimum set of contracts and tooling that turn a Pump.fun creator-fee PDA into a Pendle-style PT/YT pair on Solana. The MVP proves that once Pump approves a Community Takeover (CTO) (or the creator opts in directly), fees are redirected into CreatorVault, a Squads Safe controlled jointly by the creator and attn (2-of-2), which mints Standardized Yield (SY) and splits it into tradable principal (PT) and yield (YT) tokens with basic redemption and analytics.

## End-to-End Flow
1. **CTO Hand-Off** – A user (creator, business, or DAO) submits the Pump.fun CTO form nominating the CreatorVault safe (Squads `{creator, attn}` 2-of-2) as the new creator. Pump executes `set_creator` / `set_creator_authority`.
2. **Fee Custody** – CreatorVault PDA receives all future fees (SOL/USDC). Financing events flip the vault’s `locked` flag via `lock_collateral` (auto-expiring at maturity) so the creator can always call `withdraw_fees` solo when no advance is active. Existing balances are swept via `collectCreatorFee`.
3. **SY Mint** – Users deposit Pump tokens or raw fees into CreatorVault, receiving SY that represents “1 unit” of that fee stream.
4. **PT/YT Split** – SY is burned and equal amounts of PT (principal) and YT (yield) SPL tokens are minted for a chosen maturity.
5. **Stable Yield Routing** – LPs deposit approved stablecoins (USDC/USDT/USDe, etc.) into the Stable Yield Vault to mint `attnUSD` shares. `sweep_creator_fees` splits incoming SOL: a configured basis-point slice funds RewardsVault, the remainder converts into the stable basket so attnUSD NAV grows.
6. **SOL Rewards Staking (optional)** – `attnUSD` holders stake into the RewardsVault to receive sAttnUSD and accrue SOL rewards from the funded slice while attnUSD NAV remains USD-denominated.
7. **Trading & LP (v0)** – Users hold PT/YT, swap manually, or provide liquidity to a minimal PT/YT AMM (based on Pendle v2 math). Liquidity can also focus on PT/quote and `attnUSD`/quote pairs.
8. **Redemption** – YT holders `redeem_yield` for fees, attnUSD holders exit via `redeem_attnusd` (yield realized through NAV), sAttnUSD stakers `claim_rewards` for SOL, and PT holders `redeem_principal` after maturity to recover Pump tokens or remaining fees.

## Smart-Contract Components
### 1. CreatorVault Program
- PDA per Pump token (seeds: `["creator-vault", pump_mint]`).
- Stores:
  - Pump creator-fee PDA address, accepted quote mint (SOL via wSOL wrapper or USDC), maturity defaults.
  - Governance state: `authority_seed`, `admin` (Squads safe), `emergency_admin`, `sol_rewards_bps`, `paused`.
  - Control PDAs: `fee_vault`, `sy_mint` (derived each instruction, no stored bump reliance).
- Instructions:
  - `initialize_vault(admin, emergency_admin, pump_creator_pda, quote_mint)`
  - `wrap_fees(amount)` – mints SY SPL token when vault is unpaused.
  - `withdraw_fees(amount)` – lets the creator sweep fees solo while unlocked; requires admin co-sign only when `locked` is true.
  - `lock_collateral(lock_expires_at)` / `unlock_collateral()` – admin-gated toggles for advances; locks auto-expire at maturity to restore creator-only withdrawals.
  - `set_rewards_split(sol_rewards_bps)` – configures default basis points for SOL rewards sweep.
  - `set_pause(is_paused)` / `update_admin(new_admin)` – governance controls; `collect_fees()` remains backlog if Pump exposes CPI.

### 2. SY Token Mint
- SPL mint controlled by CreatorVault program.
- One SY mint per Pump token (seeded PDA).
- SY supply always equals total PT + YT supply / 2.

### 3. PT/YT Splitter Program
- Accounts:
  - `Market` (per Pump token + maturity): stores `pt_mint`, `yt_mint`, `maturity_ts`, `fee_index`, `accrued_fees`.
  - `UserPosition`: tracks user fee index for pro-rata yield claims.
- Instructions:
  - `create_market(pump_vault, maturity_ts)`
  - `mint_pt_yt(user, sy_amount)` – burns SY, mints PT & YT through CreatorVault CPI; signer PDAs constructed from `ctx.bumps`.
  - `redeem_yield(user, yt_amount)` – settles accrued fees via CreatorVault CPI into user quote ATA.
  - `redeem_principal(user, pt_amount)` – after maturity, burns PT and mints SY back via CreatorVault CPI before unwrapping.
  - `close_market()` – admin finalizes market once all PT redeemed.

### 4. Fee Accounting
- Vault keeps `total_fees_received`.
- Market keeps `per_share_index = total_fees_received / total_YT_outstanding`.
- User position stores `last_index` to compute owed fees lazily.

### 4. Stable Yield Vault (`attnUSD`)
- Custodies aggregated creator fees and LP deposits; converts the non-reward SOL slice into protocol-selected stablecoins (USDC/USDT/USDe) via Jupiter.
- Mints `attnUSD`, a yield-bearing stablecoin whose returns accrue via NAV (no manual claim).
- Maintains share index so deposits/withdrawals remain fair; `sweep_creator_fees` reads the configured `sol_rewards_bps`, emits Rewards funding via CPI (before conversions), and requires an `operation_id` for keeper idempotency. `process_conversion` also takes `operation_id`.
- Tracks governance + keeper state: `authority_seed`, `keeper_authority`, `admin`, `emergency_admin`, `paused`, `pending_sol_lamports`, accepted mint list.
- Core instructions: `initialize_stable_vault`, `deposit_stable`, `redeem_attnusd`, `sweep_creator_fees(operation_id)`, `process_conversion(operation_id)`, `set_conversion_strategy`, `toggle_pause`.
- Emits events for fee sweeps (`CreatorFeesSwept { operation_id, sol_rewards_bps, last_sweep_id }`) and conversions so indexer tracks NAV changes and idempotency.

### 5. RewardsVault (sAttnUSD)
- Accepts `attnUSD` deposits, mints staking receipt token sAttnUSD, and pays SOL rewards from funded slices while attnUSD NAV stays stable.
- Tracks `total_staked`, `sol_per_share`, `pending_rewards`, `last_fund_id`, `last_treasury_balance`, `allowed_funder`, `is_paused`.
- Instructions:
  - `initialize_pool(admin, reward_bps, allowed_funder)` – sets pool config and seeds PDAs (sAttn mint, attn vault, SOL treasury).
  - `stake_attnusd(user, amount)` – transfers `attnUSD`, mints sAttnUSD 1:1, settles pending SOL (requires pool active).
  - `unstake_attnusd(user, amount)` – burns sAttnUSD, returns `attnUSD`, settles SOL.
  - `claim_rewards(user)` – withdraws accrued SOL without unstaking.
  - `fund_rewards(amount_sol, operation_id)` – CreatorVault/keeper only; ids must strictly increase.
  - `toggle_pause`, `update_admin`, `update_allowed_funder`.
- Future governance hooks: admin rotation (Squads), emergency pause runbook, reward bps adjustments via on-chain proposal.

### 6. Keeper Loops & Idempotency
- Keeper daemon collects Pump fees, wraps SY, and drives `stable_vault::sweep_creator_fees(operation_id)` → `rewards_vault::fund_rewards(operation_id)` → `stable_vault::process_conversion(operation_id)` on a schedule.
- `operation_id` is a monotonically increasing `u64` per vault; duplicate IDs are rejected to make every CPI idempotent.
- Events expose `last_sweep_id`, `last_conversion_id`, `last_fund_id` so indexer/API can dedupe and surface keeper lag metrics.
- CLI exposes operation IDs on `attn_cli stable sweep`, `attn_cli stable convert`, and `attn_cli rewards fund`; localnet scripts must pipe a UUID/counter.

### 7. Pause & Governance Controls
- CreatorVault, StableVault, and RewardsVault each gate mutating instructions behind `paused` flags; admin or emergency admin (Squads safes) may toggle.
- StableVault enforces a dedicated `keeper_authority` signer in addition to admin; pauses prevent keeper loops from moving funds during incidents.
- Frontend/indexer must surface pause state (banner + disabled actions) to avoid user confusion and false alarms.
- Anchor 0.32 `ctx.bumps` is used everywhere to derive PDA signers; no instruction depends on stored bump bytes.

### 7. AMM v0 (Optional early, mandatory before mainnet)
- Minimal concentrated pool for PT/quote and `attnUSD`/quote pairs (YT/quote optional).
- Based on Pendle v2 CWAMM:
  - Price = `discount_factor * PT_supply` for PT pool.
  - YT priced via implied yield (use same math as Pendle: `swapExactIn`).
- LP positions stored as NFT (token-2022 or simple PDA).
- Fees accrue in quote asset.
- For MVP we can hardcode a single liquidity range with protocol LP to prove swaps work.

### 8. Frontend + CLI
- **Web (Next.js)**:
  - App shell with Demo (default) / Live (devnet) toggle persisted in `localStorage`.
  - CTO handoff checklist, including CreatorVault PDA + Squads multisig note.
  - Markets explorer (`/v1/markets`), portfolio dashboard (PT, YT, attnUSD NAV, sAttnUSD claimable SOL).
  - Rewards page showing pool stats, stake/unstake/claim actions gated behind wallet+devnet check; surfaces `last_fund_id`, treasury balance, and handles HTTP 304 via ETag caching.
  - Live mode health check (`/readyz`, `/version`) with automatic fallback to Demo if unhealthy; Live banner when on.
  - Global pause UX: show banner + disable write actions when CreatorVault/StableVault/RewardsVault report `paused`.
  - Stub liquidity tab for PT/attnUSD once AMM v0 lands.
- **CLI (Rust `attn_cli`)**:
  - `rewards initialize|stake|unstake|claim|fund --operation-id`.
  - `stable sweep-fees --operation-id ...`, `stable convert --operation-id ...`, `wrap`, `split`, `redeem`.
  - CTO helpers (`attn-cli cto submit|update`).
  - Flags for devnet vs localnet plus API calls for smoke tests.

### 9. Indexer / Analytics
- Runs off Solana RPC/WebSocket (Helius/Jito) with signature + operation-id dedupe checkpoints.
- Tracks:
  - Fees collected per Pump token and sweep transactions (with `operation_id`, `last_sweep_id`).
  - SY / PT / YT supply per market plus maturities.
  - attnUSD NAV (total assets, price-per-share) and StableVault pause/keeper state.
  - Rewards pools (total_staked, sol_per_share, pending, last_fund_id, treasury balances) and user positions/claims.
  - Governance snapshots: CreatorVault admin/emergency_admin/paused, StableVault authority+admins, RewardsPool admin/pause.
- Stores data in Postgres (SQLx migrations 001–005) with indexes on wallet/pool/slot and ETag materialized views.
- Powers REST endpoints `/v1/overview`, `/v1/markets`, `/v1/markets/:id`, `/v1/portfolio/:wallet`, `/v1/attnusd`, `/v1/rewards`, `/v1/rewards/:pool`, `/v1/governance`, plus `/readyz`, `/version`.
- `/v1/rewards*` respond with weak ETags (SHA-256 hashes); clients send `If-None-Match` and expect 304 responses when unchanged.

### Current On-Chain & Backend Progress (Q4 2025 snapshot)
- **CreatorVault**: `initialize_vault`, `wrap_fees`, CPI helpers, and configurable `sol_rewards_bps` consumed by `sweep_creator_fees`; admin slated for Squads rotation.
- **Splitter**: Markets derive `splitter-authority` PDA; integration tests cover mint → accrue → redeem workflows.
- **StableVault**: Initialize/deposit/redeem/sweep/conversion live; sweeps now split SOL rewards and CPI into RewardsVault before conversion.
- **RewardsVault**: Stake/unstake/claim/fund implemented with admin + allowed-funder checks and proptest coverage (rerun once rust-lld installed).
- **AMM**: Crate scaffolded; CWAMM math + tests pending.
- **SDK (`attn_client`)**: StableVault + RewardsVault builders exposed; CLI shares the same module for `rewards` commands.
- **Indexer/API**: SQLx-backed ingestion with checkpoints, Postgres migrations 001–003, axum REST with pagination, ETags, `/readyz`, `/version`.
- **Tooling**: `localnet-e2e.sh` orchestrates wrap → split → stake → fund → claim and curls `/v1/rewards`; devnet script variant TODO.

## Milestones
| Status | Deliverable | Owner Hints |
|--------|-------------|-------------|
| ✅ | CreatorVault program + tests (wrap, collect, SY mint). CLI command to wrap. | Protocol Eng |
| 🟡 | Vault UI skeleton, CTO checklist, Demo/Live mode toggle. | Frontend |
| ✅ | PT/YT splitter markets (mint, redeem_yield). Unit + integration tests. | Protocol Eng |
| ✅ | Indexer ingestion for fees, rewards, NAV with paginated API. | Backend/Data |
| ✅ | RewardsVault staking pool (stake/unstake/claim/fund, property tests). | Protocol Eng |
| 🟡 | Frontend: wrap/split flow, portfolio + rewards dashboard wired to API. | Frontend |
| 🟡 | Keeper daemon for rewards funding (Pump.fun `collect_fees` CPI backlog). | DevOps |
| ✅ | PT redemption logic (post-maturity), state cleanup. | Protocol Eng |
| ❌ | AMM v0 design + implementation (fork Pendle math). | Protocol Eng |
| ❌ | Redemption UI (claim YT, redeem PT). Notifications. | Frontend |
| ✅ | Integration tests: full CTO → mint → redeem path on devnet. | Protocol + QA |
| ❌ | AMM UI (swap, LP). | Frontend |
| ❌ | On-chain monitoring / alert scripts (fee flow, vault balance). | Ops/Backend |
| ❌ | Devnet public demo with one Pump token. | All |
| ❌ | Hardening, audit handoff, mainnet-guarded launch. | All |

*Legend: ✅ done · 🟡 in progress · ❌ not started*

## Open Questions
- YT payout asset: keep in SOL (native) or auto-wrap to wSOL/USDC?
- Provider incentives: do we subsidize initial PT/quote liquidity or rely on external LPs?
- Maturity schedule default: fixed maturities per vault or user-defined per market?
- CTO automation: can we build a helper script that pre-fills Pump’s CTO form?
- Fee asset hedging: do we auto-swap fees into USDC for smoother YT payouts?
- Governance in MVP: Squads only or additional DAO layer? Need router admin split between `creator_admin` and `attn_admin`.
- Router architecture: integrated vs standalone aggregator for future fee routing.
- Test infra: resolve rust-lld crash so rewards property tests run in CI.

## Dependencies & Risks
- Pump.fun cooperation for CTO approvals (timing uncertain).
- Accurate fee routing: need to verify Pump PDA addresses and ensure no secondary paths.
- Anchor account sizes must leave room for future fields (avoid re-deploy).
- AMM complexity: ensure compute budget fits in Solana limits (especially YT math).
- UI/UX education: educate creators on pump takeover + PT/YT meaning.
- Rust toolchain environment (lld) must be installed on CI to avoid linker crashes.
- Squads multisig setup and proposal latency may slow config changes, document playbooks.
- Live frontend must guard against unhealthy API (/readyz) to avoid broken experience.

## Next Steps
1. Fix rust-lld toolchain on CI/dev machines and re-run `cargo test -p rewards_vault` / `attn_api` suites.
2. Finalize frontend DataProvider (Demo vs Live), Rewards page wiring, and Live-mode UX guards (`/readyz` fallback, banners).
3. Stand up keeper daemon for periodic `sweep_creator_fees(operation_id)` + `fund_rewards(operation_id)` (Pump.fun `collect_fees` CPI backlog), including monitoring + alerting.
4. Complete devnet rollout plan: Squads safe creation, program admin rotation, Anchor deploy, indexer `--from-slot`, Live frontend smoke tests.
5. Decide on integrated vs standalone router architecture before AMM v0 implementation.
6. Implement AMM v0 math/tests and expose CLI+API endpoints for pricing data.
7. Draft audit scope, security checklist, and documentation for governance proposals.
8. Wire `/v1/governance` + pause states into frontend banner controls and API caching (ETag aware).
