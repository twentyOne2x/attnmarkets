<!-- file: attn-revenue-bonds-pt-yt-attnusd.md -->

# attn Revenue Bonds, PT/YT Design, and attnUSD

## 1. Purpose and Scope

This document describes attn’s revenue-bond architecture:

- How on-chain revenues become standardized yield (SY) and are split into Principal Tokens (PT) and Yield Tokens (YT).
- How attnUSD (the StableVault share token) is defined, risk-managed, and used.
- How the protocol separates the **underlying** (SY) from the **numeraire** (USDC/basket vs attnUSD).
- How the system is presented to:
  - Retail sponsors (creators, DAOs, apps).
  - Liquidity providers (LPs) and yield buyers.
- Roadmap and rollout phases from internal-only PT/YT to full markets.

The goal is to have a single source of truth for the “revenue bonds + stable vault” mental model, without repeating details across docs.

---

## 2. Actors, Assets, and Modules

### 2.1 Actors

- **Sponsors**  
  Creators, DAOs, businesses, or token communities (e.g. Pump.fun CTO winners) who:
  - Receive on-chain revenue streams (fees, creator rewards, DAO income).
  - Want to:
    - Autostake and sweep those revenues.
    - Sell future yield (factoring).
    - Access loans or credit lines backed by revenues.

- **Liquidity Providers (LPs)**  
  Users and funds who:
  - Deposit stables to earn revenue-backed yield via attnUSD.
  - Later, may buy specific YT tranches or LP PT/USDC pools.

- **Protocol / Desk**  
  attn-run components that:
  - Underwrite, price, and operate advances/credit lines (“attnAdvance”).
  - Seed liquidity for PT/YT markets.
  - Manage risk buffers and reserves.

### 2.2 Assets

- **Revenue stream**  
  Hard on-chain fee source:
  - Pump.fun creator PDAs, DAO Safes, other fee routers.

- **CreatorVault + SY**  
  - CreatorVault PDAs custody the revenue stream under Squads 2-of-2 admin.
  - `SY` = Standardized Yield: internal token representing claims on that revenue stream for a given configuration.

- **PT (Principal Token)**  
  - Fixed-maturity claim on the “principal leg” of SY.
  - Intended to behave like a revenue bond denominated in a USD numeraire.

- **YT (Yield Token)**  
  - Fixed-maturity claim on the time-bounded “future yield” portion of SY.
  - Used for factoring and yield trading.

- **StableVault + attnUSD**  
  - Vault holds a **basket of stables** (USDC, USDT, USDe, USDC+).
  - `attnUSD` is the share token of this vault; 1 attnUSD = pro-rata claim on vault assets.
  - Creator fees (SOL/stables) are swept and converted into the same basket, increasing NAV.

- **RewardsVault + sAttnUSD (optional)**  
  - Staking layer on top of attnUSD.
  - `sAttnUSD` shares represent staked attnUSD that earns SOL rewards.

---

## 3. Underlying vs Numeraire

### 3.1 Underlying: SY as the “stake account” of revenues

For each revenue stream:

- The only object that perfectly tracks that stream is **SY**:
  - 1 SY = 1 unit of claim on a specific CreatorVault’s fee stream over a defined horizon.
- All PT/YT math is defined internally in terms of SY:

> SY → PT + YT, with PT + YT = SY (per stream, per maturity).

SY is analogous to:

- Pye’s stake account representation for SOL.:contentReference[oaicite:0]{index=0}  
- Exponent’s “Income Token” that wraps a yield-bearing asset (e.g. marginfiSOL).:contentReference[oaicite:1]{index=1}  

In attn, SY:

- Is **not** intended to be a user-facing asset.
- Exists as an internal receipt used by CreatorVault and Splitter.

### 3.2 Numeraire: USD basket vs attnUSD

All PT/YT pricing and credit decisions need a **numeraire**:

- A currency in which:
  - loan sizes,
  - yields,
  - and losses are measured.

Design:

- **Primary numeraire** for PT and credit is a **USD stable basket**:
  - USDC / USDT / USDe / USDC+.
- **attnUSD** is a *share* over this basket (plus revenue yield), not the only way to express prices.

Implications:

- Early PT markets and valuations are expressed vs **USDC or the basket**, *not* attnUSD.
- attnUSD can be used internally and as a secondary quote asset once it is large and boring.

### 3.3 Why not pair PT against utility tokens

A project’s own utility/governance token:

- Is usually driven by speculation, tokenomics, and governance decisions.
- Is not closely or mechanically tied to the same cashflows as SY/PT/YT.

Pairing PT with that token:

- Creates “bond vs equity” pairs with high, uncorrelated volatility.
- Increases impermanent loss and makes pricing opaque.

Therefore:

- PT should pair against **stables** (USDC/basket) or, later, attnUSD.
- Utility tokens are separate risk layers unless explicitly designed as revenue-share tokens.

---

## 4. PT/YT Design

### 4.1 When PT/YT are minted

Two main issuance modes; attn can use both.

1. **On-demand issuance (default for MVP)**  
   - CreatorVault accrues fees normally.
   - No tranching happens until a **financing** or **structuring** action occurs.
   - When a sponsor requests an advance/credit, the protocol:
     - Carves out a defined slice of future revenue.
     - Wraps that slice into SY.
     - Calls Splitter to mint PT/YT **for that slice only**.
     - PT and YT are initially held by attn-controlled accounts (or creator/attn split).

   Benefits:
   - No unnecessary PT/YT supply for idle streams.
   - Cleaner accounting; each PT/YT issuance corresponds to a financing decision.

2. **Continuous auto-tranching (optional later)**  
   - All wrapped revenue is SY → PT + YT by default.
   - PT awarded to creator/treasury; YT routed to creator or to structured products.

For MVP, the recommended approach is:

- **On-demand issuance** for financed slices.
- PT/YT exist precisely where they are economically needed.

### 4.2 PT semantics

For a given stream and maturity:

- PT represents the principal leg of SY, denominated in the USD basket.
- Economic target:

> 1 PT ≈ 1 USD (or defined notional) of principal at maturity,  
> conditional on the revenue stream performing as underwritten.

PT is:

- The main “revenue bond” object.
- The anchor for advances, M&A, and secondary trading.

PT behaviour:

- **Before maturity**:
  - Trades at a discount or premium vs its face value, reflecting:
    - expected revenue,
    - risk,
    - time value.
- **At/after maturity**:
  - Redeemable into:
    - stables from StableVault (directly), or
    - Sy/fees routed through CreatorVault → StableVault, depending on integration level.

### 4.3 YT semantics

YT represents the **future yield** component of SY over a bounded period:

- For a given maturity `T`, YT(T) entitles its holder to fee flows in that bucket after PT is made whole.
- Economically similar to:
  - forward-sold revenue,
  - a slice of excess cashflows.

YT uses:

- **Factoring / advances**:
  - Creator sells YT(T) for upfront USDC → economic equivalent of selling future revenue claims.
- **Yield trading**:
  - YT(T) price reflects forward expectations of revenue vs principal.
- **Structured products**:
  - YT pooled across many streams → diversified fee yield vaults.

### 4.4 Sale vs loan: creator-side behaviour

Two distinct primitives:

1. **YT sale (true sale of yield)**  
   - Creator mints PT/YT for a slice.
   - Sells **100% of YT** for that maturity to a buyer (desk, fund, YT vault).
   - Receives upfront cash.
   - For that slice, creator no longer participates in the yield.

2. **Loan backed by YT/PT (credit line)**  
   - Creator posts YT (and optionally PT) as collateral to a lending market or attnAdvance.
   - Borrows USDC/attnUSD against it at **LTV < 100%**.
   - Keeps residual upside but faces margin/liquidation risk.

Design principle:

- “Full monetization of yield” for a period is implemented via **YT sale**, not 100% LTV loans.
- Loans always include a buffer; true sale can transfer all yield entitlement.

---

## 5. attnUSD and StableVault

### 5.1 Definition and composition

StableVault:

- Accepts deposits of:
  - USDC, USDT, USDe, USDC+ (configurable).
- Issues `attnUSD` 1:1 vs current NAV at deposit time (less fees, if any).
- Sweeps creator fees (via SOL/stable conversions) into the basket.
- Tracks total assets and share count.

Therefore:

> 1 attnUSD = pro-rata share of StableVault’s **net assets**,  
> where net assets = stablecoin basket + unconverted fee/cash balances – realized losses.

Under ideal conditions:

- NAV per attnUSD slowly **increases** as revenue yield accrues.

### 5.2 Yield path

1. Creator revenues hit CreatorVault.
2. Keeper calls `sweep_creator_fees` with `operation_id`.
3. Swept fees are:
   - Partially routed to RewardsVault as SOL rewards (optional).
   - Remainder converted into the stable basket.
4. StableVault’s asset base grows; attnUSD NAV increases.
5. LPs holding attnUSD experience that appreciation as yield.

No rebase:

- attnUSD remains a fixed supply token.
- Yield appears as price appreciation vs USD, not token count changes.

### 5.3 When attnUSD can break the buck

Several risk channels:

1. **Credit losses on revenue-backed exposures**  
   - Loans/advances against PT/YT underperform or default.
   - After waterfalls and collateral, there is residual loss.
   - If there is no sufficient reserve or junior tranche, the vault’s net assets drop.
   - attnUSD NAV falls below 1 USD.

2. **Stablecoin/basket risk**  
   - Any component (USDC, USDT, USDe, USDC+) can experience:
     - loss, freeze, haircut, or systemic issue.
   - These impair vault assets directly.

3. **Liquidity / gating risk**  
   - Redemption can be:
     - delayed (conversion queues),
     - rate-limited,
     - or temporarily paused.
   - Secondary markets can trade attnUSD at a discount even if on-paper NAV > 1.

Design options to handle losses:

- **Pure mutualisation (simplest)**  
  - All losses are shared linearly across attnUSD holders.
- **First-loss buffer / junior token**  
  - attn or partners hold a junior tranche that absorbs initial losses.
  - attnUSD is senior up to a defined loss threshold.
- **Per-vault ring-fencing**  
  - Multiple vaults by risk tier; attnUSD may be an index over them.

### 5.4 attnUSD vs PT numeraire

Early design choice:

- **Quote PT/YT vs USDC/basket**, not attnUSD.
- Use attnUSD as:
  - internal yield-carrying token,
  - and later, as an additional quote asset once large and stable.

This avoids a situation where:

- The price of a single revenue stream (PT) is quoted in terms of a system-wide credit token (attnUSD), compounding risk and confusing interpretation.

Over time:

- Add PT/attnUSD pools alongside PT/USDC.
- Routers can route via either, picking the best execution.

---

## 6. Market Structure and AMM

### 6.1 AMM goals

The AMM for PT/YT should:

- Price **time-decaying, maturity-bound assets**.
- Reduce IL as maturity approaches (risk compresses).
- Maximise capital efficiency by concentrating liquidity dynamically.

Exponent’s time-dynamic AMM for yield assets is a benchmark: price ranges tighten as Income Tokens approach maturity and yield is exhausted; flash swaps allow trading both income and yield tokens via a single pool.:contentReference[oaicite:2]{index=2}  

attn can follow similar principles while respecting its own primitives.

### 6.2 Internal vs external view

Internal economic basis:

- Underlying = SY.
- PT + YT = SY.

External view for users and LPs:

- YT(T) and PT(T) trade vs a **stable numeraire** (USDC/basket).
- SY is not shown, only used in program logic.

### 6.3 Phase 1 markets

Initial AMM/market exposure:

- **PT / USDC (or basket)** concentrated-liquidity pools.
- YT handled via:
  - auctions (for selected streams), and/or
  - YT/USDC pools with conservative ranges.
- No SY pools.

Rationale:

- Clear, “bond-style” pricing: PT is a bond vs dollars.
- YT is a yield leg vs dollars.
- Simple for LPs to reason about risk.

### 6.4 Phase 2+ markets

As attnUSD and liquidity deepen:

- Add:
  - PT/attnUSD pools.
  - YT/attnUSD pools or vaults.
- Possibly implement a **Pendle/Exponent-style time-dynamic AMM** internally:
  - Where the core curve is defined in SY terms.
  - Routers expose PT/USDC and YT/USDC prices via SY under the hood.

Optional enhancements:

- Flash swap logic similar to Exponent:
  - Only PT/attnUSD (or PT/USDC) liquidity is held.
  - YT trades borrow PT temporarily via flash logic and settle back within one tx.

---

## 7. Granularity: per-project vs per-product

### 7.1 Pump-style tokens

For memecoins / Pump.fun-type assets:

- Each token has its own creator fee stream.
- Those streams are isolated by design.

Recommended:

- One CreatorVault per token that passes underwriting.
- PT/YT issued per token, per maturity.

### 7.2 “Real” apps and DAOs

For serious apps/DAOs with multiple products:

Options:

1. **One vault per firm / DAO (default)**  
   - All product revenues into a common Safe.
   - One PT/YT tree over aggregated revenue.
   - Simpler, deeper liquidity.

2. **One vault per major product line**  
   - Only for large scale or materially different risk profiles.
   - Example: DAO with a DEX and a separate game may want separate revenue bonds.

Avoid:

- Per-feature or micro-product vaults; they fragment liquidity and complicate pricing.

Guideline:

- Use **per token** for single-asset memecoins.
- Use **per DAO/app** for most larger entities; split only when a product line could support its own bond market.

---

## 8. Creator / Retail View

Creators and DAOs should not need to think in terms of SY/PT/YT.

### 8.1 Core flows in the UI

1. **Connect revenue stream**
   - Hook up a Squads Safe.
   - For Pump.fun: CTO → creator fee PDA redirected to CreatorVault admin Safe.

2. **“Earn on my fees”**
   - Enable autosweep + autostake:
     - Fees automatically collected and optionally routed through StableVault to earn base yield.
   - No visible PT/YT concepts.

3. **“Get cash upfront”**
   - “Sell X% of my next N days/weeks/months of fees.”
   - Under the hood:
     - attn carves out that revenue slice.
     - Mints PT/YT.
     - Sells YT or uses it as collateral.
     - Delivers USDC to the creator.

4. **“Keep exposure but get a credit line”**
   - Offer a revolving line:
     - Limit sized from historical fee performance and risk rules.
     - Drawdowns and repayments visible.
   - Under the hood:
     - YT/PT (and possibly other collateral) are locked.
     - LTV < 100%; liquidation thresholds defined.

Creators see plain-language products:

- “Revenue advance.”
- “Revenue-backed credit line.”
- “Autosweeping yield.”

SY/PT/YT tokens exist for correctness and later composability, not for base UX.

### 8.2 Creator risk surface

- Key concepts:
  - Borrowing against future revenues limits future take-home until repaid.
  - Selling yield (YT) removes a slice of future revenue altogether.
  - Default / persistent underperformance can:
    - exhaust advance capacity,
    - trigger stricter controls or covenants,
    - impact reputation with LPs.

All of this is explained in revenue-language, not token-language.

---

## 9. LP View

Two levels of sophistication.

### 9.1 Simple LP: attnUSD only

- User deposits stables (USDC, USDT, USDe, USDC+).
- Receives attnUSD 1:1 at current NAV.
- Holds attnUSD and earns:

  - blended yield from system-wide creator revenues,
  - minus protocol fees and any realized losses.

Risk disclosure:

- attnUSD is **not** fiat-backed; it is **revenue-backed** and basket-backed.
- attnUSD NAV can move below 1 in case of:
  - credit losses,
  - stablecoin issues,
  - severe systemic events.

UI emphasises:

- expected yield range,
- composition (per asset and per revenue tier),
- historical realised loss (if any).

### 9.2 Advanced LP / Yield Buyer

Additional options:

- **Buy YT tranches** for specific names / indices:
  - Higher yield, higher idiosyncratic risk.
  - Best suited for funds and desks.
- **LP PT/USDC** pools:
  - Earn fees from trades in/out of PT.
  - Exposed to rate changes and credit perception.
- **Deposit into structured products**:
  - e.g. diversified YT baskets,
  - “investment-grade” PT pools,
  - or laddered maturity vaults.

For these users, documentation is explicit about:

- relationship between SY, PT, YT,
- waterfalls and seniority,
- behaviour at maturity and default,
- attnUSD’s role as system share token, not a guarantee.

---

## 10. Rollout and Roadmap

### 10.1 Phase 0 – Internal PT/YT, devnet

- CreatorVault, Splitter, StableVault, RewardsVault live on devnet.
- SY/PT/YT minted only for end-to-end tests and scripted demos.
- No external PT/YT trading; no public attnUSD.
- “localnet-e2e” scripts validate wrap → split → stake → sweep → claim flows.

### 10.2 Phase 1 – Creator advances + attnUSD, limited markets

- Target a small set of vetted revenue streams (e.g. 1–3 Pump tokens / DAOs).
- Enable:
  - Autosweep + autostake (base yield).
  - Revenue advances using YT sale and/or YT-backed loans.
- Expose attnUSD:
  - LP-facing deposit product,
  - with conservative composition and tight limits on leverage/credit.
- Start minimal PT/USDC markets for those pilot streams:
  - likely with protocol-owned liquidity.

### 10.3 Phase 2 – PT/YT markets, more creators

- Expand to more revenue streams via partners (launchpads, DAOs).
- Enable:
  - YT auctions and/or YT/USDC pools for select maturities.
  - More liquid PT/USDC AMM pools, possibly with time-dynamic curves.
- attnUSD:
  - grows in TVL,
  - becomes the default settlement token for internal book-keeping,
  - but still not the primary PT quote asset.

### 10.4 Phase 3 – attnUSD as secondary quote asset, cross-ecosystem

- Once attnUSD is large and stable:

  - Add PT/attnUSD and YT/attnUSD pools.
  - Introduce cross-stream products:
    - revenue indexes,
    - diversified YT vaults,
    - “machine revenue bonds” via external sources like DePIN networks.

- Explore cross-chain revenue sources and integrations; keep Solana as execution home.

---

## 11. Risk and Governance Summary

- **Revenue custody & enforcement**
  - CreatorVault fee sources must be:
    - hard PDAs wherever possible (Pump.fun CTO, DAO Safes, etc.).
    - under Squads 2-of-2 with `{creator, attn}`.
  - Locks and waterfalls are enforced onchain, not just by policy.

- **Credit risk**
  - Advances and loans priced off:
    - historical fees (seasoning),
    - volatility,
    - structural risk of each stream.
  - No 100% LTV loans against YT alone.

- **attnUSD risk**
  - attnUSD is a **vault share**, not a traditional fiat stablecoin.
  - Losses from credit or basket assets are mutualised unless a junior buffer structure is added.
  - attnUSD should not be the only PT quote asset in early stages.

- **Governance**
  - Admins and emergency admins via Squads.
  - Pause flags and `operation_id` idempotency for all keeper flows.
  - Transparent indexer/API endpoints for:
    - vault states,
    - pause statuses,
    - outstanding PT/YT,
    - attnUSD composition.

The combination of hard revenue custody, SY/PT/YT tranching, a conservative StableVault, and stable-quoted markets is intended to make attn’s revenue bonds understandable and robust for both creators and LPs.

