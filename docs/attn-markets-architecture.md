# attn.markets Program Architecture

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

| Program        | Purpose                                                                 | Key PDAs / Seeds                                              | Key Instructions                                                                                  |
|----------------|-------------------------------------------------------------------------|----------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| **CreatorVault** | Custodies creator fees, mints Standardized Yield (SY), and exposes CPI hooks for downstream programs. | `creator-vault` (pump mint), `fee-vault` (pump mint), `sy-mint` (pump mint)                      | `initialize_vault`, `wrap_fees`, `mint_for_splitter`, `transfer_fees_for_splitter`                |
| **Splitter**     | Burns SY and mints PT/YT per maturity, accounts for yield, invokes CreatorVault CPI helpers.            | `market` (pump mint + maturity), `user-position`, `splitter-authority` (creator vault)           | `create_market`, `mint_pt_yt`, `redeem_yield`, `redeem_principal`, `close_market`                 |
| **StableVault**  | Accepts stablecoin deposits, converts creator-fee inflows to same basket, issues attnUSD shares.         | `stable-vault` (protocol scope), `attnUSD-mint`, per-stable custody PDAs                         | `initialize_stable_vault`, `deposit_stable`, `redeem_attnusd`, `sweep_creator_fees`, `process_conversion` |
| **RewardsVault** | Lets attnUSD holders stake for SOL rewards while preserving stable NAV.                                  | `rewards-pool` (creator vault), `rewards-authority`, `stake-position`                            | `initialize_pool`, `stake_attnusd`, `unstake_attnusd`, `fund_rewards`, `claim_rewards`             |
| **AMM**          | Supports PT/quote and attnUSD/quote swaps + liquidity provision.                                          | `pool` (token pair + maturity), `position` PDAs                                                   | `create_pool`, `add_liquidity`, `remove_liquidity`, `swap_exact_in/out`, `collect_fees`           |

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

## Cash Flow Paths

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
| `["rewards-pool", creator_vault]`          | RewardsVault   | SOL reward pool configuration                   |
| `["rewards-authority", creator_vault]`     | RewardsVault   | PDA signer shared with CreatorVault CPI hooks   |
| `["stake-position", rewards_pool, user]`   | RewardsVault   | Tracks sAttnUSD stake and reward debt           |
| `["pool", token_a, token_b, maturity?]`   | AMM            | Liquidity pool state                            |
| `["position", pool, owner, tick_range]`   | AMM            | Liquidity position metadata                     |

## CPI Relationships

- **Splitter → CreatorVault**
  - `mint_for_splitter`: Splits SY into PT/YT using CreatorVault as mint authority.
  - `transfer_fees_for_splitter`: Moves accrued fees to end-users or to StableVault.
- **CreatorVault → RewardsVault**
  - `fund_rewards`: Routes the configured SOL slice into the staking index.
- **StableVault → CreatorVault** (planned)
  - `sweep_creator_fees`: Invoked by ops/automation to pull fees from multiple CreatorVault fee vaults.
- **AMM → Others**
  - Pools reference PT/YT/attnUSD mints but do not require CPI to CreatorVault; they use standard token program instructions.

## Supporting Services

- **attn_client (Rust SDK)**: Wraps program IDLs, provides PDA derivation helpers, and orchestrates multi-instruction flows (e.g., wrap → split → deposit/stake). StableVault flows are implemented; RewardsVault + AMM bindings are actively being added.
- **attn_indexer**: Subscribes to program logs to maintain Postgres state for CreatorVault totals, market indexes, attnUSD NAV, RewardsVault reward indexes, and AMM liquidity snapshots. A mock `ReadStore` implementation currently feeds local development; production ingestion still needs RPC/WebSocket + SQLx pipelines.
- **attn_api**: Axum-based service exposing `/health`, `/v1/overview`, `/v1/markets/:market`, `/v1/portfolio/:wallet`, `/v1/attnusd`, and upcoming rewards endpoints. The present build serves mock data; swap in the live indexer store prior to launch.
- **Frontend/CLI**: Uses SDK + API to guide creators through CTO, users through wrap/split/redeem, LPs through attnUSD deposits, and traders through AMM interactions.

## Implementation Notes (Q4 2025)
- Toolchain is unified on Anchor 0.32.1 + Solana Agave 2.3.x via AVM; `anchor test -p stable_vault` runs against Localnet without shim dependencies.
- StableVault now enforces PDA safety comments required by Anchor 0.32 and uses `UncheckedAccount` for PDA init before re-typing.
- RewardsVault design is staged: staking instructions and SOL index math pending implementation; CreatorVault will forward rewards once the pool is live.
- Mock data path between `attn_indexer` and `attn_api` unblocks frontend prototyping; replace with Postgres-backed store and add caching once ingestion is live.

## Future Hooks

- **Governance**: DAO control over CreatorVault `admin`, StableVault accepted assets, AMM fee parameters.
- **Risk/Oracle**: Price feeds (Pyth/Jupiter) for PT discounting, attnUSD NAV reporting, AMM TWAP integration.

---

This diagrammatic overview lives alongside the MVP and backend specifications; keep it updated as we implement StableVault or adjust CPI boundaries.
