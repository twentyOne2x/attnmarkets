# attn Creator Fee Marketplace Design

## Summary
The attn protocol brings Pendle-style yield tokenization to creator-fee streams. We start with Pump.fun, using Community Takeover (CTO) approvals to reassign fee authority per token, then route each stream into CreatorVault—a Squads Safe controlled jointly by creator and attn (2-of-2)—which mints Standardized Yield (SY) that splits into Principal Tokens (PT) and Yield Tokens (YT). PT tracks the underlying token exposure, YT captures future fees, and both trade on an attn-operated AMM with optional auctions and vault products layered on top. CreatorVault’s `lock_collateral` / `unlock_collateral` workflow keeps withdrawals creator-only when no advance is active, auto-expiring locks at maturity so the flow stays unstoppable even if attn infrastructure is offline. Creators can hedge or pre-sell revenue, investors can access low-correlation yield, and a migration toolkit extends the same stack to other launchpads whose fee rights are portable.

## Expected Outcome
- Every Pump.fun takeover (and future launchpad integration) produces a canonical PT (principal) and time-bound YT (future fees) representation for that token’s fee stream, including legacy assets sourced from third-party liquidity pools.
- Creator fee PDAs, or equivalent revenue routers, are reassigned or migrated into dedicated attn vaults, ensuring deterministic accounting between principal and yield streams while minimizing new approvals or custody changes.
- Holders can redeem PT for the original token or maintain exposure to price action while selling modulated fee rights through YT.
- Creators gain tooling to auction or hedge future fees (1-day, 1-week, custom maturities) and optionally stake the resulting YT into managed pools.
- Liquidity migrators and bonding curves re-emit existing pools into PT/YT markets on a token-by-token basis with optional meta-transactions for gasless participation.
- Risk custodians and portfolio managers can access diversified, low-correlation fee yield instruments backed by verifiable on-chain flows.

## Goals
- Provide a seamless tokenization path for creator-fee streams, starting with Pump.fun CTO takeovers and extending to launchpads that require full migration, while minimizing disruption to existing holders.
- Introduce standardized PT and YT SPL tokens with metadata capturing creator and maturity information.
- Deliver contract, CLI, and UI components that support issuance, redemption, auctions, staking, and DeFi integrations.
- Build comprehensive observability, governance, and safety features for managing fee flows and liquidity migrations.
- Drive development through clearly specified tests that capture expected behaviour for all critical flows.

## Non-Goals
- Rewriting creator fee logic within source tokens.
- Shipping a full-featured AMM or lending market (we will integrate via adapters rather than build from scratch).
- Handling custody or compliance obligations for participants beyond configurable access controls.
- Producing tax or financial reporting tools in the initial release.

## Stakeholders
- **Creators**: hedge or pre-sell future fees, unlock upfront liquidity, maintain upside with minimal wallet changes.
- **Token Holders**: separate principal from fee yield, access low-correlation income, choose PT exit or YT farming paths.
- **Risk Custodians & Funds**: add verifiable fee streams with muted market beta and configurable maturities to managed portfolios.
- **DeFi Integrators**: list PT/YT markets, plug in structured products, and surface analytics for fee-backed assets.
- **attn Protocol Team**: operate contracts, front-ends, and risk systems while capturing protocol revenue.
- **Auditors & Security Partners**: harden fee routing, vault logic, and governance controls.

## Background
Existing creator-fee tokens accumulate revenue in owner-controlled wallets. Holders cannot separate principal token exposure from fee revenue, preventing sophisticated hedging or structured products. Tools to pre-sell or collateralize future fees are primitive, typically requiring off-chain deals or bespoke contracts. The attn protocol standardizes fee tokenization so any creator-fee token (not just Pump.fun) can integrate with broader DeFi primitives.

## Creator-Fee Platform Coverage
- **Pump.fun / PumpSwap**: Bonding curve trades charge 1.25% with 0.30% routed to the creator. Graduated PumpSwap pools continue sharing 0.95%–0.05% of volume with creators depending on market-cap tiers. Migration tooling must capture both the bonding-curve backlog and PumpSwap fee vaults when wrapping into PT/YT.
- **Believe (Meteora DBC)**: Believe launches on Meteora’s Dynamic Bonding Curve with trading fees split 70/30 between creator and platform (previously 50/50). Daily SOL distributions flow through Meteora’s fee vaults, so our LiquidityMigrator needs adapters that preserve those payouts post-tokenization.
- **Time.fun**: Runs a bonding-curve minute market that allocates most trading fees (headline 2%) to creators and pays 94%–96% of redemption value back to them. Creator vaults must ingest both the trading fee stream and redemption escrow releases; YT maturities can mirror redemption cadence (DMs, calls, group access).
- **Moonshot**: Charges a 1% taker fee in SOL and, on Raydium migration, airdrops LP rewards to top holders while routing Meteora LP rewards (post-2 Apr 2025) directly to the creator wallet. Migration scripts should sweep both the 1% fee stream and any outstanding AirLock rewards into the PT/YT vault.
- **Bags.fm**: Enforces a perpetual 1% royalty on all trading volume, programmable to share across multiple wallets. Our design can map each Bags fee split to dedicated sub-vault tranches so collaborators retain their agreed percentages after PT/YT issuance.
- **LetsBonk (Bonk Fun)**: Imposes a 1% platform fee that funds BONK buybacks, validator support, and development, with no native creator royalty. These tokens can still use PT/YT hedging for redemption-style income, but migration may not prioritize fee capture unless custom incentives are introduced.
- **Other Launchpads**: Additional Solana memepad variants (e.g., Launchflow, DMint) generally emulate bonding-curve fees with configurable creator splits. The LiquidityMigrator should expose an adapter interface so new fee vault patterns can be onboarded without core changes.

### Fee Capture Constraints
- **Pump.fun / PumpSwap**: Creator fees accrue to PDAs derived from `BondingCurve::creator` or `Pool::coin_creator`. Claiming requires that pubkey’s signature, and only the platform’s `set_creator_authority` can reassign the field. Pump.fun’s Community Takeover (CTO) flow lets sponsors (creators, businesses, or DAOs) petition Pump to transfer that authority if the original team is inactive; applications (X form + due diligence) must prove active stewardship and receive Pump approval before fees are reassigned. Consequently, third parties cannot redirect fees unilaterally; either creators opt in at launch, Pump executes a CTO handover, or tokens migrate into CreatorVault safes.
- **Meteora / Believe DBC**: DBC config keys hard-code fee claimers and feed into Meteora’s Dynamic Fee Sharing vaults with immutable share allocations. Integrations must either co-launch with our fee recipient or migrate tokens to attn-managed vaults to guarantee capture.
- **Moonshot**: Canonical pools and AirLock rewards route through creator-controlled vaults; `collectCoinCreatorFee` mandates the creator signature. Attn cannot override these without creator action, so migrations or explicit delegation agreements are required.
- **Bags.fm**: A perpetual 1% royalty is locked in at launch, with fee splits immutable afterward. Our enforcement path is either co-launch with CreatorVault safe destinations (Squads `{creator, attn}` 2-of-2) or migrate tokens into CreatorVaults that re-route the royalty stream.
- **Time.fun & Centralized Launchpads**: Fee routing is managed off-chain by the platform, with no on-chain delegation hooks. Integration demands formal partnerships or post-launch migration to protocols we control.
- **Conclusion**: Across major launchpads, existing tokens cannot be force-intercepted. Migration (or creator-signed delegation at launch) remains the least invasive yet deterministic method for bringing fee streams under CreatorVault custody (Squads dual control).

## Pump.fun Integration Strategy
- **Creator Opt-In or CTO**: Creators opt in directly or a sponsor (community, business, or DAO) files a Pump.fun CTO request (Google/X form) documenting active stewardship. Upon approval, Pump executes `set_creator` / `set_creator_authority`, pointing the bonding-curve creator PDA to the CreatorVault Squads Safe (sponsor+attn, 2-of-2) nominated in the application.
- **Fee Redirect & Vault Hookup**: Once authority is transferred, attn signs `collectCreatorFee` to sweep existing balances, then stakes the creator PDA into the CreatorVault FeeRouter so all future fees flow into attn-managed sub-vaults without reissuing the underlying token.
- **PT/YT Issuance**: Holders can optionally deposit Pump tokens into the attn CreatorVault to receive PT/YT receipts; alternatively, attn can run a migration campaign (airdrops, incentives) to wrap supply over time while fees already route through the vault.
- **Liquidity & Marketplace**: PT/YT pairs list on the forked Pendle AMM, and the marketplace offers credit/insurance modules leveraging the captured Pump fee stream.
- **Governance & Reporting**: Every CTO-backed acquisition emits onchain events (fee share, acquisition price, maturity plan) and is subject to DAO oversight on capital deployment, aligning the Pump rollout with community expectations.

## Migration Toolkit for Non-Reassignable Platforms
When creator-fee authority cannot be reassigned (e.g., Meteora, Bags, Moonshot), we rely on the migration toolkit described below.
1. **Migration Tooling** converts an existing token into a PT/YT pair without altering the underlying supply. Holders wrap tokens to receive PT and the current epoch’s YT.
2. **Creator Vault Contracts** intercept creator fees, mint YT per maturity, track principal reserves, and coordinate redemptions.
3. **Liquidity Migration Modules** re-emit existing token supplies and LP positions into PT/YT markets, offering meta-transaction rails so creators can migrate with minimal wallet interactions (inspired by production precedents such as Believe’s migrator flows).
4. **Pendle-Style Mechanics** create time-based YT tranches with programmable maturities (default 1 day, 1 week, 1 month) and support auctions for upcoming tranches.
5. **DeFi Adapters** connect PT/YT exposure to staking pools, lending markets, and institutional dashboards.
6. **Observability Layer** indexes fee flows, PT/YT supply, and maturity performance for analytics and risk management.

## Architecture
### On-Chain Components
- **MigrationManager**: orchestrates deployments; validates creator ownership; stores registry of vaults and supported maturities.
- **CreatorVault**: receives fees, escrows principal, mints/burns PT and YT, handles settlement and emergency controls.
- **PTToken / YTToken Contracts**: SPL tokens with metadata for `creator`, `maturity`, and `trancheId`; support allowance-less transfers via permit or CPI helpers.
- **Token Program Scope**: All mint/burn CPIs target the classic SPL Token program (`Tokenkeg...`). Token-2022 compatibility is explicitly deferred.
- **FeeRouter**: upgradeable contract forwarding fees from legacy token/DEX distributions into the vault; includes pause and fallback paths.
- **AuctionModule**: manages fixed/English/Dutch auctions for upcoming YT tranches, distributing proceeds to creators minus protocol fees.
- **StakingPool (YT Aggregator)**: pools YT streams, routes yield into curated DeFi strategies, issues LP/shares, enforces risk caps.
- **Governance Module**: attn multisig or DAO controlling parameters (fees, supported maturities, emergency stops).
- **LiquidityMigrator**: wraps legacy liquidity positions from Solana launchpads (e.g., Pump.fun bonding curves, Meteora pools) into PT/YT pairs, optionally performing bonded re-issuance or dual-sided provisioning with minimal approvals.
- **WalletDelegateProxy**: optional contract enabling creators to sign a single permit that delegates migration authority to the tool without moving root custody.
- **Stable Yield Vault**: accepts deposits of approved stablecoins (USDC/USDT/USDe, etc.) from LPs, converts all creator-fee inflows into the same basket, and issues share tokens (`attnUSD`) whose NAV captures system-wide yield.

### Off-Chain Components
- **Migration CLI/SDK**: `attn migrate --token <address>` handles signature collection, deployment scripts, snapshot generation, and fee router installation.
- **Indexer & Analytics API**: monitors fee inflows, YT accrual, PT discounts, auction outcomes; exposes GraphQL/REST endpoints.
- **Relayer Service** (optional): batches redemptions or auctions for gas efficiency.
- **Front-Ends**: creator onboarding wizard, holder migration portal, PT/YT trading dashboard, staking and analytics interfaces.
- **Liquidity Snapshotper**: crawls existing LPs, calculates proportional PT/YT allocations, and supports atomically migrating LP positions into the new markets.
- **Meta-Tx Relay**: allows creators and LPs to submit signed migration requests that the protocol executes, ensuring minimal wallet intervention.

## Legacy Token Migration Strategy
We target a token-by-token upgrade cadence to reduce blast radius and mirror live best practices (reference: Believe’s migrator contracts). Each migration follows a standardized sequence while permitting bespoke adapters for unique liquidity setups.

1. **Discovery & Analysis**: index outstanding supply, LP venues, and fee router topology.
2. **Permit Collection**: gather EIP-2612 or Permit2 signatures from creator wallets and major LPs, authorizing the LiquidityMigrator to act.
3. **Liquidity Pull & Re-Emission**:
   - For bonding-curve style pools, settle outstanding debt and mint equivalent PT/YT liquidity.
   - For traditional AMMs, withdraw LP tokens, mint PT/YT, and re-seed specialized pools (e.g., PT-Underlying, YT-Stable).
4. **Holder Distribution**: use snapshots or merkle claims to deliver PT/YT to existing holders, minimizing the need for wallet interaction beyond optional claims.
5. **Wallet Transition Options**: creators can direct future fees either to the existing wallet (delegated to Vault via FeeRouter) or to a freshly generated vault-controlled wallet, depending on operational preferences.
6. **Post-Migration Guardrails**: monitor for straggler liquidity, provide incentives for late LP migration, and sunset old pools via coordinated governance signals.

### Lessons from Believe / Meteora DBC Flows
- **Launch Token Re-Minting**: Believe relies on Meteora’s Dynamic Bonding Curve (DBC) to issue a fresh token that mirrors supply while managing price discovery. Our LiquidityMigrator follows a similar pattern by minting PT/YT receipts and unwinding legacy curves gradually to prevent large price gaps.
- **Meta-Transactions for Creators**: Believe’s UX favors “one-click” delegation so migration executors handle on-chain calls. WalletDelegateProxy and Permit2 support the same gasless workflow for attn.
- **Per-Launch Fee Vaults**: Believe isolates each launch’s fee wallet to simplify accounting. CreatorVault sub-accounts mimic this, letting us tokenize each fee stream independently.
- **LP Coordination**: Believe coordinates liquidity relayers (market makers) to reseed post-migration pools. We expose hooks so protocol-owned or partner liquidity can replay this liquidity bootstrap.

### Data Model Highlights
- `CreatorVault`: stores `creator`, `underlyingToken`, `ptToken`, `ytTokens[maturity]`, `feeRouter`, `protocolFeeBps`, `state`.
- `PTToken`: `totalSupply`, `underlyingExchangeRate`, `maturity` (optional if perpetual), `redeemPaused`.
- `YTToken`: `maturityTimestamp`, `accruedYield`, `lastClaimedBlock`, `epochEmissionRate`.
- `Auction`: `trancheId`, `maturity`, `reservePrice`, `clearingPrice`, `winnerAddresses`, `proceeds`.

## Migration Flow
1. **Creator Authorization**: Creator signs a message proving control over the fee wallet and approves MigrationManager to manage vault deployment.
2. **Snapshot/Distribution**: Optional off-chain snapshot of holder balances at block N creates a merkle tree for token claims.
3. **Liquidity Migration Prep**: LiquiditySnapshotper identifies LP positions and obtains permits for LiquidityMigrator to remove liquidity atomically.
4. **Vault Deployment**: MigrationManager deploys CreatorVault, PT and YT contracts, registers default maturities, and initializes FeeRouter.
5. **Token & LP Wrapping**: Holders deposit the legacy token into the vault to receive PT plus the active YT (mirroring underlying notional). LiquidityMigrator simultaneously unwinds LP positions and reseeds PT/YT pools, ensuring price continuity.
6. **Fee Redirection**: FeeRouter diverts ongoing fees into the vault, where they accrue to outstanding YT holders for the relevant epoch. Delegated wallet proxies ensure the creator signs once, with minimal ongoing maintenance.
7. **Auction/Hedging**: Creator may auction upcoming YT tranches to receive upfront capital or hedge future fees.
8. **Redemption**: At maturity, YT holders claim accrued fees; PT holders can unwrap to the underlying token or roll into new maturities.
9. **Unwind Option**: Governance-defined process allows vault decommissioning, redistributing remaining principal and fees to PT/YT holders. LiquidityMigrator supports reverse migration if the creator opts out.

## Per-Token Walletization & Fee Securitization
- **Sub-Vault Addresses**: CreatorVault can derive unique sub-accounts (PDAs on Solana) per token launch. FeeRouter directs fees for Token A to sub-vault A, keeping Token B’s revenues isolated.
- **Token-Scoped Metadata**: PT/YT tokens embed `creator`, `launchId`, and `maturity` so downstream markets can distinguish each fee stream and principal bundle.
- **Granular Fee Sales**: Creators may tokenize and sell fee rights tranche-by-tranche per token. Auctions can target a single launch without touching other launches controlled by the same wallet.
- **Minimal Wallet Movement**: Default flow keeps funds in the original creator wallet; delegation and meta-transactions execute migrations and fee redirections without large custody changes unless explicitly approved.
- **Multi-Wallet Teams**: Governance can map multiple whitelisted fee wallets to a single CreatorVault, while still issuing per-token fee instruments. This supports studios launching multiple tokens across different operators.
- **Stable Yield Distribution**: Matured YT streams automatically sweep excess fees into the Stable Yield Vault. LPs mint `attnUSD` shares by depositing stablecoins; the vault converts fee inflows to the same basket so NAV appreciation delivers averaged yield across all creator launches.

## Token Lifecycle
- **Issuance**: PT minted 1:1 with deposited underlying; YT minted based on expected fees for each active maturity tranche.
- **Accrual**: Fees received by CreatorVault are allocated to the active YT tranche proportionally; PT value remains tied to principal.
- **Trading**: PT and YT are SPL tokens tradable on AMMs or OTC; metadata enables aggregator interoperability.
- **Settlement**: On maturity, YT converts accrued fees into distributable assets; PT retains claim on underlying unless unwrapped.
- **Rollover**: Matured YT can be auto-rolled into new tranches via governance rules or user opt-in.

### YT Market Creation
- YT/PT tokens are minted on migration but liquidity pools are not auto-created; LPs or attn-owned vaults seed markets when demand warrants, mirroring Pendle’s opt-in liquidity model.
- By default the protocol sweeps YT cash flows into the Stable Yield Vault, converting fees into a stablecoin basket that backs `attnUSD` shares minted by stablecoin LPs. `attnUSD` acts as the primary yield-bearing stablecoin for the protocol, and concentrating liquidity on PT/quote and `attnUSD`/quote pairs keeps depth simple.
- Creators can opt out and keep a standalone YT mint if their community wants a dedicated YT/quote market; governance can spin up those pools later without impacting the core vault.
- Curated “standard maturities” (1D, 1W, 1M) receive protocol-owned liquidity to ensure price discovery, while long-tail tranches rely on external LP incentives.
- Fixed-maturity YT can also be listed in auction houses or OTC order books for creators seeking forward sales without continuous AMM exposure.

### PT/YT AMM Architecture
- **Base Implementation**: Fork Pendle’s Concentrated Weighted AMM (CWAMM) to Solana, preserving dual-asset pools (PT vs. base token, YT vs. base token) with time decay factors that reflect maturity. Anchor-based program manages pool state, oracle indices, and fee accrual.
- **State Accounts**: Each pool stores `ptMint`, `ytMint`, `quoteMint`, `maturity`, `sqrtPrice`, `liquidity`, and `twapAccumulator`. Position NFTs map to concentrated liquidity ranges, allowing LPs to concentrate around expected PT discounts or YT yields.
- **Swap Logic**: `swap_exact_in` and `swap_exact_out` instructions mirror Pendle math: PT pools incorporate discounting factor `e^{-rt}` derived from maturity time, YT pools treat fee yield as underlying. Solana-specific optimizations (fixed-point math via `u128`) ensure low compute.
- **Liquidity Positions**: Positions minted as token-2022 NFTs enabling composability (can be staked elsewhere). Fee rewards accrue in quote asset and are claimable via `collect_fees` instruction.
- **Contextual Pricing**: TWAP oracles feed downstream integrations (lending, Vault NAV). Since the fork preserves Pendle formulas, aggregator integrations (Jupiter) can quote PT/YT effectively.
- **Protocol-Owned Liquidity**: attn treasury deploys baseline liquidity for canonical maturities; parameter store lets governance adjust target ranges, fees, and incentives.

## Creator & Holder Journeys
- **Creator**: Authenticate -> configure maturities -> migrate -> optionally auction YT -> manage hedging/staking -> explore secondary products (credit lines, insurance, structured notes) built on attn rails -> monitor analytics.
- **Holder**: Deposit legacy token -> receive PT/YT -> trade or stake -> redeem matured tranches -> track yield via dashboards.
- **Custodian**: Review risk metrics -> allocate capital into curated YT pools -> monitor performance and compliance hooks.

## Protocol Economics
- **Supply**: PT equals circulating underlying; YT per maturity equals forecast fee inflow.
- **Fees**: Protocol takes configurable percentage of fees before YT distribution; auctions and staking carry protocol fees.
- **Yield Profile**: Creator-fee cash flows historically show muted beta versus market-wide swings; Stable Yield Vault diversifies tranches into averaged stablecoin returns.
- **Incentives**: Governance token rewards for YT LPs, early creator rebates, institutional partner discounts.
- **Liquidity Strategy**: Provide protocol-owned liquidity; partner with professional market makers for deep PT/YT pools.

## Adoption Incentives
- **Migration Grants & Rebates**: Offer ATTN-denominated grants, fee waivers, or shared protocol revenue for early cohorts that migrate fee streams into CreatorVaults.
- **Liquidity Mining**: Allocate targeted ATTN or stablecoin rewards to PT/YT pools and Stable Yield Vault LPs, ensuring migrated assets enjoy immediate depth.
- **Revenue Sharing**: Route a slice of protocol fees back to creators and integrators who drive sustained volume, reinforcing long-term alignment.
- **Co-Marketing & Analytics**: Provide partners with branded dashboards, portfolio analytics, and API distribution channels to showcase low-correlation fee yields.
- **Structured Product Integrations**: Collaborate with lending desks and asset managers to package attn PT/YT into credit lines or notes, increasing utility for migrating projects.
- **Creator Product Access**: Curate an attn “Product Marketplace” where creators can opt into vetted modules (advance financing, insurance wraps, automated hedging) operated by third parties or attn Labs; participation earns revenue shares and deepens retention.

## Marketplace Blueprint
- **Primary Modules**:
  - `attnAdvance`: Protocol-operated credit line that lends USDC against discounted PT collateral, using AMM prices and risk buffers.
  - `YieldShield`: Partner-provided insurance covering fee underperformance; priced via YT volatility metrics and underwritten by insurers staking in a segregated pool.
  - `FeeAuction Hub`: Batch auction mechanism enabling creators to sell upcoming YT tranches directly to market makers or custodians.
- **Integration Surface**:
  - Standardized SDK exposing PT/YT pricing, maturity calendars, and vault APIs so external builders can deploy bespoke products.
  - Governance whitelists modules, sets revenue-sharing splits (e.g., 80/20 builder/attn on protocol fee uplift).
- **Discovery Layer**:
  - Marketplace UI embedded in creator dashboard, highlighting eligible modules based on vault history (e.g., creators with >30 days fees can tap credit lines).
  - Analytics slice for custodians to evaluate product combos (e.g., PT leveraged via credit + insurance).
- **Economics**:
  - Marketplace fees funnel partially into Stable Yield Vault to enhance system-wide APY.
  - Builders required to stake ATTN or PT to align incentives and cover potential slashing (e.g., underperforming insurance).

## Team Functions (will be very lean, most hats worn by few people)
- **Protocol Engineering**: Build and maintain CreatorVaults, LiquidityMigrator, Stable Yield Vault, fee routers, and AMM components; requires Solana/Anchor expertise and audited DeFi experience.
- **Backend & Data**: Run indexers, analytics services, snapshot tooling, relayers, and monitoring pipelines to ensure accurate fee accounting.
- **Frontend & UX**: Deliver creator onboarding, holder dashboards, PT/YT trading interfaces, marketplace discovery, and governance consoles.
- **Quant & Risk**: Model fee cash flows, price YT tranches, set incentive budgets, and monitor low-correlation yield metrics.
- **BD & Partnerships**: Manage creator acquisition, launchpad relationships, institutional custody integrations, and third-party product growth.
- **Ops & Compliance**: Coordinate audits, treasury, governance proposals, KYC-enabled pools, and incident response.
- **Support & Community**: Provide creator concierge, documentation, SDK support, and community engagement.
- **Product Management**: Align roadmap across protocol primitives, incentives, and marketplace strategy, serving the Pendle-style protocol vision.

## Phase 1 Implementation Roadmap (MVP)
- **Objectives**: Deliver end-to-end migration for an initial creator partner, deploy PT/YT AMM on Solana, launch creator/holder dashboards, and pilot the attnAdvance credit module.
- **Milestones**  
  - Implement CreatorVault v0, PT/YT token contracts, FeeRouter base, and foundational indexer/UX flows.  
  - Integrate LiquidityMigrator pipeline, sub-vault support, Stable Yield Vault stub, and deploy the Pendle-inspired AMM to devnet with TWAP integration.  
  - Complete full devnet migration for a pilot token, launch auction tooling and attnAdvance alpha, seed liquidity, and finalize incentive and governance parameters.  
  - Launch guarded mainnet deployment with partner token, activate Stable Yield Vault deposits, and establish monitoring, documentation, and incident playbooks.
- **Ownership**  
  - Protocol Engineering: Contracts, AMM fork.  
  - Backend/Data: Indexer, APIs, marketplace engines.  
  - Frontend/UX: Web app, dashboards, marketplace UI.  
  - Quant/Risk: Pricing, risk guardrails, incentive tuning.  
  - BD/Ops: Partner onboarding, audits, go-live comms.  
  - Product: Cross-workstream alignment, milestone tracking.
- **Success Metrics**  
  - ≥1 token migrated to CreatorVault with fee routing verified on-chain.  
  - PT/YT AMM pools exceed target TVL and maintain stable discount curves.  
  - Creator dashboard shows live fees, auction results, and credit availability.  
  - attnAdvance issues first secured loan with automated LTV controls.  
  - Alerting coverage for fee router, vault solvency, AMM health, and marketplace modules.

## Test-Driven Development Plan
We adopt a test-first approach, writing failing tests for each critical flow before implementation. Tests fall into unit, integration, and scenario categories.

### Contract Unit Specifications
- **CreatorVault**
  - `deploys_with_expected_metadata`: creator, underlying, maturities recorded correctly.
  - `wrap_mints_pt_and_yt`: depositing underlying mints PT and current YT with conservation of value.
  - `fee_distribution_accrues_to_active_tranche`: fees routed mid-epoch update YT balances proportionally.
  - `redeem_pt_returns_underlying`: PT redemption burns PT and transfers underlying when maturity reached.
  - `pause_controls_effect`: emergency pause halts minting/redemption and reverts unauthorized actions.
- **PTToken / YTToken**
  - `metadata_includes_creator_and_maturity`: on-chain view functions mirror expected data.
  - `permit_signature_transfers`: EIP-2612 permit enables gasless approvals.
- **AuctionModule**
  - `auction_settles_at_clearing_price`: ensures proceeds distribution and YT mint to winners.
  - `creator_receives_proceeds_after_fees`: verifies protocol fee cut and net transfer.
- **FeeRouter**
  - `redirects_fees_post_migration`: incoming fee events forwarded to vault.
  - `falls_back_on_pause`: when paused, funds route back to creator wallet.
- **LiquidityMigrator**
  - `pulls_lp_with_permit`: verifies that permitted liquidity positions can be withdrawn without additional wallet interactions.
  - `reseeds_pt_yt_pools`: ensures migrated liquidity matches pre-migration pricing thresholds.
  - `honors_opt_out`: confirms creators can decline liquidity migration without affecting vault integrity.
- **WalletDelegateProxy**
  - `single_signature_authorizes_actions`: revocable delegation enabling migration operations with minimal wallet friction.

### Integration Tests
- `migration_flow_happy_path`: simulate full flow from authorization through wrapping, fee accrual, and redemption.
- `multi_maturity_fee_split`: confirm daily and weekly YT tranches accrue correct portions when fees arrive between epochs.
- `auction_then_stake`: run auction for future YT, buyer stakes in pool, fees accrue and distribute to stakers.
- `emergency_unwind`: trigger governance unwind and validate final balances for PT and YT holders.
- `cross_protocol_adapter`: ensure PT collateralization works with a mocked lending adapter (loan issuance and repayment).
- `lp_migration_round_trip`: unwind legacy LP via LiquidityMigrator, reseed PT/YT pools, then withdraw to verify no value leakage.
- `meta_tx_creator_migration`: submit migration instructions through relayer and ensure wallet only signs once.
- `stable_yield_vault_distribution`: simulate multiple YT tranches settling into the stable vault and confirm shared yield accounting for downstream users.

### Scenario / Property Tests
- **Invariant**: `PT_supply + outstanding_underlying = constant` subject to fees collected.
- **Invariant**: `Total fees distributed to YT + protocol fees <= total fees received`.
- **Fuzz**: fee arrival times, amounts, and maturities to ensure consistent accrual.
- **Load**: large holder set claiming via merkle tree; measure gas usage and state correctness.
- **Liquidity Invariant**: aggregated value of migrated LP positions equals reseeded PT/YT liquidity within tolerance bounds.
- **Stable Yield NAV**: verify that the Stable Yield Vault NAV increases monotonically with incoming fees minus withdrawals.

### Front-End & CLI Tests
- CLI unit tests verifying configuration parsing, signature flow, and migration orchestration (mocked chain interactions).
- Cypress/Playwright flows for creator onboarding, holder migration, and YT auction participation.
- Snapshot acceptance tests ensuring token-by-token migration UI correctly surfaces liquidity and delegation status.

### Acceptance Tests (Given/When/Then)
1. **Given** a creator token with 100 SOL in fees pending, **when** the migration completes and 1-week YT is auctioned, **then** the creator receives upfront capital minus fees and buyers receive YT representing the next 7 days of fees.
2. **Given** a holder wraps tokens for PT/YT, **when** they redeem PT post-maturity, **then** they receive the original token amount with no loss of notional.
3. **Given** YT is staked in a curated pool, **when** fees accrue across multiple creators, **then** the pool distributes yield proportionally and reports APY via the indexer.
4. **Given** a creator with live AMM liquidity signs a single delegation, **when** the LiquidityMigrator executes, **then** LP positions are reissued into PT/YT pools without additional wallet prompts.
5. **Given** a large holder declines to migrate immediately, **when** they later claim via merkle proof, **then** their PT/YT allocation reflects proportional share of post-migration supply.
6. **Given** multiple YT tranches settle, **when** the Stable Yield Vault converts fees into stablecoins, **then** all `attnUSD` holders receive averaged yield regardless of which token generated the fees.

## Metrics & Observability
- **Protocol Metrics**: total value locked in PT/YT, fee throughput, auction volumes, pool APY.
- **Risk Metrics**: maturity utilization, vault solvency ratio, PT discount to underlying, YT price volatility.
- **Operational Alerts**: delayed fee routing, paused vaults, auction failures, indexer lag.
- **Analytics Outputs**: dashboards for creators/custodians, API endpoints for partners.

## Security & Compliance
- Multi-sig controlled upgrades with time-locks.
- Mandatory external audits before mainnet launch and after major upgrades.
- Bug bounty program focused on vault, fee router, and auction paths.
- Parameter guardrails: caps on maturities, fee percentages, and pause authority.
- Optional KYC gating for institutional YT pools where required by partners.
- Post-migration monitoring for orphaned liquidity or replay risks when legacy pools remain active.
- Stable Yield Vault diversification limits to avoid overexposure to any single stablecoin or strategy provider.

## Rollout Plan
1. **Phase 0 (Internal Testnets)**: implement contracts behind failing tests, run automated suites, perform scenario simulations.
2. **Phase 1 (Closed Beta)**: onboard select creators; run manual monitoring; collect feedback on auctions and fee flows.
3. **Phase 2 (Public Launch)**: open migration CLI/UI, enable staking pools, deploy Stable Yield Vault with conservative parameters, publish analytics dashboards.
4. **Phase 3 (Ecosystem Expansion)**: integrate with external AMMs/lenders, launch structured products, decentralize governance.

## Open Questions
- Optimal cadence and duration for default maturities (daily vs rolling weekly buckets).
- Degree of permissioning needed for institutional pools at launch.
- Loan-to-value expectations from lending partners using PT as collateral.
- Cross-chain strategy: per-chain deployments vs canonical bridging for PT/YT.
- Long-term incentive structure for liquidity without diluting ATTN token economics.
- How aggressively should we incentivize or enforce LP migration to avoid fragmented liquidity?
- What fallback exists if a creator wallet cannot sign permits (hardware/offline) yet still needs non-invasive migration?
- Should we maintain compatibility with alternative migrator patterns beyond the Believe-style re-emission for edge-case tokens?
- Which stablecoin mix and DeFi strategies best balance yield with risk for the Stable Yield Vault, and how are losses socialized across users?

## Appendix A: Example Fee Tokenization
1. Creator migrates token with 1,000,000 underlying units and a 3% trading fee funneling to their wallet.
2. LiquidityMigrator unwinds the existing AMM pool, reseeding PT/Underlying and YT/Stable pairs with equivalent depth.
3. Holders wrap tokens, receiving 1,000,000 PT and YT(Week0).
4. Week 1 fees (5000 units) accrue into YT(Week0) and distribute to holders at maturity.
5. Creator auctions YT(Week1) for upfront capital that equals expected next-week fees, locking in revenue with a single delegation signature.
6. Custodian stakes YT(Week1) in curated pool alongside other creators, earning aggregated fee yield and re-investing into DeFi strategies.
7. Stable Yield Vault converts redeemed YT fees into a basket of stablecoins and distributes averaged yield to all `attnUSD` holders.
8. PT holders retain principal exposure and can redeem or trade PT independently of fee performance.

## Appendix B: Fee Delegation Limitations by Launchpad
- **Pump.fun / PumpSwap**: Creator fees land in a PDA seeded by `BondingCurve::creator`, and `collectCreatorFee` requires that pubkey’s signature. Only `set_creator`, callable by Pump’s `set_creator_authority`, can change the creator, and docs confirm only the creator can sweep the vault (`pump-public-docs/idl/pump.json`, `pump-public-docs/docs/PUMP_CREATOR_FEE_README.md`). Unless Pump reassigns the creator (e.g., via Community Takeovers) or new launches set an attn PDA as creator, fees cannot be made non-revocable without migration.
- **Meteora / Believe DBC**: Config keys hard-code fee claimers, and Dynamic Fee Sharing vaults have immutable share weights after initialization (`docs.meteora.ag/overview/products/dbc/dbc-config-key`, `docs.meteora.ag/overview/other-products/dynamic-fee-sharing/what-is-dynamic-fee-sharing`). Existing tokens cannot add attn as a recipient without Meteora/Believe rotating the config, so reliable capture requires rehousing tokens in attn contracts.
- **Moonshot**: Canonical pools store a `Pool::coin_creator` that directs fees to a vault ATA controlled by the creator, and `collectCoinCreatorFee` requires the creator signature (`pump-public-docs/docs/PUMP_SWAP_CREATOR_FEE_README.md`). The creator key is sourced from the bonding curve or Metaplex metadata; we cannot override it, making migration the deterministic approach.
- **Bags.fm**: Launches mint a perpetual 1% royalty to wallets specified at creation, and splits are “permanent and automatic” (`support.bags.fm/en/articles/11917116-everything-fee-royalty-claim-related`). The SDK only supports setup during launch (`docs.bags.fm/how-to-guides/launch-token-with-shared-fees`), so existing tokens must either include attn from inception or migrate.
- **Time.fun & Centralized Launchpads (LetsBonk, etc.)**: Fees accrue within platform custody and are forwarded based on off-chain routing. These systems do not expose immutable on-chain fee recipients, so enforcement demands bespoke partnerships or migrating the fee stream into CreatorVault safe (Squads 2-of-2 sponsor+attn).
- **Bottom Line**: None of the surveyed launchpads permit third parties to delegate fee collection permissionlessly for live tokens. Protocol-level assurance comes from collaborating at launch to set attn as fee claimer or migrating tokens into PT/YT vaults where the fee router is under attn control.
