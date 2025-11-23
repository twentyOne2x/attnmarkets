# attn Frontend Specification (Pump.fun MVP)

## Objectives
- Deliver a web experience that guides Pump.fun creators through the CTO handover, vault setup, and PT/YT issuance.
- Provide investors and LPs with real-time visibility into fee streams, PT/YT holdings, and attnUSD yield.
- Mirror Pendle’s UX patterns (portfolio overview, markets list, swap/liquidity tabs) while adapting to Solana specifics and Pump-focused flows.
- Ensure all flows work with wallet providers (Phantom, Backpack, Solflare) and can run on devnet/mainnet-beta.

## Target Users & Journeys
1. **Creators / Community Leads**
   - Learn how the Pump CTO handover works.
   - Submit CTO request information, track status, and handoff creator PDA to attn vault.
   - Wrap their token/fees into SY, split into PT/YT, and optionally configure marketplace modules.

2. **Yield Investors / LPs**
   - Discover Pump markets, view fee metrics and maturities.
   - Mint PT/YT or buy/sell on AMM.
   - Provide PT/quote or attnUSD/quote liquidity.
   - Stake attnUSD or redeem yield.

3. **Protocol Operators / Analysts**
   - Monitor totals: fees collected, attnUSD supply, TVL per market.
   - Surface alerts (fee flow disruptions, maturities pending) in UI.

## Information Architecture
- Two Next.js targets now live in the repo:
  - `apps/dapp`: legacy, demo-only experience kept stable for existing flows.
  - `apps/dapp-prod`: experimental build with Demo↔Live toggle, health checks, and API-backed providers intended for prod.attn once validated.

- **App Shell** (shared navigation):
  - Logo + “attn” brand.
  - Tabs: `Overview`, `Markets`, `Creator`, `Portfolio`, `attnUSD`, `Rewards`, `Docs`.
  - Wallet connect button with network toggle (devnet/mainnet) and mode switch (`Demo` default, `Live (devnet)`).
  - Banners: (1) Live mode (“Live mode – devnet”) with dismiss + info link, (2) Pause alerts when any vault reports `paused` via `/v1/governance` (disables write actions globally).

- **Overview (Landing)**
  - Hero: “Tokenize Pump.fun creator fees into PT/YT.”
  - Metrics: total fees managed (SOL→USD), attnUSD APY, number of Pump markets live, total PT/YT TVL.
  - CTA buttons: `Start as Creator`, `Explore Markets`.

- **Markets (Explorer)**
  - Table of Pump tokens with columns: Token, Fees (24h/total), attnUSD APY, PT discount, Maturity (next tranche), Status (active/CTO pending).
  - Filters: sort by fees, maturity, status, search by token symbol.
  - Row actions: `Wrap & Split`, `View Market`.
  - “Coming soon” section for future launchpads.

- **Creator Portal**
  - **Step 1: CTO Checklist** – instructions, pre-filled template for Pump CTO form (with vault PDA address), status tracker (Manual input: “Pending / Approved / Rejected”).
  - **Step 2: Vault Setup** – once CTO approved, surface current lock state (`locked`, `lock_expires_at`), expose creator-side `withdraw_fees` when unlocked, provide an "Auto-sweep" toggle that executes `set_sweeper_delegate` (choose delegate = attn keeper, optional fee share), and stage Squads instructions for `lock_collateral` / `unlock_collateral` around advances; show `collect_fees` status and allow sweeping existing balances.
  - **Step 3: Wrap & Split** – form to enter amount of Pump tokens or raw SOL to wrap, select maturity (1D/1W/1M), preview PT/YT output, confirm split.
  - **Step 4: Post-Split Actions** – link to attnUSD vault, sAttnUSD staking (Rewards vault), auctions, and AMM liquidity pages.
  - Analytics panel: historical fees, maturity schedule, attnUSD yield contributions, SOL reward share (bps).

- **Portfolio (user-specific)**
  - Summary cards: PT balance, YT balance, attnUSD balance (showing NAV growth), sAttnUSD balance (claimable SOL), next maturities, plus a creator-only widget that highlights vault lock status and unlock ETA.
  - Positions table grouped by market:
    - For PT: quantity, market price, next maturity, `Redeem` button (enabled post-maturity).
    - For YT: quantity, accrued yield (SOL & USD), `Claim` button.
    - For CreatorVault owners: fee vault balance, `Withdraw fees` action (enabled only when unlocked), auto-sweep status (delegate address, fee bps, last sweep timestamp) with buttons to enable/disable or reconfigure, lock toggle CTA that routes to Squads proposal when a loan is active, and copy explaining auto-expiry at maturity.
    - For attnUSD: balance, current APY, NAV delta, StableVault keeper status/pause badge; no claim actions while paused.
    - For sAttnUSD: staked balance, pending SOL, last fund id, `Claim SOL`, `Unstake`; disables buttons if Rewards pool paused.
  - Activity feed: recent wrap/mint/redeem/swap transactions with links to Solscan.

- **attnUSD Hub**
  - Display attnUSD supply, APY, conversion history (SOL→USDC), and risk summary.
  - Surface `sol_rewards_bps`, keeper authority status, last sweep/conversion IDs, and pause state with tooltips.
  - `Deposit` (for direct YT contributions) and `Redeem` actions; clarify that yield accrues via NAV.
  - Optionally show external integrations (lending partners once available).

- **Rewards (sAttnUSD)**
  - Card with total staked attnUSD (`total_staked`), SOL/share index (`sol_per_share`), last fund id / treasury balance, pending SOL (per vault + per-user).
  - Actions: `Stake attnUSD`, `Unstake`, `Claim SOL`.
  - Table of reward events (funded, claimed) sourced from indexer `/v1/rewards*` with cursor pagination and 304 handling (weak ETag caching).
  - Devnet-only guard: require wallet connected on devnet, otherwise show read-only stats.

- **Market Detail Page**
  - Header: Token symbol + metadata (Pump icon, social links).
  - Key stats: total fees, outstanding PT/YT, next maturity, attnUSD contribution.
  - Charts: Fee inflow (SOL), PT discount vs. time, YT APY history.
  - Action tabs:
    - `Wrap` (if creator/community) – quick form for incremental wraps.
    - `Swap` – embedded AMM interface (PT↔quote, attnUSD↔quote; YT optional if standalone).
    - `Liquidity` – add/remove LP position(s) with range selector (Pendle-style slider).
    - `attnUSD` – view this market’s contribution to vault, optional opt-out toggle.
    - `Rewards` – view this market’s SOL reward split, stake/claim shortcuts linked to global Rewards page.
  - Activity log: recent splits, swaps, liquidity changes, yield claims.


## Component Specifications
### A. CTO Checklist Module
- Static instructions (copyable text) for completing Pump CTO form.
- Input fields to track submission status (date submitted, link to form, Pump response). Stored client-side or via backend (if we store status).
- Visual timeline (Pending → In Review → Approved → Completed).
- CTA to copy the CreatorVault PDA address.

### B. Wrap & Split Form
- Inputs: Amount (auto-detect decimals), source (Pump token / raw SOL), maturity select (radio buttons).
- Display real-time conversion (1 Pump = 1 SY = 1 PT + 1 YT).
- Show expected attnUSD share if default sweep enabled.
- confirmation modal summarizing fees, minted PT/YT IDs, estimated gas.
- Success state with transaction link.

### C. Rewards Staking Module (sAttnUSD)
- For sAttnUSD positions: show staked balance, accrued SOL, claimable amount, claim button (disabled if < minimum threshold).
- Claim modal lists markets included, confirmation summary, transaction link.
- Unstake flow burns sAttnUSD, returns attnUSD 1:1; show impact to SOL rewards.

### D. PT Redemption Module
- Visible once current time > maturity timestamp.
- Displays PT holdings eligible for redemption, estimated Pump token return.
- “Redeem All” and per-market redemption options.

### E. AMM Swap & LP Components
- Swap panel similar to Pendle: from/to dropdown, price impact, route details, `Preview`, `Confirm`.
- Liquidity panel with slider for range (if concentrated) or toggle for simple pool.
- Display user’s LP positions (range bounds, liquidity, fees earned).
- Integration with wallet to sign CPI transactions.

### F. attnUSD Dashboard
- APY card with breakdown: fee inflows, conversion slippage, vault expenses; clarify yield accrues via NAV increase (no manual claim).
- Graph of attnUSD share index over time.
- Buttons: `Deposit YT`, `Redeem attnUSD`, with warnings about conversion delay if necessary.

### G. Notifications & Alerts
- In-app toasts for transaction status (submitted, confirmed, failed).
- Global banner for system alerts (e.g., “Pump fees delayed – check status.”) and Live-mode warning.
- Portfolio view should highlight upcoming maturities or unclaimed yield.

### H. Wallet & Network Handling
- Support Phantom, Backpack, Solflare via Wallet Adapter
- Detect network mismatch (require devnet for testing vs mainnet).
- Display SOL/USDC balances.

- Backend REST endpoints (all under `/v1/*`, list endpoints support `?limit=&cursor=` and ETag):
  - `GET /v1/overview` – total fees, attnUSD supply, APY.
  - `GET /v1/markets` – list of Pump tokens + stats.
  - `GET /v1/markets/{id}` – detailed metrics, charts data.
  - `GET /v1/portfolio/{wallet}` – user positions, accrued yield, maturities.
  - `GET /v1/attnusd` – supply, APY, conversion history.
  - `GET /v1/rewards` – rewards financing/claim events (paginated).
  - `GET /v1/rewards/{pool}` – pool detail (paginated events, totals).
  - `GET /v1/governance` – CreatorVault, StableVault, RewardsVault admin/pause snapshots (feed pause banner + tooltips).
  - `GET /v1/cto-status/{pumpToken}` – optional pump CTO tracking (if stored off-chain).
  - `GET /readyz`, `GET /version` – health gates for Live mode.
- On-chain state read via Anchor client for freshness (SY/PT/YT supply, indices).
- Solscan/Jupiter integrations for transaction links & swap quotes.

## Configuration & Modes
- Environment vars: `NEXT_PUBLIC_DATA_MODE` (`demo` default), `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_CLUSTER` (devnet), `NEXT_PUBLIC_PROGRAM_IDS` (JSON of program IDs per cluster).
- Mode toggle persists in `localStorage`. On startup, ping `/readyz`; fallback to Demo if unhealthy.
- Gate write actions (wrap/split, stake/unstake/claim) behind wallet connect + cluster check (must equal devnet and Live mode).
- Never expose privileged RPC keys or DB credentials; frontend only accesses public REST.

## UX Pattern Borrowed from Pendle
- Markets table with APY, maturity, volume columns.
- Market detail tabs (Swap / Liquidity / Stats).
- Portfolio page with aggregated TVL and per-market breakdown.
- Tooltip explanations for PT discount and YT APY.

## Performance & Responsiveness
- Target <2s load times for main dashboards (with skeleton loaders).
- Responsive layouts for desktop/tablet; mobile read-only support (actions optional).
- Use suspense/fallback states while fetching indexer data.

## Security & UX Safeguards
- Confirm dialogs for wrap/split, claim, redemption actions with warnings about irreversible operations.
- Show gas estimate and necessary SOL balance.
- Guard rails if CTO not approved yet (disable split actions).
- Display health status (vault paused, AMM paused) if governance toggles stop conditions; disable buttons and highlight paused banner.
- Validate user cluster before enabling Live actions; surface low SOL warning.
- Require the same wallet to match both creator authority and admin before exposing market close or lock toggles; surface guidance when roles differ and highlight the co-sign path for `lock_collateral` / `unlock_collateral`.
- Only display auto-sweeper controls when the connected wallet matches the creator authority; provide clear revoke messaging before calling `clear_sweeper_delegate`.
- Cache `/v1/*` responses behind weak ETags with a configurable TTL and retry/backoff for transient 5xx/429 responses.

## Demo vs Live Modes
- The frontend boots in **Demo** mode with local mock data so new contributors can explore safely and revalidates `/readyz` on mount if the stored mode is Live.
- A header toggle promotes **Live (devnet)**. Switching to Live performs `/readyz` and `/version` checks against `NEXT_PUBLIC_API_BASE` and rechecks health if the session resumes later.
- If either health check fails, the UI automatically reverts to Demo, keeps the toggle off, and surfaces a toast.
- Live mode surfaces a banner reminding users that health failures fall back to Demo automatically.

### Environment Variables
Configure the legacy demo-only app via `apps/dapp/.env.example` and the new demo/live build via `apps/dapp-prod/.env.example`.

```
NEXT_PUBLIC_DATA_MODE=demo               # demo | live, defaults to demo when invalid
NEXT_PUBLIC_API_BASE=https://...         # REST origin queried for /readyz, /version, /v1/*
NEXT_PUBLIC_CLUSTER=devnet               # Cluster label surfaced in the header
NEXT_PUBLIC_PROGRAM_IDS={"devnet":{...}} # JSON map of program IDs keyed by cluster
```

All keys are validated on boot. Missing or malformed values force Demo mode and log a single console warning.

### Troubleshooting
- **Live toggle fails:** Inspect console for the logged error from `/readyz` or `/version`. The header will stay in Demo and display the latest error toast.
- **Program ID validation fails:** Ensure the JSON map contains base58 addresses for the active cluster.
- **Cached data mismatch:** Clear `localStorage['attn-market-app-state']` (Demo data) and `localStorage['attn.mode']` (mode toggle) before retrying.

## Testing Checklist
- Connect wallet (devnet & mainnet).
- CTO flow: mark as approved, unlock wrap UI.
- Wrap → split → stake → fund (mock) → claim SOL → unstake (devnet flow via RewardsVault).
- attnUSD deposit/redeem flows (verify NAV increase when oracle/indexer updates).
- Swap PT/quote, add/remove liquidity, view position updates.
- Rewards page pagination + ETag caching (mock 304) including TTL expiry fallbacks.
- Live mode health fallback when `/readyz` fails.
- Pause banner + disabled states when `/v1/governance` reports paused vaults.
- Auto-sweeper lifecycle: enable delegate, confirm last sweep timestamp updates after keeper run (mock), and revoke delegate.

## Deliverables
- Frontend repo with modular React components (Tailwind/Chakra optional).
- Storybook or component library for wrap/split, swap, liquidity modules.
- E2E tests (Cypress/Playwright) covering critical flows including stake→claim→unstake.
- Documentation explaining API dependencies, environment variables, and mode configuration.

## Future Enhancements (Post-MVP)
- Automated CTO submission helper (pre-fills Pump form).
- Creator marketplace modules (forward auctions, credit lines) integrated via iframe or dynamic routes.
- Multi-launchpad selector once migrations expand beyond Pump.fun.
- Governance UI (proposal list, attnUSD policy toggles).
