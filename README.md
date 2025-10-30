# attn.markets

## Quick links
- Site/Demo: https://attn.markets / https://app.attn.markets
- Devnet (WIP): https://prod.attn.markets
- X: https://x.com/attndotmarkets
- Founder Billy (https://x.com/twentyOne2x), 
  * full-time on attn, 
  * 3 yoe in defi startups (research+bd+product) from pre-PMF to Binance listing, 
  * 2 yoe in hft (c++ dev in market-making)


## TL;DR
- Tokenising the $2B Solana revenues to bank builders, DAOs, and creators to DeFi.
- The Sponsor (Builders/DAOs/Creators) get cash advance, loans/corporate bonds, savings account (+4-6% APR from stables/LSTs), credit card lines…
- LPs mint `attnUSD` with stable to get yield uncorrelated to market returns sourced from attn products.
- Dual-control via Squads 2of2 (sponsor+attn), with user withdrawals remaining single-signer while no position is opened.
- Squads Safe creation live on Devnet.

## Why now
* Solana app revenues = $1.72B annually. (30d annualised, [DeFiLlama](https://defillama.com/app-revenue/chains))

* Pump.fun creator rewards = $300M annually. (30d annualised, [earnings.wtf](https://earnings.wtf))
   * The Web2 creator economy alone pays $30B annually to its creators (YouTube [$23B](https://blog.youtube/inside-youtube/2024-letter-from-neal/), OnlyFans [$5.32B](https://www.upmarket.co/blog/onlyfans-official-revenue-net-profit-creator-and-subscriber-data-updated-september-2024/), TikTok [$1.5B](https://www.fxcintel.com/research/press-releases/new-data-analysis-shows-tiktok-takes-77-cut-of-gift-payments-sent-to-creators), Twitch [$1B](https://blog.twitch.tv/en/2024/01/10/a-difficult-update-about-our-workforce/))

-> These $2B miss out on the entire DeFi ecosystem



-> Tradfi products on revenues: [$4T](https://fci.nl/en/news/fci-release-2024-world-industry-statistics-showing-factoring-market-remains-stable) annually for Cash Advances (factoring), [$33T](https://www.oecd.org/content/dam/oecd/en/publications/reports/2024/03/global-debt-report-2024_84b4c408/91844ea2-en.pdf) for corporate bonds


With this, the DeFi ecosystem is mature, the US administration is crypto friendly and Solana apps push the boundaries of what's possible:
* Pump.fun buys back $1M worth of tokens daily
* MetaDAO’s structure enforces projects’ 
   1. to assign all IP to their DAOs
   2. to redirect 100% of their revenues to their DAO



## What We’re Building
attn.markets tokenises the $2B Solana app revenues into Principal and Yield tokens. 

The Sponsor (creator, business, or DAOs from MetaDAO):
* Creates Squads 2of2 (sponsor+attn) or hooks attn program to existing Safe
   * Non-custodial: withdrawals remain single-signer while no position is opened
* Point revenues to the Safe (e.g., Pump.fun via CTO request or other launchpad handoffs)
* Enable: staking, cash advance (selling slice of Yield token), M&A (selling PT), later lending, credit card line

This can be reused wherever the revenue/fee authority can be reassigned. 

LPs deposit stables (USDC, USDT, Ethena’s USDe, Reflect’s USDC+) to mint `attnUSD`, the yield-bearing stablecoin acting as attn products counterparty.

### What this unlocks
- **Creators & builders**:  Autosweep fees, autostake fees (+4%-6% APR) through Helius/Jito/Bulk and Ethena/Reflect, cash advance by selling YT, M&A by selling PT. Later: loans, credit card powered by earnings.
- **DeFi users, protocols, vault curators**: deposit stables (USDC, USDT, Ethena’s USDe, Reflect’s USDC+) to mint attnUSD, the yield-bearing stablecoin acting as attn products counterparty.
- **ICM launchpads & Safe-based apps**: get rev-share from Safes hooked to the attn CreatorVault
- **Builders on top of attnmarkets**: create products built on top of tokenised revenues (M&A desk, structured financing [...]).

## Revenue sources
Three primary revenue engines (before rev-share):

1. % take on yields from autostaked revenue flows.
2. Cash advances (factoring) against future earnings.
3. Loans & open credit lines secured by fee streams.

Assuming attn captures a constant 2 % share of the addressable revenue base, the blended annual run rate scales as follows:

| Metric | Baseline | Low growth (1.5×) | Medium growth (3×) | High growth (10×) |
|--------|---------:|------------------:|-------------------:|------------------:|
| Total market size | $2.0B | $3.0B | $6.0B | $20.0B |
| TVL @ 2 % share | $40M | $60M | $120M | $400M |
| Autostake fee ARR | $64k | $96k | $192k | $640k |
| Cash advance ARR | $200k | $300k | $600k | $2.0M |
| Loans & credit ARR | $360k | $540k | $1.08M | $3.60M |
| **Total ARR** | **$624k** | **$936k** | **$1.87M** | **$6.24M** |

### Appendix: calculation inputs

**(1) Autostaked revenue fee**
- Formula: `TVL × APR × (staking_months/12) × protocol_take`.
- Baseline: $40M × 6 % × (4/12) × 8 % ≈ **$64k**.
- Low: $60M × 6 % × (4/12) × 8 % ≈ **$96k**.
- Medium: $120M × 6 % × (4/12) × 8 % ≈ **$192k**.
- High: $400M × 6 % × (4/12) × 8 % ≈ **$640k**.

**(2) Cash advances**
- Formula: `Advance volume × advance_fee × protocol_share`.
- Baseline volume $10M (0.5 % of $2B): $10M × 10 % × 20 % = **$200k**.
- Low: $15M × 10 % × 20 % = **$300k**.
- Medium: $30M × 10 % × 20 % = **$600k**.
- High: $100M × 10 % × 20 % = **$2.0M**.

**(3) Loans & credit lines**
- Formula: `Open interest × APR × protocol_share`.
- Baseline open interest $20M: $20M × 12 % × 15 % = **$360k**.
- Low: $30M × 12 % × 15 % = **$540k**.
- Medium: $60M × 12 % × 15 % = **$1.08M**.
- High: $200M × 12 % × 15 % = **$3.60M**.

## Challenges
Retail users (creators) have high switching costs to point their revenues to the Squads vault since they will need to use a new app. Acquisition will be expensive.

The existing Squads users like DAOs will likely be a very competitive ground to gain market share. Defensibility will be expensive.

* Defensibility: create enough value to disincentivise users to hook up other apps to their Squads vaults.
* Legal: We deal with revenues and cashflows and people. MetaDAO is the most promising innovation so far.
* Custody: On paper nothing blocks the user from requesting another CTO even with a position opened, so we will need collaboration with Pump and other ICM platforms.


## Cost centers
We need in essence engineers + designer + legal + audits:
* Incentives for user acquisition. We need the sponsor (builder/DAO/creator) to redirect their fees for the long term.
* Feature development. We enable all banking services sourced from DeFi and need to offer a lot of value to capture retail market share.
* Security. We need to guarantee that:
   * The users can access their fees regardless of attnmarkets existing.
   * LPs that they'll get sustained profits for a quantified risk.
* Legal.

The above elements are required to increase TVL sustainably, for `attnUSD` to be listed on DeFi protocols (e.g. Kamino) and become a prime asset for portfolio construction (treasuries, funds, vault curators, yield farmers).



## Core Building Blocks
1. **CreatorVault PDA (admin = Squads Safe, 2-of-2 sponsor+attn)**: Custodies on-chain revenue streams (Pump.fun rewards or other redirected fees), collects SOL, tracks `locked` / `lock_expires_at`, exposes optional auto-sweeper delegation, and mints SY SPL tokens plus `withdraw_fees` access while unlocked.
2. **SY → PT & YT Splitter**: Burns SY and mints equal PT and YT amounts for a chosen maturity. PT redeems principal at maturity; YT accrues fees continuously. Markets close only when PT/YT supply is zero and both the creator authority and admin sign the transaction.
3. **Stable Yield Vault (`attnUSD`)** *(program: `protocol/programs/stable_vault`)*: LPs deposit approved stablecoins (USDC/USDT/USDe/USDC+) via `deposit_stable` to mint `attnUSD`. Keeper sweeps (`sweep_creator_fees`) pull fees from CreatorVault and convert them into the same basket so attnUSD NAV tracks underlying revenues.
4. **RewardsVault (sAttnUSD)** *(program: `protocol/programs/rewards_vault`)*: Staking layer on top of attnUSD. Stakers call `stake_attnusd` to move attnUSD into the vault and mint `sAttnUSD`, accruing SOL incentives while unstaked attnUSD continues to earn the base NAV growth.
5. **attnUSD/PT AMM** *(program scaffold: `protocol/programs/amm`)*: The on-chain program currently exposes a `placeholder` entry point; concentrated-liquidity pools for PT↔attnUSD swaps are specced but not yet implemented. Sponsors will eventually sell Yield tranches for upfront attnUSD, with LPs pricing maturities off attnUSD liquidity.
6. **Sponsor & LP Consoles** *(Next.js apps in `apps/dapp-prod`)*: Guided web + CLI flows with tour + checklists covering Squads setup, wrapping/splitting, withdrawals, and liquidity actions.
7. **Indexer & Monitoring** *(crates: `protocol/crates/attn_indexer`, `attn_api`)*: The indexer ingests CreatorVault/Splitter/StableVault/RewardsVault events to serve `/v1/governance`, supply charts, and rewards pages. Alert escalation/AMM feeds will follow once the swap program ships.

## Onboarding User Flow
1. Through the UI, the sponsor (creator, business, or DAO) hooks the attn program to their existing Squads vault, else creates the CreatorVault PDA (Squads 2-of-2: sponsor+attn) and, if migrating a Pump.fun token, submits the CTO request to name the PDA as the new fee authority. Other launchpads follow the same template once fee rights are portable.
2. Once the originating platform (e.g., Pump.fun) executes the authority handoff, revenues flow into the CreatorVault PDA. Set **`CreatorVault.admin` to a Squads Safe with members `{creator, attn}` and threshold `2`**; optionally set an `emergency_admin` Squads Safe. Financing flows toggle the vault lock via `lock_collateral` / `unlock_collateral` (auto-expiring at maturity) so the sponsor keeps unilateral `withdraw_fees` access whenever no obligation is outstanding; all other admin ops (pause, config) require both sponsor and attn signatures via Squads.
3. Users mint SY, then split into PT + YT via Splitter.
4. Fees stream into the vault; YT holders redeem yield directly or route it into `attnUSD`. A configured SOL slice (zero by default) funds RewardsVault so `attnUSD` stakers earn SOL outside the stablecoin NAV. Splitter CPIs into CreatorVault for both minting and fee transfers to keep mint authority centralised.
5. After maturity, PT holders redeem remaining token/fee balances and can roll into a fresh tranche.

## MVP Deliverables
- CreatorVault onboarding flow + SY mint deployed to Solana devnet with CLI support.
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
- ⏳ AMM (Pendle-based): CWAMM math + devnet pool deployment.


## Path After MVP
- Focus on builder/creator acquisition.
   - reach out + incentives
   - rev share with ICM launchpads
- Integrate credit modules with LTVs, grace periods if revenues do not cover principal+interest until maturity, liquidations.
- Reach out for card integration to enable credit lines.
- When the revenue/fee authority from a Solana launchpad cannot be transferred, use or create a token migration tool.


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
On-chain revenue stream ──► CreatorVault (Squads 2-of-2 admin)
      │
      ├─ wrap_fees → mint SY
      ├─ lock_collateral / unlock_collateral → financing control
      └─ withdraw_fees (creator always retains)

SY → PT + YT via Splitter
      │           │
      │           └─ redeem_principal → PT (post-maturity)
      └─ redeem_yield → CreatorVault fees or StableVault inflow

StableVault ←─ keeper sweep (SOL split) ── CreatorVault
      │
      ├─ deposit_stable (USDC/USDT/USDe/USDC+) → mint attnUSD
      ├─ redeem_attnusd → withdraw underlying basket
      └─ fund_rewards (bps slice) → RewardsVault (sAttnUSD rewards)

RewardsVault
      ├─ stake_attnusd → mint sAttnUSD, accrue SOL index
      └─ unstake / claim → return attnUSD + SOL rewards

AMM (v0 pending)
      └─ Planned PT ↔ attnUSD pools for YT sales and pricing

Governance / Ops
      ├─ Pause gates on CreatorVault / StableVault / RewardsVault
      ├─ Keeper ops tagged with monotonic operation_id
      └─ Indexer/API exposes /v1/* with weak ETags, /readyz, /version
```

| Program | Responsibilities | Key Seeds / Notes | Idempotent & Pause Highlights |
|---------|------------------|-------------------|-------------------------------|
| **CreatorVault** | Custodies redirected on-chain revenue PDAs (Pump.fun CTO handovers or other fee migrations), mints Standardized Yield (SY), exposes CPI hooks for minting and fee transfers. | `creator-vault`, `fee-vault`, `sy-mint` derived per stream via `ctx.bumps`. | **Admin = Squads Safe (2-of-2 sponsor+attn)**; optional `emergency_admin` Safe; `wrap_fees` disabled when `paused`; SOL reward split via `sol_rewards_bps`. |
| **Splitter** | Burns SY, mints PT/YT, accounts for yield and redeems principal. | `market`, `user-position`, `splitter-authority` (derived from CreatorVault). | Uses CreatorVault CPI for both mint and fee transfer; signer seeds recomputed each ix. |
| **StableVault** | Converts creator-fee SOL into a stable basket, issues `attnUSD`, manages conversion queue. | `stable-vault` seeded by `authority_seed`; custody PDAs for share mint, accepted stables, SOL treasury. | `sweep_creator_fees(operation_id)` funds RewardsVault before conversions; `process_conversion(operation_id)` enforces replay safety; pause + keeper authority gating. |
| **RewardsVault** | Optional SOL rewards layer for `attnUSD` stakers (sAttnUSD). | `rewards-pool`, `rewards-authority`, `stake-position`, `s-attn-mint`, `attn-vault`, `sol-treasury`. | `fund_rewards(operation_id)` monotonic, tracks `last_fund_id`; pool pause halts stake/claim; admin + allowed funder enforcement. |
| **AMM** | Pendle-inspired PT/quote and `attnUSD`/quote swaps + LP. | `pool`, `position` PDAs per market. | Future keeper hooks (rebalances) respect global pauses before executing trades. |

Vault-level events emit `last_*_id` counters so the indexer can dedupe and `/v1/governance` reflects admin + pause status across the stack.

## Deployed IDs (devnet)
| Program | ID |
|---------|----|
| CreatorVault | `HDztZyNcij21HhF5SR6rhk9wx9qx6yViebUrVU9W6C86` |
| Splitter | `AmGu31S9SPLXj12etgXKnuVMzTNb653mRjkSqU8bgaPN` |
| StableVault | `98jhX2iz4cec2evPKhLwA1HriVEbUAsMBo61bQpSef5Z` |
| RewardsVault | `6M8TEGPJhspXoYtDvY5vd9DHg7ojCPgbrqjaWoZa2dfw` |
| AMM (placeholder) | `4DSYe8VteU1vLgwGrTeoyGLZdsCG87srCVLkVqza3keg` |

Example PDAs (illustrative seeds using demo inputs):
- `creator_vault` = `F59VzNTJzwLHhEAMXdgcFSG7BAomEE9v2HthgERryV3G`
- `fee_vault` = `HN41nBgLMX1muHNXczTwLmCkRfK6YdqpZ2aCFYBAdkgp`
- `sy_mint` = `5rSnbBhCLZ7kcEEsYhuwLy9tL2G9EErbkEy7KwV8ahYZ`
- `rewards_pool` = `3Qx9aXCC7aXxgvHg3fwpitPXxPgKJvCHxXaHS7rjJFxx`
- `rewards_authority` = `38WNm4rgzFpCxNBS2r5L1RnL4tmDK5v226k9c9uxMYKP`
- `rewards_attn_vault` = `8TwJP8ZozGMy9QFuW1kgNWjt8cwBNaZxsfyn68U3RicF`
- `rewards_sol_treasury` = `FhLaqT6vbupK8vLVW9GSexQPfopKe3YSEKXSGGGcdhFu`
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
- Governance: Squads multisig admins (CreatorVault 2/2 sponsor+attn; optional emergency admin)
- Safety: pause gates on writes; `operation_id` idempotency for sweep/convert/fund
- Assets: SY / PT / YT / attnUSD / sAttnUSD are SPL mints

## License & Status
- MVP quality, **devnet only**. Audits + mainnet guardrails TBD.
