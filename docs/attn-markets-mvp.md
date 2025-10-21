# attn.markets MVP Scope (Pump.fun Creator Fees)

## Goal
Ship the minimum set of contracts and tooling that turn a Pump.fun creator-fee PDA into a Pendle-style PT/YT pair on Solana. The MVP proves that once Pump grants a Community Takeover (CTO), attn.markets can custody the fee stream, mint Standardized Yield (SY), and split it into tradable principal (PT) and yield (YT) tokens with basic redemption and analytics.

## End-to-End Flow
1. **CTO Hand-Off** – Community submits Pump.fun CTO form nominating the attn.markets vault PDA as the new creator. Pump executes `set_creator` / `set_creator_authority`.
2. **Fee Custody** – CreatorVault PDA receives all future fees (SOL/USDC). Existing balances are swept via `collectCreatorFee`.
3. **SY Mint** – Users deposit Pump tokens or raw fees into CreatorVault, receiving SY that represents “1 unit” of that fee stream.
4. **PT/YT Split** – SY is burned and equal amounts of PT (principal) and YT (yield) SPL tokens are minted for a chosen maturity.
5. **Stable Yield Routing** – LPs deposit approved stablecoins (USDC/USDT/USDe, etc.) into the Stable Yield Vault to mint `attnUSD` shares. Creator fees arriving in SOL are swapped into the same basket so NAV grows and depositors capture protocol yield.
6. **Trading & LP (v0)** – Users hold PT/YT, swap manually, or provide liquidity to a minimal PT/YT AMM (based on Pendle v2 math). Liquidity can also focus on PT/quote and `attnUSD`/quote pairs.
7. **Redemption** – YT or `attnUSD` holders `redeem_yield` to pull accrued fees, while PT holders `redeem_principal` after maturity to recover Pump tokens or remaining fees.

## Smart-Contract Components
### 1. CreatorVault Program
- PDA per Pump token (seeds: `["creator-vault", pump_mint]`).
- Stores:
  - Pump creator-fee PDA address
  - Accepted quote mint (SOL via wSOL wrapper or USDC)
  - Maturity schedule array (default daily/weekly/monthly)
- Instructions:
  - `initialize_vault(admin, pump_creator_pda, quote_mint)`
  - `collect_fees()` – pulls funds from Pump PDA (requires `set_creator_authority` executed).
  - `wrap_fees(amount, maturity)` – mints SY SPL token.
  - `sweep_unassigned()` – admin recovers dust/fees if creator opts out.

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
  - `mint_pt_yt(user, sy_amount)` – burns SY, mints PT & YT.
  - `redeem_yield(user, yt_amount)` – transfers delta fees to user.
  - `redeem_principal(user, pt_amount)` – after maturity, burns PT and sends Pump token or vault balance.
  - `close_market()` – admin finalizes market once all PT redeemed.

### 4. Fee Accounting
- Vault keeps `total_fees_received`.
- Market keeps `per_share_index = total_fees_received / total_YT_outstanding`.
- User position stores `last_index` to compute owed fees lazily.

### 4. Stable Yield Vault (`attnUSD`)
- Custodies aggregated YT cash flows; converts incoming SOL into protocol-selected stablecoins (e.g., USDC, stables via Jupiter routes).
- Mints `attnUSD`, a yield-bearing stablecoin representing a pro-rata share of the aggregated creator-fee yield.
- Maintains share index so deposits/withdrawals don’t dilute existing holders.
- Exposes `deposit_yt(yield_amount)`, `mint_attnusd(user, amount)`, `redeem_attnusd(user, shares)`.
- Optional staking adapter so protocols can integrate `attnUSD` as collateral.

### 5. AMM v0 (Optional early, mandatory before mainnet)
- Minimal concentrated pool for PT/quote and `attnUSD`/quote pairs (YT/quote optional).
- Based on Pendle v2 CWAMM:
  - Price = `discount_factor * PT_supply` for PT pool.
  - YT priced via implied yield (use same math as Pendle: `swapExactIn`).
- LP positions stored as NFT (token-2022 or simple PDA).
- Fees accrue in quote asset.
- For MVP we can hardcode a single liquidity range with protocol LP to prove swaps work.

### 6. Frontend + CLI
- **Web** (React/Next or existing attn UI):
  - CTO handoff instructions checklist.
  - “Wrap & Split” page (deposit Pump tokens/fees → mint SY → split into PT/YT).
  - Portfolio dashboard (PT/YT balances, accrued yield, maturity countdown).
  - Redeem modals for YT (claim fees) and PT (post-maturity unwrap).
  - Basic liquidity tab if AMM v0 launched.
- **CLI** (TypeScript or Rust):
  - `attn-cto request <pump_mint> <vault_pda>`
  - `attn-wrap --mint <pump_mint> --amount ...`
  - `attn-split --market <market_pubkey> --amount ...`
  - `attn-redeem-yt`, `attn-redeem-pt`

### 7. Indexer / Analytics
- Runs off Solana RPC (Helius/Jito).
- Tracks:
  - Fees collected per Pump token.
  - SY / PT / YT supply per market.
  - Outstanding yield owed (per user, aggregated).
  - Redemption events.
- Exposes GraphQL/REST endpoints for frontend usage.
- Can reuse existing attn indexer skeleton or Anchor events.

### Current On-Chain Progress (Q4 2025 snapshot)
- **CreatorVault**: `initialize_vault`, `wrap_fees`, plus new CPI helpers `mint_for_splitter` and `transfer_fees_for_splitter` deployed. Vault stores the authorized `splitter_program` and only honours CPIs signed by the `splitter-authority` PDA.
- **Splitter**: Markets derive and persist a `splitter-authority` PDA per CreatorVault. `mint_pt_yt`, `redeem_yield`, and `redeem_principal` now CPI into CreatorVault for all SPL minting and fee transfers; Anchor integration test (`cargo test -p splitter`) passes the full mint → accrue → redeem path.
- **StableVault**: share-priced attnUSD vault (stablecoin deposits + creator-fee yield) scoped; Anchor crate scaffolded but logic/tests not yet started. **AMM**: crate scaffolded; pricing engine pending.
- **SDK (`attn_client`)**: needs helpers for the new CPI flow and PDA derivations before we publish the crate.

## Milestones
| Status | Deliverable | Owner Hints |
|--------|-------------|-------------|
| ✅ | CreatorVault program + tests (wrap, collect, SY mint). CLI command to wrap. | Protocol Eng |
| ❌ | Vault UI skeleton & CTO checklist page. | Frontend |
| ✅ | PT/YT splitter markets (mint, redeem_yield). Unit + integration tests. | Protocol Eng |
| ❌ | Indexer ingestion for fees + supply. Basic API. | Backend/Data |
| ❌ | Frontend: wrap/split flow, balances dashboard. | Frontend |
| ✅ | PT redemption logic (post-maturity), state cleanup. | Protocol Eng |
| ❌ | AMM v0 design + implementation (fork Pendle math). | Protocol Eng |
| ❌ | Redemption UI (claim YT, redeem PT). Notifications. | Frontend |
| ✅ | Integration tests: full CTO → mint → redeem path on devnet. | Protocol + QA |
| ❌ | AMM UI (swap, LP). | Frontend |
| ❌ | On-chain monitoring / alert scripts (fee flow, vault balance). | Ops/Backend |
| ❌ | Devnet public demo with one Pump token. | All |
| ❌ | Hardening, audit handoff, mainnet-guarded launch. | All |

## Open Questions
- YT payout asset: keep in SOL (native) or auto-wrap to wSOL/USDC?
- Provider incentives: do we subsidize initial PT/quote liquidity or rely on external LPs?
- Maturity schedule default: fixed maturities per vault or user-defined per market?
- CTO automation: can we build a helper script that pre-fills Pump’s CTO form?
- Fee asset hedging: do we auto-swap fees into USDC for smoother YT payouts?
- Governance in MVP: simple multisig vs full DAO controls?

## Dependencies & Risks
- Pump.fun cooperation for CTO approvals (timing uncertain).
- Accurate fee routing: need to verify Pump PDA addresses and ensure no secondary paths.
- Anchor account sizes must leave room for future fields (avoid re-deploy).
- AMM complexity: ensure compute budget fits in Solana limits (especially YT math).
- UI/UX education: educate creators on pump takeover + PT/YT meaning.

## Next Steps
1. Draft CreatorVault program skeleton (Anchor).
2. Define SPL mint addresses and seeds (SY, PT, YT).
3. Implement PT/YT market account + fee indexing.
4. Stand up devnet environment and scripts to simulate Pump fee flow.
5. Parallel: UI wireframes + indexer scaffolding.
6. Review logic with audit partner before mainnet deployment.
