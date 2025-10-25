# attn.markets

## Fast links
- Site/Demo: https://attn.markets
- X: https://x.com/attndotmarkets
- Founder: https://x.com/twentyOne2x
- Forum post: https://arena.colosseum.org/posts/3308

## TL;DR
- Tokenize Pump.fun creator fees into SY → PT/YT, `attnUSD`, SOL rewards.
- Dual-control via Squads 2-of-2; pause + idempotent keeper ops.
- **15-day advance UX:** mint PT/YT, sell YT for upfront USDC, buy back any time (devnet RFQ).
- Devnet live; AMM v0 pending. Details below.

## Why now (creator payouts) — **as of 2025-10-25**
- Pump.fun creator fees: **~$300M annualized** from last 30 days. [[1]]
- YouTube: **~$70B** to creators over last 3 years (**~$23B/yr avg**). [[2]]
- TikTok LIVE gifts: **~$1.5B** in **2023**. [[3]]
- OnlyFans: **$5.32B** paid in **FY2023**. [[4]]
- Twitch: **>$1B** to streamers in **2023**. [[5]]

*Notes:* Pump.fun is a 30-day run-rate; others are fiscal-year totals or program subsets. All USD.

[1]: https://earnings.wtf
[2]: https://blog.youtube/inside-youtube/2024-letter-from-neal/
[3]: https://www.fxcintel.com/research/press-releases/new-data-analysis-shows-tiktok-takes-77-cut-of-gift-payments-sent-to-creators
[4]: https://www.upmarket.co/blog/onlyfans-official-revenue-net-profit-creator-and-subscriber-data-updated-september-2024/
[5]: https://blog.twitch.tv/en/2024/01/10/a-difficult-update-about-our-workforce/


## What We’re Building
attn.markets tokenises Solana fee streams (ICM, creator token) into Pendle-style Principal and Yield tokens. Pump.fun’s CTO flow is the first on-ramp: once fees point to the CreatorVault PDA (admin = Squads 2-of-2: creator+attn), we wrap them into Standardized Yield (SY) and split into Principal (PT) and Yield (YT) tokens, rails we can reuse wherever fee authority can be reassigned.

### What this unlocks
- **Creators & builders** – Package fee rights into PT/YT to pre-sell cash flows, hedge volatility, or sell perpetual claims.
- **DeFi users, protocols, risk desks** – `attnUSD` and YT tranches turn fee exposure into diversified, yield-bearing assets for farmers, risk custodians, treasuries, and structured products.
- **Composable rails** – SY/PT/YT feed the AMM, stable vault, and forthcoming credit/hedging modules, the backbone for internet capital markets on Solana.

## Why Pump.fun First
- **Native reassignment path** – Pump.fun supports CTO fee authority transfers, so fees are redirected to the **CreatorVault PDA administered by a Squads Safe (creator+attn, 2-of-2)** without modifying the base token.
- **Meaningful cash flow** – Top Pump tokens generate material SOL fees.
- **Active communities** – Migrating fee ownership unlocks new hedging and upfront financing tools while keeping the base token untouched.

## Core Building Blocks
1. **CreatorVault PDA (admin = Squads Safe, 2-of-2 creator+attn)** – Custodies the Pump fee PDA post-CTO, collects SOL, and mints SY SPL tokens.
2. **SY → PT & YT Splitter** – Burns SY and mints equal PT and YT amounts for a chosen maturity. PT redeems principal at maturity; YT accrues fees continuously.
3. **Stable Yield Vault (`attnUSD`)** – Default destination for YT cash flows. LPs deposit approved stablecoins (USDC/USDT/USDe, etc.) to mint `attnUSD` shares; the vault converts creator fees into the same basket so NAV captures protocol-wide yield.
4. **RewardsVault (sAttnUSD)** – Optional staking wrapper for `attnUSD`. Stakers mint sAttnUSD and accrue SOL rewards via an index while `attnUSD` NAV remains USD-denominated.
5. **Pendle-inspired AMM** – Supports PT/quote and `attnUSD`/quote swaps with concentrated liquidity and time-decay pricing.
6. **Creator + Holder Console** – Web UI and CLI for CTO guidance, wrapping/splitting, fee claims, SOL rewards, redemptions, and liquidity provisioning.
7. **Indexer & Monitoring** – Tracks fee inflows, SY/PT/YT supply, reward indexes, maturity events, and raises alerts on flow disruption.

## End-to-End User Flow
1. A sponsor (creator, business, or DAO) submits a Pump.fun CTO request naming the CreatorVault PDA (Squads 2-of-2: creator+attn) as the new fee authority.
2. Pump executes `set_creator`, redirecting fees into the CreatorVault PDA. Set **`CreatorVault.admin` to a Squads Safe with members `{creator, attn}` and threshold `2`**; optionally set an `emergency_admin` Squads Safe. All admin ops (pause, config) require both creator and attn signatures via Squads.
3. Users wrap Pump tokens or fee balances to mint SY, then split into PT + YT via Splitter.
4. Fees stream into the vault; YT holders redeem yield directly or route it into `attnUSD`. A configured SOL slice funds RewardsVault so `attnUSD` stakers earn SOL outside the stablecoin NAV. Splitter CPIs into CreatorVault for both minting and fee transfers to keep mint authority centralised.
5. After maturity, PT holders redeem remaining Pump tokens/fees and can roll into a fresh tranche.

**Note on credit/loans:** the current repo does **not** yet implement an attnAdvance loan module or automatic repayment scheduling. There is no dual-signature loan contract between attn and a creator in this MVP; those flows will be specified separately once the credit product ships.

## MVP Deliverables
- CreatorVault + SY mint deployed to Solana devnet with CLI support.
- PT/YT splitter markets with yield redemption accounting, using CreatorVault CPI hooks for minting and yield payouts.
- Stable Yield Vault aggregating YT flows into `attnUSD` shares.
- Minimal PT/quote and `attnUSD`/quote AMM pools.
- Frontend (creator dashboard + investor portal) and supporting indexer APIs.
- Guarded mainnet launch for a single Pump token once tests and audits pass.

### Backend Status (Oct 2025)
- ✅ CreatorVault: Squads-governed admin/pauses, SOL reward split, CPI helpers live.
- ✅ Splitter: Anchor 0.32 bump handling, CreatorVault CPI routes, integration tests green.
- ✅ StableVault: sweep (`operation_id`), RewardsVault funding CPI, conversion queue scaffolding.
- ✅ RewardsVault: stake/unstake/claim/fund (`operation_id`), pause, admin/allowed-funder checks.
- ✅ SDK/CLI/API: `attn_client`, `attn_cli`, `attn_indexer`, `attn_api` updated for new flows (ETags, `/v1/governance`).
- ⏳ AMM: CWAMM math + devnet pool deployment.

## Work Remaining
- Implement AMM v0 pricing/LP math and surface via SDK/API.
- Harden keeper service (op-id monotonicity, pause awareness) and ship runbooks.
- Finish frontend Live mode (pause banners, Rewards ledger with ETag caching).
- Re-run property tests once rust-lld issues resolved in CI.
- Prepare devnet rollout: Squads safe creation, program re-deploy, Keeper + API smoke flows.

## Path After MVP
- Expand to additional Pump tokens via batch CTO onboarding.
- Offer optional standalone YT pools for communities wanting direct exposure.
- Integrate credit/hedging modules powered by PT/`attnUSD` collateral.
- Extend migration tooling to other Solana launchpads once fee authority transfers are feasible.

attn.markets turns Pump.fun creator fees into composable DeFi assets, unlocking upfront funding for teams and diversified yield for investors, all without rewriting the original token.

## Quickstart
```bash
rustup target add bpfel-unknown-unknown
anchor --version           # expect 0.32.0
cargo check --workspace
anchor build -p creator_vault -p rewards_vault -p stable_vault -p splitter
cargo install sqlx-cli --no-default-features --features postgres,rustls
sqlx migrate run --source protocol/crates/attn_indexer/migrations   # requires DATABASE_URL
cargo run -p attn_api                                             # launches REST API on localhost:8787
```

**Environment variables**
- `DATABASE_URL=postgres://USER:PASS@localhost:5432/attn_dev`
- `ATTN_API_BIND_ADDR=0.0.0.0:8787` (default)
- `ATTN_API_DATA_MODE=postgres|mock` (defaults to `postgres` when DATABASE_URL set)
- `NEXT_PUBLIC_API_BASE=http://localhost:8787` for the frontend Live toggle
- `NEXT_PUBLIC_PROGRAM_IDS={"devnet":{...}}` pointing at devnet deployments

## Repo Map
- Programs: [`protocol/programs/creator_vault`](protocol/programs/creator_vault), [`splitter`](protocol/programs/splitter), [`stable_vault`](protocol/programs/stable_vault), [`rewards_vault`](protocol/programs/rewards_vault), [`amm`](protocol/programs/amm)
- SDK: [`protocol/crates/attn_client`](protocol/crates/attn_client)
- CLI: [`protocol/crates/attn_cli`](protocol/crates/attn_cli)
- Indexer/API: [`protocol/crates/attn_indexer`](protocol/crates/attn_indexer), [`protocol/crates/attn_api`](protocol/crates/attn_api)
- Migrations: [`protocol/crates/attn_indexer/migrations`](protocol/crates/attn_indexer/migrations)
- Web apps: [`apps/dapp`](apps/dapp), [`apps/dapp-prod`](apps/dapp-prod)
- Docs: [`docs/attn-markets-architecture.md`](docs/attn-markets-architecture.md), [`docs/attn-markets-mvp.md`](docs/attn-markets-mvp.md), [`docs/attn-markets-backend-spec.md`](docs/attn-markets-backend-spec.md), [`docs/attn-markets-frontend-spec.md`](docs/attn-markets-frontend-spec.md)

## Architecture & Specs
- 📄 [Program architecture note](docs/attn-markets-architecture.md) (PDA matrix, CPI edges, event feeds).
- 📄 [MVP scope](docs/attn-markets-mvp.md), [Backend spec](docs/attn-markets-backend-spec.md), [Frontend spec](docs/attn-markets-frontend-spec.md).
- Diagram hooks: CreatorVault routes SOL rewards → RewardsVault before StableVault conversions; pause + governance tables live in `/v1/governance`.

### Architecture Overview
```
Pump.fun fees → CreatorVault (admin: Squads 2-of-2)
   ├─ keeper: sweep (rewards_bps) → RewardsVault (claim SOL)
   ├─ redeem_yield (YT) → pays from CreatorVault fees
   └─ redeem_principal (PT) after maturity

Splitter: SY → PT + YT
StableVault: user deposits stables ↔ mint/burn attnUSD (no fee sweeps)
AMM pools: PT/quote and attnUSD/quote (v0 pending)
Governance: pause gates on Creator/Stable/Rewards; keeper ops use monotonic operation_id
Indexer/API: /v1/* with weak ETags, /readyz, /version

```

| Program | Responsibilities | Key Seeds / Notes | Idempotent & Pause Highlights |
|---------|------------------|-------------------|-------------------------------|
| **CreatorVault** | Custodies Pump.fun fee PDA post-CTO, mints Standardized Yield (SY), exposes CPI hooks for minting and fee transfers. | `creator-vault`, `fee-vault`, `sy-mint` derived per pump mint via `ctx.bumps`. | **Admin = Squads Safe (2-of-2 creator+attn)**; optional `emergency_admin` Safe; `wrap_fees` disabled when `paused`; SOL reward split via `sol_rewards_bps`. |
| **Splitter** | Burns SY, mints PT/YT, accounts for yield and redeems principal. | `market`, `user-position`, `splitter-authority` (derived from CreatorVault). | Uses CreatorVault CPI for both mint and fee transfer; signer seeds recomputed each ix. |
| **StableVault** | Converts creator-fee SOL into a stable basket, issues `attnUSD`, manages conversion queue. | `stable-vault` seeded by `authority_seed`; custody PDAs for share mint, accepted stables, SOL treasury. | `sweep_creator_fees(operation_id)` funds RewardsVault before conversions; `process_conversion(operation_id)` enforces replay safety; pause + keeper authority gating. |
| **RewardsVault** | Optional SOL rewards layer for `attnUSD` stakers (sAttnUSD). | `rewards-pool`, `rewards-authority`, `stake-position`, `s-attn-mint`, `attn-vault`, `sol-treasury`. | `fund_rewards(operation_id)` monotonic, tracks `last_fund_id`; pool pause halts stake/claim; admin + allowed funder enforcement. |
| **AMM** | Pendle-inspired PT/quote and `attnUSD`/quote swaps + LP. | `pool`, `position` PDAs per market. | Future keeper hooks (rebalances) respect global pauses before executing trades. |

Vault-level events emit `last_*_id` counters so the indexer can dedupe and `/v1/governance` reflects admin + pause status across the stack.

## Deployed IDs (devnet)
| Program | ID |
|---------|----|
| CreatorVault | `HPjEgPTb7rrBks1oFrscBdJ7TCZ7bARzCT93X9azCK4b` |
| Splitter | `DusRTfShkXozaatx71Qv413RNEXqPNZS8hg9BnBeAQQE` |
| StableVault | `98jhX2iz4cec2evPKhLwA1HriVEbUAsMBo61bQpSef5Z` |
| RewardsVault | `RwdsVaULTxQg7vKQmsG9tPo8mWxryQac1hZ2RKSBv2C` |
| AMM (placeholder) | `4DSYe8VteU1vLgwGrTeoyGLZdsCG87srCVLkVqza3keg` |

Example PDAs (illustrative seeds using demo inputs):
- `creator_vault` = `AVnmXeUBSTgytdnPtzAZJb9LAL1VVMgBYp4LnwVgp9Vf`
- `fee_vault` = `HT6T9eg1JqKHf9Xe2zY2HR5pLrrpTsAEzeBZ75djQ87z`
- `sy_mint` = `ERU9voJjXRQ5ukoxPBh3KjJRu5eJnhEa3Em18Y4Qq8v2`
- `rewards_pool` = `8Q2r6gTuFgt4zAzmwp9dZuJQoM66Rz5yvgNWJDnPKafU`
- `rewards_authority` = `GDTn3rDgeQAMe4A4BCp9vjCE2khbUNHaWjTuK5Vm5KCh`
- `stable_vault` (authority seed example) = `HZiPGeprnRDwDdsv3RVmWXN56zcRMVg6BdvF5eoAGrYo`
- `splitter_authority` = `ggmjcruVhoriJnU7a5eoBzDfUmqJnC2hPRo22LcDksV`

## API Endpoints
All list endpoints support cursor pagination, weak ETags, and `If-None-Match`.
```bash
curl -s http://localhost:8787/v1/governance | jq '.creator_vaults[0]'
curl -s -H 'If-None-Match: W/"demo"' http://localhost:8787/v1/rewards?limit=5
```

## Demo Script
- Localnet harness: [`scripts/localnet-e2e.sh`](scripts/localnet-e2e.sh)
  ```bash
  bash scripts/localnet-e2e.sh   # boots validator, deploys programs, runs wrap→split→stake→fund→claim flow
  ```

### Squads admin model (CTO → dual control)

- After CTO approval, set `CreatorVault.admin` to a **Squads Safe** with members `{creator, attn}` and threshold **2-of-2**.  
- All privileged ops (e.g., `set_pause`, `set_rewards_split`, admin rotations) require a Squads proposal that both parties approve.  
- `emergency_admin` is optional and may be another Squads Safe. Use only for break-glass actions with clearly documented scope.

## Security & Governance
- **CreatorVault.admin is a Squads Safe with members `{creator, attn}` and threshold `2`.** StableVault/RewardsVault admins can be separate Squads Safes; mirror the same members/threshold if dual control is desired. `emergency_admin` is optional. `toggle_pause` and config updates execute only via Squads approvals.
- Keeper flows must supply `operation_id` so sweeps/conversions/funding are replay-safe; paused vaults block writes until governance resumes.
- Neither creator nor attn can change admin, pause, or redirect fees unilaterally; all privileged ops require Squads 2-of-2 approval.


## Built on Solana
- Toolchain: Anchor 0.32.x, Solana Agave 2.3.x, rust-lld
- Core programs: System, SPL Token, Associated Token Account; sysvars: Clock, Rent
- Patterns: PDAs via `ctx.bumps`, CPIs, program events for indexing
- Governance: Squads multisig admins (CreatorVault 2/2 creator+attn; optional emergency admin)
- Safety: pause gates on writes; `operation_id` idempotency for sweep/convert/fund
- Assets: SY / PT / YT / attnUSD / sAttnUSD are SPL mints

## License & Status
- MVP quality, **devnet only**. Audits + mainnet guardrails TBD.
