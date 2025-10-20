# attn.markets Frontend Specification (Pump.fun MVP)

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
- **App Shell** (shared navigation):
  - Logo + “attn.markets” brand.
  - Tabs: `Overview`, `Markets`, `Creator`, `Portfolio`, `attnUSD`, `Docs`.
  - Wallet connect button with network toggle (devnet/mainnet).

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
  - **Step 2: Vault Setup** – once CTO approved, show `collect_fees` status, allow sweeping existing fees.
  - **Step 3: Wrap & Split** – form to enter amount of Pump tokens or raw SOL to wrap, select maturity (1D/1W/1M), preview PT/YT output, confirm split.
  - **Step 4: Post-Split Actions** – link to auctions, attnUSD staking, and AMM liquidity pages.
  - Analytics panel: historical fees, maturity schedule, attnUSD yield contributions.

- **Portfolio (user-specific)**
  - Summary cards: PT balance, YT balance, attnUSD balance, accrued yield, next maturities.
  - Positions table grouped by market:
    - For PT: quantity, market price, next maturity, `Redeem` button (enabled post-maturity).
    - For YT: quantity, accrued yield (SOL & USD), `Claim` button.
    - For attnUSD: balance, current APY, `Redeem` / `Stake` if additional modules exist.
  - Activity feed: recent wrap/mint/redeem/swap transactions with links to Solscan.

- **attnUSD Hub**
  - Display attnUSD supply, APY, conversion history (SOL→USDC), and risk summary.
  - `Deposit` (for direct YT contributions) and `Redeem` actions.
  - Optionally show external integrations (lending partners once available).

- **Market Detail Page**
  - Header: Token symbol + metadata (Pump icon, social links).
  - Key stats: total fees, outstanding PT/YT, next maturity, attnUSD contribution.
  - Charts: Fee inflow (SOL), PT discount vs. time, YT APY history.
  - Action tabs:
    - `Wrap` (if creator/community) – quick form for incremental wraps.
    - `Swap` – embedded AMM interface (PT↔quote, attnUSD↔quote; YT optional if standalone).
    - `Liquidity` – add/remove LP position(s) with range selector (Pendle-style slider).
    - `attnUSD` – view this market’s contribution to vault, optional opt-out toggle.
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

### C. Yield Claim Module
- For YT/attnUSD positions: show accrued yield, claimable amount, claim button (disabled if < minimum threshold).
- Claim modal lists markets included, confirmation summary, transaction link.

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
- APY card with breakdown: fee inflows, conversion slippage, vault expenses.
- Graph of attnUSD share index over time.
- Buttons: `Deposit YT`, `Redeem attnUSD`, with warnings about conversion delay if necessary.

### G. Notifications & Alerts
- In-app toasts for transaction status (submitted, confirmed, failed).
- Global banner for system alerts (e.g., “Pump fees delayed – check status.”).
- Portfolio view should highlight upcoming maturities or unclaimed yield.

### H. Wallet & Network Handling
- Support Phantom, Backpack, Solflare via Wallet Adapter
- Detect network mismatch (require devnet for testing vs mainnet).
- Display SOL/USDC balances.

## Data & API Requirements
- Backend indexer endpoints for:
  - `GET /metrics/overview` – total fees, attnUSD supply, APY.
  - `GET /markets` – list of Pump tokens + stats.
  - `GET /markets/{id}` – detailed metrics, charts data.
  - `GET /portfolio/{wallet}` – user positions, accrued yield, maturities.
  - `GET /attnUSD` – supply, APY, conversion history.
  - `GET /cto-status/{pumpToken}` – optional pump CTO tracking (if stored off-chain).
- On-chain state read via Anchor client for freshness (SY/PT/YT supply, indices).
- Solscan/Jupiter integrations for transaction links & swap quotes.

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
- Display health status (vault paused, AMM paused) if governance toggles stop conditions.

## Testing Checklist
- Connect wallet (devnet & mainnet).
- CTO flow: mark as approved, unlock wrap UI.
- Wrap → split → claim yield → redeem PT (simulate matured market).
- attnUSD deposit/redeem flows.
- Swap PT/quote, add/remove liquidity, view position updates.
- Alerts when no fee flow detected (mock indexer response).

## Deliverables
- Frontend repo with modular React components (Tailwind/Chakra optional).
- Storybook or component library for wrap/split, swap, liquidity modules.
- E2E tests (Cypress/Playwright) covering critical flows.
- Documentation explaining API dependencies and environment variables (RPC endpoints, indexer URLs).

## Future Enhancements (Post-MVP)
- Automated CTO submission helper (pre-fills Pump form).
- Creator marketplace modules (forward auctions, credit lines) integrated via iframe or dynamic routes.
- Multi-launchpad selector once migrations expand beyond Pump.fun.
- Governance UI (proposal list, attnUSD policy toggles).

