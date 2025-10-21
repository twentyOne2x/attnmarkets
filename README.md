# attn.markets Pump.fun Executive Summary

## What We’re Building
attn.markets tokenises Solana fee streams (ICM, creator token) into a Pendle-style principal and yield claims. Pump.fun’s CTO flow is the first on-ramp: once fees point to an attn PDA, we wrap them into standardized yield (SY) and split into Principal (PT) and Yield (YT) tokens, a pattern we can reuse wherever fee authority can be reassigned.

### What this unlocks
- **Creators & builders** – Package fee rights into PT/YT to pre-sell cash flows, hedge volatility, or even sell perpetual claims without touching the base token.
- **DeFi users, protocols, risk desks** – `attnUSD` and YT tranches turn fee exposure into diversified, yield-bearing assets for farmers, risk custodians, treasuries, and other structured products.
- **Composable rails** – SY/PT/YT feed the AMM, stable vault, and forthcoming credit/hedging modules—the backbone for internet capital markets on Solana.

## Why Pump.fun First
- **Native reassignment path** – Pump.fun already supports CTO fee authority transfers, so we can redirect fees to an attn-controlled PDA without modifying the original token.
- **Meaningful cash flow** – The top Pump tokens generate material SOL fees.
- **Active communities** – Migrating fee ownership unlocks new tools, hedging, upfront financing, sell claim on all future fees.

## Core Building Blocks
1. **CreatorVault PDA** – Custodies the Pump fee PDA post-CTO, collects SOL, and mints SY SPL tokens.
2. **SY → PT & YT Splitter** – Burns SY and mints equal PT and YT amounts for a chosen maturity. PT redeems the principal at maturity; YT accrues fees continuously.
3. **Stable Yield Vault (attnUSD)** – Default destination for YT cash flows. LPs deposit approved stablecoins (USDC/USDT/USDe, etc.) to mint `attnUSD` shares, while the vault converts incoming creator fees into the same basket so the share price captures protocol-wide yield.
4. **Pendle-inspired AMM** – Supports PT/quote and `attnUSD`/quote swaps with concentrated liquidity and time-decay pricing.
5. **Creator + Holder Console** – Web UI and CLI for CTO guidance, wrapping/splitting, fee claims, redemptions, and liquidity provisioning.
6. **Indexer & Monitoring** – Tracks fee inflows, SY/PT/YT supply, accrued yield, maturity events, and raises alerts on flow disruption.

## End-to-End User Flow
1. Community submits CTO request naming the attn CreatorVault PDA as the new fee authority.
2. Pump.fun approves and executes `set_creator`, redirecting fees into the vault.
3. Users wrap Pump tokens or fee balances to mint SY, then split into PT + YT via Splitter.
4. Fees stream into the vault; YT holders redeem yield directly or route it into the Stable Yield Vault (`attnUSD`). LPs mint `attnUSD` by depositing approved stablecoins (USDC/USDT/USDe, etc.) and share in creator-fee yield as NAV grows. Splitter now CPIs into CreatorVault for both minting and fee transfers, keeping mint authority centralized in CreatorVault.
5. At maturity, PT holders redeem remaining Pump tokens/fees, and the market can roll into a fresh tranche.

## MVP Deliverables
- CreatorVault + SY mint deployed to Solana devnet with CLI support.
- PT/YT splitter markets with yield redemption accounting, using CreatorVault CPI hooks for minting and yield payouts.
- Stable Yield Vault aggregating YT flows into `attnUSD` shares.
- Minimal PT/quote and `attnUSD`/quote AMM pools.
- Frontend (creator dashboard + investor portal) and supporting indexer APIs.
- Guarded mainnet launch for a single Pump token once tests and audits pass.

### Backend Status (Oct 2025)
- ✅ CreatorVault exposes `mint_for_splitter` and `transfer_fees_for_splitter` CPI endpoints locked to a `splitter-authority` PDA.
- ✅ Splitter now derives its `splitter-authority` account, CPIs through CreatorVault for PT/YT/SY minting, and routes fee withdrawals via the new CPI.
- ✅ Integration test (`cargo test -p splitter`) covers mint → accrue → redeem yield → redeem principal using the CPI flow.
- ⏳ Next: wire attn_client SDK helpers to the updated instruction set, scaffold StableVault/`attnUSD`, and extend docs once end-to-end flows are finalized.

## Path After MVP
- Expand to additional Pump tokens via batch CTO onboarding.
- Offer optional standalone YT pools for communities wanting direct exposure.
- Integrate credit/hedging modules powered by PT/`attnUSD` collateral.
- Extend migration tooling to other Solana launchpads once fee authority transfers are feasible.

attn.markets turns Pump.fun creator fees into composable DeFi assets—unlocking upfront funding for teams and diversified yield for investors, all without rewriting the original token.
