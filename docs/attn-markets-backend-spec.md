# attn.markets Backend & Indexer Specification (Pump.fun MVP)

## Objectives
- Implement all on-chain programs and off-chain services in Rust.
- Supply indexed data and APIs to the frontend (markets, portfolio, attnUSD metrics).
- Deliver Rust-based tooling for Pump CTO tracking, fee monitoring, and alerts.
- Establish devnet/testnet pipelines, CI, and production readiness for guarded mainnet.

## Monorepo Structure (Rust-centric)
```
attnmarkets/
 ├─ programs/                     # Anchor crates
 │   ├─ creator_vault/
 │   ├─ splitter/
 │   ├─ stable_vault/
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
  - `CreatorVault`: main PDA storing Pump PDA, fee totals, SY mint, authorized admins.
  - `VaultAuthority`: signer PDA derived from seeds (`creator-vault`, pump mint).
  - `FeeEscrow`: token account for accumulated SOL (wrapped) or USDC, owned by vault.
- **Instructions**
  - `initialize_vault { pump_creator_pda, quote_mint, admin }`
  - `collect_fees { creator_vault, pump_pda }` (CPI to Pump program to sweep fees)
  - `wrap_fees { creator_vault, user, amount, maturity }` – mints SY to user.
  - `update_admin {}` – governance operations.
  - `pause / resume` – guard rails for emergencies.
- **Events**
  - `FeeCollected`, `SYMinted`, `VaultPaused`.
- **Key Considerations**
  - Support both direct Pump token deposits and raw SOL fee deposits (convert via wSOL).
  - Track `total_fees_collected`, `total_sy_minted`, `cta_status` flag (optional) for UI gating.

### 2. Splitter Program (SY → PT/YT)
- **Accounts**
  - `Market`: keyed by `pump_mint + maturity_ts` storing PT mint, YT mint, maturity, fee index, total minted.
  - `UserPosition`: optional PDA storing last fee index to compute owed yield lazily.
- **Instructions**
  - `create_market { creator_vault, maturity_ts }`
  - `mint_pt_yt { market, user, sy_amount }`
  - `redeem_yield { market, user }` – calculates `(current_index - last_index) * YT_balance`.
  - `redeem_principal { market, user }` – after maturity, transfers Pump token or vault-held assets.
  - `close_market {}` – cleans up once PT supply zero.
- **Events**
  - `MarketCreated`, `PTYT_Minted`, `YieldRedeemed`, `PrincipalRedeemed`.
- **Considerations**
  - Use `Clock` sysvar to enforce maturity gating.
  - For simplicity, place markets under CreatorVault admin control (one admin per Pump token).

### 3. Stable Yield Vault Program (`attnUSD`)
- **Accounts**
  - `StableVault`: stores total deposits, attnUSD mint, share index, conversion queue state.
  - `DepositRecord`: optional tracking for KYC or big deposits.
- **Instructions**
  - `initialize_stable_vault { quote_mints[], conversion_strategy }`
  - `deposit_yt { stable_vault, market, user, yt_amount }`
  - `mint_attnusd { stable_vault, user }`
  - `redeem_attnusd { stable_vault, user, shares }`
  - `process_conversion { stable_vault }` – swaps SOL→USDC via Jupiter.
- **Events**
  - `attnUSD_Minted`, `attnUSD_Redeemed`, `ConversionExecuted`.
- **Considerations**
  - Slippage limits, oracle pricing (Pyth/Jupiter quotes) to protect conversions.
  - Option to disable auto-sweep for markets that prefer standalone YT.

### 4. AMM Program
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
- Provide wrapper structs/methods for each instruction (CreatorVault, Splitter, StableVault, AMM).
- Expose utility modules:
  - PDA derivations (`creator_vault_pda`, `market_pda`, `attnusd_mint_pda`).
  - Jupiter swap helper (via HTTP client) for SOL→USDC conversions.
  - Serialization helpers for front-end bridging (if needed).
- Export CLI-friendly commands (wrap, split, redeem) reused by `attn_cli`.

- **Stack**: Pure Rust using `anchor-client`, `solana-client`, and `tokio`. Store data in Postgres (with SQLx or Diesel) and optionally ClickHouse for analytics.
- **Ingestion**
  - Subscribe to program logs/events (CreatorVault, Splitter, StableVault, AMM).
  - Periodically read account state for derived metrics (total fees, indexes).
  - Ingest Pump.fun CTO approvals manually (if we store status) or via form webhook.
- **Schema (Postgres)**
  - `creator_vaults` (pump_mint, status, total_fees, total_sy, last_collected_slot).
  - `markets` (market_pubkey, pump_mint, maturity_ts, pt_supply, yt_supply, fee_index, apy metrics).
  - `user_positions` (wallet, market, pt_balance, yt_balance, last_index, accrued_yield).
  - `attnusd_stats` (total_supply, index, apy_history).
  - `swaps`, `liquidity_events`.
- **Processing**
  - Recompute YT APY: `(fees_last_24h / yt_outstanding) * annualization factor`.
  - Compute PT discount from AMM mid-price vs notional.
  - Convert SOL totals to USD via price oracle for UI.
- **APIs** (GraphQL/REST)
  - `GET /v1/overview`
  - `GET /v1/markets`
  - `GET /v1/markets/{market}`
  - `GET /v1/portfolio/{wallet}`
  - `GET /v1/attnusd`
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

## Security Considerations
- Vault ownership guarded by multisig/governance.
- Rate limits or permissions on `collect_fees` to avoid spamming Pump.
- attnUSD conversions must use reliable price oracles and slippage checks.
- Strict account size planning to avoid re-deploy; include padding.
- Unit and fuzz tests for fee distribution invariants (PT+YT conservation, attnUSD share index monotonicity).

## Implementation Checklist (Rust-first)
- [ ] Anchor project skeletons for all programs.
- [ ] SY→PT/YT mint/redeem integration tests (`anchor test`).
- [ ] StableVault conversion tests with Jupiter mock (Rust integration).
- [ ] AMM swap/liquidity tests (unit + integration).
- [ ] `attn_client` crate with program bindings and helpers.
- [ ] `attn_indexer` service ingesting events and populating Postgres.
- [ ] `attn_api` service exposing REST/GraphQL endpoints.
- [ ] `attn_cli` commands for CTO logging, wrap/split/redeem, monitoring tasks.
- [ ] Devnet deployment scripts + environment configuration (.env, keypairs).
- [ ] Security checklist + external audit handoff.
