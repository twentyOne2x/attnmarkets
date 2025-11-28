`# Deploying $50m into attnUSD and Portfolio Properties for LPs

This note assumes:

- attn can raise up to **$50m** of LP capital over time.
- Borrower-side demand is the bottleneck, not capital.
- attnUSD is a **NAV-style, revenue-backed credit fund**, not a hard-pegged stable.

It covers:

1. How to deploy $50m prudently (without chasing bad volume).
2. Pricing (how “competitive” to be without destroying risk-adjusted returns).
3. Loops / leverage (attnUSD used as collateral in DeFi).
4. A portfolio-construction sheet for LPs (how attnUSD behaves as an asset).

---

## 1. Deployment strategy for up to $50m

### 1.1 Principle: lending is constrained by good deals, not by capital

With $50m of committed LP capital, the binding constraint is:

> “How many short-dated, reasonably underwritten facilities can be originated at fair spreads, given onchain revenues, MetaDAO treasuries, Pump.fun flows, etc.?”

The protocol should **not**:

- Cut pricing to the bone just to deploy.
- Underwrite random, thin-revenue projects merely to “use” the capital.

Instead:

- Maintain **deployment targets per vertical**.
- Accept that some capital sits in low-yield stables/T-bills when origination is slow.

### 1.2 Phased deployment caps

Illustrative shape:

- **Phase 1 (0–6 months)**  
  - Max deployed into credit: **$10–15m**.  
  - Remainder parked in:
    - “Safe” stables (USDC/USDT) and/or
    - short-term T-Bill RWAs (2–4% gross).  
  - Verticals:
    - MetaDAO entities (treasury + any revenues),
    - Pump.fun creator advances,
    - One B2B vertical (e.g. infra / RPC) at pilot size.

- **Phase 2 (6–18 months)**  
  - Max deployed into credit: **$25–30m**.  
  - Only if:
    - Default and recovery data from Phase 1 is acceptable.
    - Loss rates remain within stress assumptions.  
  - Add:
    - Second B2B vertical (wallets or SaaS-style products),
    - First “watch BNPL” pilot with strict caps.

- **Phase 3 (18–36 months)**  
  - Only if:
    - Loss ratios, LGD, and recovery behaviour look robust over a full mini-cycle.
    - Operational capacity to monitor many facilities is proven.  
  - Gradually move credit deployment towards **$40m+**, keeping ~20% in a “liquidity sleeve”.

The **$50m ceiling** remains a **capacity number**, not an immediate target for full deployment.

---

## 2. Pricing: competitive vs safe

There is a preference to avoid very high borrower APRs (~18%+) and instead cluster around **6–12%** bands, with explicit risk tiers.

### 2.1 Tiered pricing bands

Per facility tier (by revenue/treasury quality):

- **Tier A (best)**  
  - Examples: strong MetaDAO entities with runway, governance, clear use of funds; repeat Pump.fun creators with actual businesses.  
  - Tenor: 30–90 days.  
  - Borrower APR: **6–9%**.  
  - Target net to attn (after LP share): **2.0–3.0%** on deployed principal.

- **Tier B (mid)**  
  - Examples: smaller or more volatile revenue streams with some track record.  
  - Tenor: 14–60 days.  
  - Borrower APR: **9–12%**.  
  - Target net to attn: **3.0–4.0%**.

- **Tier C (risky / experimental)**  
  - Examples: highly spiky Pump.fun creators, new vertical pilots (e.g. early watch BNPL).  
  - Tenor: 7–30 days only.  
  - Factor-like pricing: **equivalent 12–16% APR**, expressed as **flat 3–8% per 7–30d advance**.  
  - Target net to attn: **4–5%** (smaller notional, better margin per unit of risk).

This allows:

- Cheap, anchor lines (Tier A) for **distribution and brand**.
- Higher-margin short tenors (Tier C) for **protocol economics**.

### 2.2 Net-to-attn vs gross yield

Notation:

- Gross borrower APR: \( r_{\text{borrower}} \).  
- LP share of interest/fees: \( s_{\text{LP}} \) (e.g. 70–80%).  
- attn protocol share: \( 1 - s_{\text{LP}} \).

Then:

\[
\text{Net APR to attn} \approx r_{\text{borrower}} \cdot (1 - s_{\text{LP}}).
\]

Example:

- Tier B facility at 11% APR.  
- LP share \( s_{\text{LP}} = 0.75 \).

Then:

- LP gross ≈ 8.25%.  
- attn ≈ 2.75% protocol revenue on deployed principal.

Design docs and investor materials should consistently distinguish:

- **Gross facility yield** (what the borrower pays).  
- **Net to LPs**.  
- **Net to attn**.

---

## 3. Loops / leverage: attnUSD in DeFi

A natural question:

> Can looping be enabled (e.g. deposit attnUSD into Kamino, borrow USDC against it, redeposit into attn, etc.)? What does that imply?

### 3.1 Mechanics of a loop

Typical loop:

1. LP deposits **USDC** into attn → receives **attnUSD**.  
2. LP deposits **attnUSD** into a money market (e.g. Kamino) where attnUSD is collateral.  
3. LP borrows **USDC** against attnUSD at LTV \( L \) (e.g. 60–70%).  
4. LP redeposits borrowed USDC into attn → mints more attnUSD.  
5. Steps 2–4 repeat until **marginal net yield ≈ 0** or leverage caps are hit.

Effects:

- **On attn**:
  - attnUSD supply grows.
  - Capital available for credit facilities increases.
- **On borrowers**:
  - Facility terms (APR, tenor, covenants) do not change directly.
- **On the system**:
  - LPs become leveraged on the same underlying credit book.
  - If attnUSD NAV drops or confidence breaks:
    - attnUSD price decline → LTV breaches → liquidations → more selling of attnUSD or underlying → potential reflexive loop.

### 3.2 Conditions for acceptable looping

Looping only makes sense if:

1. **attnUSD is clearly communicated as a NAV token, not a hard $1 stable.**  
   - Messaging should be along the lines of:  
     “attnUSD is a yield-bearing share in a revenue-backed credit portfolio. It can trade below 1 in stress. Using it as collateral carries liquidation risk.”

2. Collateral markets use **conservative LTVs and caps**:  
   - Initial attnUSD LTV: for example **50–60%**.  
   - Supply caps per market.

3. The underlying portfolio is:

   - Short-dated (7–90 days).  
   - Diversified across borrowers and verticals.  
   - Sized via stressed coverage tests.

### 3.3 Supporting integrators

attn can help Kamino / Drift / Marginfi-style markets by:

- Publishing regular risk reports:
  - Exposure per borrower and vertical.
  - Tenor buckets.
  - PD/LGD estimates.  
- Providing historical NAV and drawdown statistics once available.  
- Maintaining a modest **protocol-owned insurance buffer** for tail events (if governance approves).

This gives external markets enough information to set LTVs and caps in a risk-aware way.

---

## 4. attnUSD: portfolio-construction sheet for LPs

Below is a technical sheet template for LPs.

### 4.1 Asset type and mandate

**Instrument**  

- **attnUSD** is an SPL-style token on Solana, representing a **pro-rata claim** on:
  - A portfolio of short-dated **revenue-backed credit exposures** (RCAs / RRCLs).  
  - A liquidity sleeve in high-quality **USD stablecoins and/or T-Bill RWAs**.

**Objective**

- Target (non-binding):
  - **Net LP yield**: ~**5–9%** p.a. over a full cycle.  
  - **Duration**: weighted average life roughly **30–90 days**.
- Accept:
  - **Credit risk** on onchain entities and their revenues.  
  - **Crypto market cyclicality** (revenues are pro-cyclical).

attnUSD is **not**:

- A hard-pegged stablecoin.  
- A capital-preserved savings account.

It is a **USD-denominated, short-duration onchain credit fund share**.

---

### 4.2 Underlying exposures

Portfolio at time \( t \):

\[
\mathcal{P}_t = \{ (E_j, A_j, r_j, T_j) \}_{j=1}^m \cup \{\text{stables/T-bills}\},
\]

where each credit exposure \( j \) has:

- \( E_j \): entity (MetaDAO project, Pump.fun creator, B2B protocol, etc.).  
- \( A_j \): outstanding principal.  
- \( r_j \): borrower APR / fee.  
- \( T_j \): remaining effective tenor.

Constraints (policy-level):

- **Tenor**:
  - Majority of exposures **≤ 90 days**.  
- **Name concentration**:
  - Max 5–10% of NAV per entity.  
- **Vertical caps**:
  - Limits per vertical (MetaDAO, Pump, B2B, watches).  
- **Liquidity sleeve**:
  - 10–30% of NAV in stables/T-Bills to support redemptions.

---

### 4.3 Risk factors

Key drivers:

1. **Idiosyncratic default risk**  
   - MetaDAO projects failing despite treasury backing.  
   - Pump.fun creators disappearing after a big launch.  
   - B2B protocols losing key customers.

2. **Sector / factor risk**  
   - Concentration in:
     - memecoin issuance/trading,  
     - NFT/creator platforms,  
     - DePIN revenues,  
     - Solana DeFi volumes.

3. **Macro crypto cycle risk**  
   - Revenue declines in bear markets → coverage tests stressed → thinner cushions and higher probability of default events.

4. **Operational and legal risk**  
   - Bugs / misconfigurations in revenue routing (PDAs, Squads multisigs).  
   - Ambiguity in legal wrappers for certain facilities (particularly if any offchain revenue or enforcement is involved).

---

### 4.4 Correlation vs other assets

Qualitative correlation:

- **Positively correlated** with:
  - Solana ecosystem activity (onchain volume, fees, trading).  
  - Broader crypto risk sentiment.

- **Less directly correlated** with:
  - Pure L1 token beta (SOL price) in the short term.  
  - Volatility of governance tokens with little real revenue backing.

Interpretation:

- attnUSD sits between:
  - RWAs / T-Bills (low risk, low yield), and  
  - DeFi governance tokens (high beta, idiosyncratic).  
- It behaves more like an **onchain short-duration high-yield credit fund** than like a stablecoin.

---

### 4.5 Liquidity and redemption

Baseline design:

- **Mint / redeem**:
  - Frequent (potentially daily or block-by-block), subject to pool liquidity.

- **Liquidity sleeve**:
  - Maintain 10–30% of NAV in stables or T-Bill RWAs.

- **Redemption controls**:
  - Throttle large redemptions (e.g. >10% NAV) over several days.  
  - Optionally charge a small redemption fee (e.g. 0.1–0.3%) to discourage hot money and help fund the buffer.

- **Stress conditions**:
  - If underlying loss or valuation uncertainty is sharp:
    - Temporarily increase gates, or  
    - briefly pause redemptions while re-marking the book.

Message to LPs:  

> Liquidity is generally good but not instantaneous; it depends on amortisation of short-dated facilities and the size of the liquid sleeve.

---

### 4.6 Expected returns and loss scenarios

Because attnUSD is new, these are **ex-ante** modelling assumptions:

1. **Base case**

   - Gross portfolio yield (before losses and fees): **8–12%**.  
   - Expected loss (EL) on the credit book: **0.5–2%** p.a.  
   - After fees to attn and loss assumptions, net LP yield: **5–9%** p.a.

2. **Mild stress**

   - EL roughly doubles for a year.  
   - NAV drawdown: **1–3%**.  
   - Recovery path:
     - originations tightened,  
     - spreads increased,  
     - deployment reduced until conditions improve.

3. **Severe stress**

   - Several large borrowers default within a short window (e.g. correlated protocol failures).  
   - NAV drawdown: **5–15%**.  
   - attnUSD behaves like equity in a concentrated credit portfolio; capital preservation is not guaranteed.

---

### 4.7 Role in an LP portfolio

For a crypto-native LP or fund, attnUSD can serve as:

- **Short-duration USD credit sleeve**:
  - Yield pickup vs onchain T-Bill wrappers (2–5%) and major stable lending markets (4–8%).  
  - Minimal long-duration interest-rate risk.

- **Exposure to “Solana real revenues”**:
  - Indirectly captures fee and revenue streams from protocols/creators/DAOs without requiring selection of individual borrowers.

Indicative allocation guidance (for LPs, not prescriptive):

- Conservative crypto fund:
  - **5–10%** of AUM in attnUSD, rest in stables/RWAs.  
- More aggressive credit/DeFi fund:
  - **10–25%** of AUM in attnUSD,
  - with internal risk limits on exposure to a single manager.

---

### 4.8 Constraints and capacity

For transparency, capacity should be framed explicitly:

- **Near-term capacity**:
  - Realistically **$5–15m** of sensible deployment in the next 12 months, given:
    - MetaDAO scale,  
    - Pump.fun advance volumes,  
    - early B2B pilots.

- **Medium-term**:
  - With more launchpads, B2B verticals, and BNPL pilots:
    - credit deployment may scale toward **$30–50m** while maintaining portfolio quality.

attnUSD **should not** be marketed as having unlimited capacity at fixed yields; spreads should compress as the “easy” deals are saturated.

---

## 5. Should borrower rates be more competitive?

Given:

- LP capital of **$50m** is potentially available.  
- High-quality credit demand is initially much smaller.

A rational policy:

- Make **Tier A / anchor pricing** relatively competitive (6–9% APR to borrowers).  
- Keep **Tier B/C** pricing higher to preserve system-level margins.

Internal rule of thumb:

- Maintain a **floor net yield to attnUSD LPs**, e.g.:

  > “No new facility is originated with expected net yield < 5–6% to LPs after losses.”

If high-quality borrower demand is weak at those levels:

- Do **not** slash price further just to deploy.  
- Instead:
  - Leave more in stables/T-Bills, and  
  - Invest effort in **distribution** (MetaDAO, more launchpads, B2B partnerships, Pump integration).

---

## 6. Distribution and “last resort lender” concern

Concern:

> Avici, Krak and similar projects might build their own credit infra; attn could become a last-resort liquidity source.

Mitigation strategy:

1. **Position as the specialised “revenue engine”, not just a pool of capital**

   - Offer:
     - governed revenue accounts,
     - coverage tests and limit sizing,
     - Exponent PT/YT integration,
     - dashboards and monitoring,  
   - i.e. infrastructure that neobanks and card issuers do not want to build in-house.

2. **White-label / embedded integrations**

   - “Powered by attn” behind:
     - revenue-backed overdrafts,
     - working capital lines,
     - creator advances,
     - merchant BNPL.  
   - Partners (Avici/Krak/Slash/Altitude, etc.) own UI + KYC + fiat rails.  
   - attn provides **underwriting + capital** for the “revenue slice”.

3. **Own Solana-native verticals early**

   - Pump.fun, MetaDAO, NFTs, DePIN:  
     - strongly Solana-native,  
     - not the first targets for traditional neobanks.  
   - If attn becomes the default infra there, later banks/wallets will more naturally integrate with attn rather than replicate everything.

In this positioning, attn is a **shared backend for revenue-native credit**, rather than a peripheral lender.

---

## 7. One-paragraph LP summary (no second person)

> attnUSD is a Solana-native, USD-denominated, short-duration credit fund backed by onchain revenue facilities (advances and revolving lines) plus a liquidity sleeve in stables and T-Bills. It targets 5–9% net LP yield over a cycle, with risk concentrated in protocol/creator/DAO revenue performance and short-dated credit exposures, not in long-duration interest-rate risk or pure token beta. Liquidity is generally good but depends on amortisation and buffers, and NAV can draw down in stress. The underwriting model emphasises coverage tests, diversification and short tenors before scaling size. For crypto LPs, attnUSD offers a clean, single-line way to gain exposure to “Solana real revenue credit” instead of constructing and managing many bilateral loans.
`