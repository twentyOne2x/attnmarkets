# attn Program Architecture

> Executive summary: keeper-facing instructions are now idempotent and every vault exposes pause controls so governance can halt flows safely while creators & LPs stay protected.

The protocol is composed of five primary Solana programs (CreatorVault, Splitter, StableVault, RewardsVault, AMM) plus supporting SDK/indexer components. This note captures how the programs interact, what PDAs they derive, and how creator-fee cash flows propagate from Pump.fun into attnUSD, PT/YT, and SOL reward markets.

## High-Level Flow

```
Pump.fun Creator Fees ──► CreatorVault ──► SY ──► Splitter ──► PT / YT
                                      │                       │
                                      │                       └─► YT cash flow ──► StableVault (attnUSD NAV)
                                      │                                │
                                      │                                └─► attnUSD staking ──► RewardsVault (SOL index)
                                      │
                                      └─► attnUSD mint hooks (LP stablecoin deposits)

PT, attnUSD, and sAttnUSD trade/settle across pools; indexer + SDK expose state to frontend/CLI.
```

## Programs and Responsibilities

| Program        | Purpose                                                                 | Key PDAs / Seeds                                              | Key Instructions (idempotency & pause highlights)                                                 |
|----------------|-------------------------------------------------------------------------|----------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| **CreatorVault** | Custodies creator fees, mints Standardized Yield (SY), and exposes CPI hooks plus creator-only withdrawals while unlocked. | `creator-vault` (pump mint), `fee-vault` (pump mint), `sy-mint` (pump mint)                      | `initialize_vault`, `wrap_fees`, `withdraw_fees`, `mint_for_splitter`, `transfer_fees_for_splitter`, `lock_collateral`, `unlock_collateral`; vault-level pause gate, auto-expiring lock, and admin/emergency controls. |
| **Splitter**     | Burns SY and mints PT/YT per maturity, accounts for yield, invokes CreatorVault CPI helpers.            | `market` (pump mint + maturity), `user-position`, `splitter-authority` (creator vault, bump from `ctx.bumps`) | `create_market`, `mint_pt_yt`, `redeem_yield`, `redeem_principal`, `close_market` (dual creator authority + admin signatures, zero PT/YT supply); mint/fee transfers execute via CreatorVault CPI constrained to the classic SPL Token program. |
| **StableVault**  | Accepts stablecoin deposits, converts creator-fee inflows to same basket, issues attnUSD shares.         | `stable-vault` (authority seed + bump), `share-mint`, accepted-mint custody PDAs, `sol-vault`    | `initialize_stable_vault`, `deposit_stable`, `redeem_attnusd`, `sweep_creator_fees` (requires `operation_id`, routes SOL bps to RewardsVault before conversion), `process_conversion` (`operation_id`). |
| **RewardsVault** | Lets attnUSD holders stake for SOL rewards while preserving stable NAV.                                  | `rewards-pool` (creator vault), `rewards-authority`, `stake-position`, `s-attn-mint`, `sol-treasury`, `attn-vault` | `initialize_pool`, `stake_attnusd`, `unstake_attnusd`, `claim_rewards`, `fund_rewards` (`operation_id`, allowed funder); pool pause flag for staking/claim circuits. |
| **AMM**          | Supports PT/quote and attnUSD/quote swaps + liquidity provision.                                          | `pool` (token pair + maturity), `position` PDAs                                                   | `create_pool`, `add_liquidity`, `remove_liquidity`, `swap_exact_in/out`; fee sweeping CPI backlog (`collect_fees` future work).           |

## Interaction Graph

```
┌───────────────┐      wrap_fees      ┌───────────────┐
│  Pump.fun     │ ───────────────────►│ CreatorVault  │
│ fee PDA       │                     │ (attn)        │
└───────────────┘                     └───────────────┘
       │                                   │
       │ mint_for_splitter (CPI)           │ wrap SY mint/signature
       │                                   ▼
       │                           ┌────────────────┐
       └──────────────────────────►│   Splitter     │
                                   │  (SY → PT/YT)  │
                                   └────────────────┘
                                       │        │
                            redeem_yield│        │redeem_principal
                                       │        │
                                       ▼        ▼
                          ┌────────────────┐   ┌────────────────┐
                          │  StableVault   │   │  PT Holders     │
                          │ (attnUSD NAV)  │   └────────────────┘
                          └────────────────┘
                                       │
                                       ▼
                                   AMM Pools
```

## Cash Flow Paths & Idempotent Keepers

1. **Creator fees** enter CreatorVault, increment TVL only when the vault is unpaused. `wrap_fees` is the sole authority to mint SY, while `withdraw_fees` stays creator-only whenever the vault is unlocked (locks auto-expire at maturity).
2. **Splitter CPI**: `mint_pt_yt` and `redeem_yield`/`redeem_principal` recompute their signer PDAs (splitter-authority + user-position) via `ctx.bumps`. No stored bump state remains.
3. **Keeper loop**:
   - `sweep_creator_fees` accepts an `operation_id`. It splits SOL rewards (bps) and performs a CPI into RewardsVault `fund_rewards` before queuing the remainder for StableVault conversion.
   - `fund_rewards` is idempotent: repeated `operation_id` submissions are rejected, and pending SOL is tracked until stakers exist.
   - `process_conversion` likewise requires `operation_id`, ensuring stable conversions are replay-safe.
4. **Pause controls**: `CreatorVault.paused`, `StableVault.paused`, and `RewardsPool.is_paused` each gate write paths. Admin or emergency admin can toggle, and events emit `*_PauseToggled`.

1. **Creator Fees**: Pump.fun `set_creator_authority` routes fees to `CreatorVault` fee vault PDAs (SOL/USDC).
2. **SY Minting**: Users call `wrap_fees` to convert raw fees/Pump tokens into SY (SPL mint owned by CreatorVault).
3. **PT/YT Issuance**: Splitter burns SY via `mint_pt_yt` and CPIs into CreatorVault `mint_for_splitter` to mint PT and YT mints stored in the market account.
4. **Yield Accrual**: Fees accumulate in CreatorVault `fee-vault`; Splitter `redeem_yield` CPIs into `transfer_fees_for_splitter` to send pro-rata fees to user or to StableVault.
5. **StableVault NAV**: LPs deposit USDC/USDT/USDe via `deposit_stable` to mint attnUSD shares; `sweep_creator_fees` swaps accumulated fees into the basket, increasing total assets / share price.
6. **SOL Rewards**: A configured basis-point slice of SOL fees is CPI'd into RewardsVault, where sAttnUSD holders accrue SOL via an index while the remaining SOL is converted for StableVault NAV.
7. **AMM Liquidity**: PT and attnUSD enter concentrated pools so holders can trade/hedge; `attnUSD` acts as protocol-native yield-bearing stable.

## PDA Overview

| PDA Seed(s)                               | Owning Program | Description                                     |
|-------------------------------------------|----------------|-------------------------------------------------|
| `["creator-vault", pump_mint]`            | CreatorVault   | Main vault account (stores bumps, config)       |
| `["fee-vault", pump_mint]`                | CreatorVault   | Creator fee token account (Wrapped SOL/USDC)    |
| `["sy-mint", pump_mint]`                  | CreatorVault   | SY SPL mint authority                           |
| `["splitter-authority", creator_vault]`   | Splitter       | PDA whose signer seeds are shared with CreatorVault CPI hooks |
| `["market", creator_vault, maturity_ts]`  | Splitter       | Market state (PT mint, YT mint, fee index, etc.)|
| `["user-position", market, user]`         | Splitter       | Tracks per-user fee index and accrued yield     |
| `["stable-vault"]`                        | StableVault    | Global attnUSD vault state                      |
| `["attnusd-mint"]`                        | StableVault    | attnUSD SPL mint                                |
| `["stable-treasury", stable_vault, mint]` | StableVault    | Custody account per-quote asset                 |
| `["sol-vault", stable_vault]`             | StableVault    | SOL holding account prior to conversion         |
| `["rewards-pool", creator_vault]`         | RewardsVault   | SOL reward pool configuration                   |
| `["rewards-authority", rewards_pool]`     | RewardsVault   | PDA signer over sAttn mint + attn vault         |
| `["s-attn-mint", rewards_pool]`           | RewardsVault   | sAttnUSD mint (decimals = attnUSD)              |
| `["attn-vault", rewards_pool]`            | RewardsVault   | AttnUSD custody while staked                    |
| `["sol-treasury", rewards_pool]`          | RewardsVault   | SOL treasury PDA paying rewards                 |
| `["stake-position", rewards_pool, user]`  | RewardsVault   | Tracks sAttnUSD stake and reward debt           |
| `["pool", token_a, token_b, maturity?]`   | AMM            | Liquidity pool state                            |
| `["position", pool, owner, tick_range]`   | AMM            | Liquidity position metadata                     |

## CPI Relationships

- **Splitter → CreatorVault**
  - `mint_for_splitter`: Splits SY into PT/YT using CreatorVault as mint authority.
  - `transfer_fees_for_splitter`: Moves accrued fees to end-users or to StableVault.
- **StableVault → RewardsVault**
  - `fund_rewards`: CPI invoked inside `sweep_creator_fees` to route the SOL rewards slice.
- **StableVault → CreatorVault**
  - `sweep_creator_fees`: Pulls fees from CreatorVault fee vaults, splitting SOL between RewardsVault funding and stable conversions using an `operation_id` for idempotent keeper retries.
- **AMM → Others**
  - Pools reference PT/YT/attnUSD mints but do not require CPI to CreatorVault; they use standard token program instructions.

## Supporting Services

- **attn_client (Rust SDK)**: Wraps program IDLs, exposes PDA helpers, and orchestrates multi-instruction flows (wrap → split → stake). StableVault + RewardsVault builders are live; AMM bindings will land post-liquidity MVP.
- **attn_cli**: Surface area for initialize/stake/unstake/claim/fund plus wrap/split/cto utilities; used by automation scripts and devnet operators.
- **attn_indexer**: Streams program logs into Postgres with signature dedupe + resume checkpoints; stores markets, rewards pools/positions, reward events, and aggregates for API pagination.
- **attn_api**: Axum REST service exposing `/v1/overview`, `/v1/markets`, `/v1/markets/:id`, `/v1/portfolio/:wallet`, `/v1/attnusd`, `/v1/rewards`, `/v1/rewards/:pool`, `/readyz`, `/version`. Supports `?limit=&cursor=` pagination, weak ETags, optional API key, and CORS allowlisting for demo/live frontends.
- **Frontend**: Next.js app with Demo | Live (devnet) mode switch. Live mode consumes REST APIs, gates write actions behind wallet + devnet check, and falls back to Demo if `/readyz` fails.

## Implementation Notes (Q4 2025)
- Toolchain pinned to Anchor 0.32.1 + Solana Agave 2.3.x; install `lld` and set `RUSTFLAGS="-C link-arg=-fuse-ld=lld"` to avoid rust-lld crashes.
- StableVault sweeps now accept `sol_rewards_bps`, CPI into RewardsVault, and maintain SOL vault balances separately from stable conversions.
- RewardsVault fully implemented with admin/allowed-funder checks, SOL treasury rent enforcement, and property tests for monotonic indexes.
- attn_indexer + attn_api operate on SQLx/Postgres with checkpoints, pagination, ETags, `/readyz`, `/version`.
- `localnet-e2e.sh` automates wrap → split → stake → fund → claim → unstake and curls `/v1/rewards`; adapt for devnet pilot.

## Governance & Operations
- Program admins rotate to Squads multisigs: `creator_admin` (CreatorVault + RewardsVault pools) and `attn_admin` (StableVault, future router).
- Keeper daemon (Rust or TS) invokes `collect_fees`, `sweep_creator_fees(operation_id)`, and `fund_rewards(operation_id)` on a schedule with signature dedupe.
- Devnet go-live checklist: freeze program IDs in Anchor.toml, deploy via Squads, start indexer with `--from-slot`, verify `/readyz` before enabling Live frontend mode.

## Future Hooks

- **Governance**: DAO control over CreatorVault `admin`, StableVault accepted assets, AMM fee parameters.
- **Router Choice**: Decide between integrated vs standalone router to mediate future fee splits; update CPI topology once chosen.
- **Risk/Oracle**: Price feeds (Pyth/Jupiter) for PT discounting, attnUSD NAV reporting, AMM TWAP integration.

---

### Pause & Governance Fields

| Account                | Fields / Authorities                                                     | Notes                                                                                |
|------------------------|---------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| CreatorVault           | `authority_seed`, `admin`, `emergency_admin`, `paused`, `locked`, `lock_expires_at`, `sol_rewards_bps` | Admin owns config updates; emergency admin can pause; lock auto-expires to restore creator-only withdrawals. |
| StableVault            | `authority_seed`, `keeper_authority`, `admin`, `emergency_admin`, `paused`, `pending_sol_lamports` | Keeper-only instructions require matching PDA; pause prevents deposits/conversions. |
| RewardsPool            | `admin`, `allowed_funder`, `is_paused`, `last_fund_id`, `last_treasury_balance` | Funding and staking honour pause & monotonic SOL/share index invariants.            |

### CPI & Event Updates

- StableVault → RewardsVault CPI now precedes conversions so SOL rewards leave before stable swaps; events include `CreatorFeesSwept { operation_id }` and SOL splits.
- RewardsVault emits `RewardsFunded`, `RewardsPauseToggled`, and admin update events to support indexer dedupe.
- Splitter mints/payments flow strictly through CreatorVault CPI helpers (`mint_for_splitter`, `transfer_fees_for_splitter`).

### PDA Guidance (Anchor 0.32)

- Every instruction derives signer PDAs via `ctx.bumps` plus canonical seed recomputation (`Pubkey::find_program_address` in tests). There are no persisted bump fields that drive seeds on-chain.
- StableVault PDAs: `stable-vault` uses `authority_seed` stored in state; accepted-mint/treasury PDAs derive from that seed.
- Splitter `splitter-authority` and `user-position` PDAs are resolved using `ctx.bumps` to build signer seeds at runtime.

### Keeper & Indexer Expectations

- Keepers must pass unique `operation_id` (u64) when calling:
  - `StableVault::sweep_creator_fees`
  - `StableVault::process_conversion`
  - `RewardsVault::fund_rewards`
- Indexer stores the last successful IDs per vault and only ingests events if the ID increments. Pause flags suppress alerts when flows are intentionally halted.

This diagrammatic overview lives alongside the MVP and backend specifications; keep it updated as we add AMM sinks or adjust CPI boundaries.
