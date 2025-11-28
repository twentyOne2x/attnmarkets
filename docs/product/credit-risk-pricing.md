# attn.markets Credit & Risk Design  
_Onchain revenue-backed cash advances, revolvers, and PT/YT infra_

## 0. Purpose and scope

This document specifies how attn.markets should:

- Underwrite entities (apps, DAOs, creators, merchants) purely from **onchain revenues and streams**.
- Size **cash-advance** and **revolving credit line** facilities.
- Price interest / spreads and choose tenors.
- Set **vault caps and concentration limits** for attnUSD and any satellite vaults.
- Expose a **PT/YT layer** (via Exponent Finance) as a primitive while still shipping opinionated, simple products.
- Decide what is **centralised risk management** vs. **external risk curation**.
- Decide how much **borrower-proposed terms** (Wildcat-style) to allow, under guardrails.
- Incorporate lessons from:
  - 3Jane’s unsecured credit & USD3 model [3Jane](https://www.3jane.xyz/)
  - Morpho + MetaMorpho vaults and SmartLTV [Morpho Docs](https://docs.morpho.org/), [MetaMorpho Risk Model](https://forum.morpho.org/t/introducing-metamorpho-risk-model/447), [SmartLTV](https://medium.com/b-protocol/smartltv-is-live-on-mainnet-automating-risk-management-on-morpho-vaults-bcd290d1ee08)
  - Wildcat’s borrower-defined markets [Wildcat Docs](https://docs.wildcat.finance/)
  - Xitadel’s LTT fixed-income model [Xitadel Docs](https://docs.xitadel.fi/)
  - Pendle + Boros yield tokenisation and rate trading [Pendle Docs](https://docs.pendle.finance/Introduction/), [Yield Tokenization](https://docs.pendle.finance/pendle-v2/Developers/Contracts/YieldTokenization), [Boros](https://pendle.medium.com/boros-by-pendle-yield-trading-with-margin-63d026dc7399)
  - Exponent’s SY/PT/YT standard on Solana [Exponent Docs](https://docs.exponent.finance/starthere), [Solana Yields Standard](https://docs.exponent.finance/protocol/protocol-mechanisms/solana-yields-standard), [Exponent Yield Stripping](https://docs.exponent.finance/protocol/protocol-mechanisms/exponent-yield-stripping)

The target is “whitepaper-style but implementable”: explicit formulas and parameters, plus UX choices.

---

## 1. Philosophy and invariants

### 1.1 What risk we take

- **Object of risk**: entity-level **onchain revenues and streams**:
  - Pump.fun creator rewards, MetaDAO fees, etc.
  - Protocol PDAs (DEX, perp, lending, infra fees).
  - DePIN / machine income.
  - Streaming income (Sablier-style Lockup/Flow when v2/v3 is live).
- **Borrower**: the **entity** that owns those cashflows:
  - Apps, DAOs, companies, platforms, merchants, retailers.
  - Never consumers or individual employees/shoppers.

This mirrors the v3 direction where attn is the **revenue-native credit engine**, not a consumer lender or payroll provider.

### 1.2 What we explicitly avoid (vs 3Jane / retail lenders)

- No credit scores, bank statements, CEX snapshots, or trad-fi bureau data (3Jane’s 3CA is deliberately not replicated)  
  [3Jane](https://www.3jane.xyz/).
- No unsecured, reputation-based consumer loans.
- No reliance on offchain collections as the primary enforcement mechanism.

We may use **onchain asset positions** (treasury tokens, stables, LP positions) as **limit bumpers**, but the core thesis is:

> “If we can’t route and seize the revenue onchain, we don’t want to underwrite it.”

### 1.3 Revenue accounts as the trust anchor

- Revenue accounts are Squads-based multisigs with dual control (entity + attn risk signer), as in attn mechanics.
- There are three integration paths:
  1. **Native templates** (MetaDAO, Pump.fun, other launchpads) route revenue PDAs directly into a Squads Safe configured as a revenue account.
  2. **Independent protocols** already using Squads: simply layer on our revenue module.
  3. **Everything else**:  
     - Either migrate to Squads, or  
     - Use an attn-owned PDA vault that is purpose-limited to revenue custody and routing.

If we cannot secure a durable, auditable **revenue account or stream handle**, we should not extend credit.

---

## 2. Product surface: what we ship vs. what we expose

### 2.1 Native products (opinionated)

These should be first-class, UX-simple, and marketed:

1. **Revenue Cash Advance (RCA)**  
   - One-off, finite advance.  
   - “Get A now, repay from α% of revenues for up to T days, capped at R_target.”

2. **Revenue Revolving Credit Line (RRCL)**  
   - Reusable line sized by trailing revenues.  
   - Draw and repay flexibly; utilisation drives estimated paydown speed and fee.

These two cover 90% of realistic demand: campaigns, working capital, BNPL funding, card spend, payroll smoothing.

### 2.2 Under-the-hood primitive: PT/YT via Exponent

Underneath everything:

- Each revenue-backed position is represented as an Exponent **SY market** with PT/YT legs:
  - Wrap a revenue-bearing “income token” into an SY-like representation, following Exponent’s yields standard  
    [Solana Yields Standard](https://docs.exponent.finance/protocol/protocol-mechanisms/solana-yields-standard).
  - Strip into **Principal Token (PT)** and **Yield Token (YT)** as per Exponent’s yield-stripping model  
    [Exponent Yield Stripping](https://docs.exponent.finance/protocol/protocol-mechanisms/exponent-yield-stripping).

Orderbook integration:

- Every PT/YT series lives as a **real market on Exponent’s orderbook** from day one.
- The attn risk engine computes a **model yield and a price floor** for each YT/PT series from the revenue-risk model (Sections 3–4).
- attnUSD acts as a **backstop liquidity provider**:
  - posts standing **limit orders** around that floor (quotes to buy/sell YT/PT),
  - ensures there is always some depth even before external LPs arrive.
- External LPs are free to post better bids/asks on the same orderbook:
  - if they bid tighter yields (higher prices), they take a share of the new issuance,
  - otherwise attnUSD absorbs the tranche.

Primary vs secondary:

- **Primary issuance**:
  - New RCAs/RRCL tranches mint YT/PT on Exponent.
  - attn underwrites at its model price and pushes those tokens into the Exponent market.
  - If there are standing external bids at or above the floor, they participate automatically; any residual is taken by attnUSD.
- **Secondary trading**:
  - PT/YT continue to trade on Exponent; this gives real-time mark-to-market for attnUSD and optional exit liquidity for advanced LPs.

Borrower abstraction:

- Borrowers never see Exponent, PT/YT, or orderbooks.
- They see only RCAs and RRCLs with deterministic quotes; underneath, those quotes are implemented as attn posting and filling limit orders for PT/YT on Exponent.

### 2.3 Should we be “just a PT/YT platform”?

No. Even though Exponent already provides generic yield markets [Exponent Docs](https://docs.exponent.finance/starthere):

- The **hard problem** is underwriting and wiring revenue accounts, not tokenising yield.
- Borrowers need **simple, interpretable products**, not PT/YT jargon.
- UX and trust benefit from a **single canonical flow** (“advance” and “line”) instead of an open-ended legoland of instruments.

So:

- We **leverage** Exponent as infra.
- We **ship** RCA + RRCL as primary offerings.
- We **optionally** let external builders create custom PT/YT-based products later, with risk gating (Section 8).

---

## 3. Limit sizing from onchain revenues

The goal of this section is to formalise a simple rule:

> **Under stressed revenues, the share of revenue we take, over the relevant horizon, must comfortably cover principal + fees.**

This is the onchain analogue of:

- **Royalty loans / revenue-based loans** in TradFi, where:
  - the borrower pays a fixed % of revenue until a cap multiple of the advance is reached, and
  - lenders check that projected revenues are sufficient to hit the cap in time.
- **MRR-based credit lines** where limits are set as a multiple (e.g. 2–3×) of Monthly Recurring Revenue.

See for example the discussion of *royalty loans* and *recurring revenue-based loans* in  
[ASX – Entrepreneurs’ Guide, Chapter 21: Alternative ways to finance your fast-growing company](https://www.asx.com.au/content/dam/asx/documents/listings/EntrepreneursGuide_REV_5_16.pdf).

Here we do the same thing, but with:

- **onchain revenue series** \(R_t\),
- an explicit **stress** on revenue,
- and a formal **coverage condition** that ties sizing directly to stressed cashflows.

---

### 3.1 Revenue observation window

We start from the project’s **onchain revenue history** into its attn revenue account.

Let:

- \( R_t \): revenue inflow (in USD) into the revenue account on day \( t \).
- Observation window \( W \): the last \( N \) days (e.g. 90–180 days, depending on maturity and sector).

From this window we compute:

- **Average daily revenue**:
  \[
  \mu = \frac{1}{N} \sum_{t=1}^{N} R_t
  \]
- **Standard deviation of daily revenue**:
  \[
  \sigma = \sqrt{\frac{1}{N - 1} \sum_{t=1}^N (R_t - \mu)^2}
  \]
- **Downside volatility (semi-deviation)** – only bad days:
  \[
  \sigma^{-} = \sqrt{\frac{1}{N^{-} - 1} \sum_{t: R_t < \mu} (R_t - \mu)^2}
  \]
  where \(N^{-}\) is the number of days with \(R_t < \mu\).

Intuition:

- \(\mu\): “typical” daily revenue.
- \(\sigma\): how noisy revenue is overall.
- \(\sigma^{-}\): how big the **shortfalls** are on bad days (we care more about bad days than upside spikes for credit).

We also derive structural features of the revenue stream:

- **Revenue concentration** – Herfindahl index on revenue shares by venue/pair/counterparty:
  \[
  \text{HHI} = \sum_i s_i^2,\quad
  s_i = \frac{\text{revenue from source } i}{\text{total revenue}}
  \]
  High HHI → revenue dominated by a few sources → higher risk.

- **Revenue trend** – slope \(b\) of a simple regression:
  \[
  R_t = a + b t + \epsilon_t
  \]
  - \(b > 0\): growing revenues.
  - \(b < 0\): decaying revenues.

- **Gap days** – fraction of days with low or zero revenue:
  \[
  p_{\text{gap}} = \frac{|\{ t : R_t < \theta_{\text{gap}}\mu \}|}{N}
  \]
  where e.g. \(\theta_{\text{gap}} = 0.1\) (days with <10% of average revenue).

These statistics are combined into a **revenue risk score** \( \rho \in [0,1] \) (0 = worst, 1 = best) that determines **tiers** (A/B/C) and allowable parameter ranges (max tenor, max revenue share, etc.). The exact mapping \((\mu,\sigma,\sigma^{-},\text{HHI},b,p_{\text{gap}}) \mapsto \rho\) is a risk-policy choice.

---

### 3.2 Stressed revenue level

Rather than trusting the raw average \(\mu\), we lend against a **stressed** daily revenue:

\[
\mu_{\text{stress}} = \max\bigl(0,\ \mu - k_{\sigma} \cdot \sigma^{-}\bigr)
\]

where:

- \(k_{\sigma} > 0\) is a **stress multiplier** (e.g. 1.0–2.5),
- chosen more conservatively for weaker tiers (higher downside volatility, high concentration, downward trend, many gap days).

Intuition:

- We “shift down” expected revenue by some multiple of downside volatility so that:
  - even if revenues underperform their recent average,
  - we are still planning to be repaid from a **reduced** cashflow baseline.
- This is similar in spirit to stress-testing cashflows in TradFi (e.g. stressed DSCR) before deciding how much debt a project can support.

For a given tenor \(T\) (in days), the **stressed cumulative revenue** we are willing to rely on is:

\[
S_{\text{stress}}(T) = \mu_{\text{stress}} \cdot T
\]

This is the “budget” of revenue we assume exists for sizing purposes, not the optimistic projection.

---

### 3.3 Cash advance sizing

Consider a **one-off advance** against a defined slice of future revenues:

- The project picks:
  - a **revenue share** \(\alpha \in (0,1)\) (e.g. “we’re willing to give up 30% of revenues”), and
  - a **maximum tenor** \(T\) in days (e.g. “up to 60 days”).
- attn sets:
  - a fee \(f\) (so total target repayment is \(R_{\text{target}} = A(1+f)\)),
  - and a **repayment cushion** \(\theta_{\text{RC}} \in (0,1)\) (e.g. 0.7–0.8).

Under the stressed revenue assumption, the **stressed repayment capacity** of an advance is:

\[
\text{Cap}_{\text{repay}} = \alpha \cdot S_{\text{stress}}(T) = \alpha \cdot \mu_{\text{stress}} \cdot T
\]

We require that, under stress, we are still “comfortably covered”:

\[
A(1+f) \le \theta_{\text{RC}} \cdot \alpha \cdot \mu_{\text{stress}} \cdot T
\]

Solving for the **maximum safe advance** \(A_{\max}\):

\[
A_{\max} =
\frac{\theta_{\text{RC}} \cdot \alpha \cdot \mu_{\text{stress}} \cdot T}{1+f}
\]

Interpretation:

- Bigger stressed revenue \(\mu_{\text{stress}}\), longer tenor \(T\), higher revenue share \(\alpha\) → **higher** possible advance.
- Higher fee \(f\) or tighter cushion \(\theta_{\text{RC}}\) → **lower** advance for the same revenue profile.
- This is exactly analogous to a **royalty loan** where you:
  - choose a % of revenue to pay, and
  - a repayment cap multiple (here \(1+f\)),
  - and then check that stressed projected revenues can reasonably hit that cap within \(T\).

---

### 3.4 Revolving line sizing

A **revolving credit line** is a reusable facility rather than a single fixed advance. We need to size the **maximum limit** \(L_{\max}\) so that, under reasonable utilisation, revenues can amortise the line.

Define:

- \(L_{\max}\): maximum line size.
- \(u_{\text{ref}} \in (0,1]\): **reference utilisation** (e.g. 0.5–0.7), the typical drawn fraction we assume for sizing.
- \(\bar{B} = u_{\text{ref}} \cdot L_{\max}\): average drawn balance under that scenario.
- \(\alpha\): revenue share applied while the line is drawn (same concept as for advances).
- \(T_{\text{eff}}\): **effective amortisation horizon** (days of stressed revenue we require to be enough to clear \(\bar{B}\) under the share \(\alpha\)).
- \(f_{\text{line}}\): fee/rate factor applied to the effective notional (so total to be repaid is \(\bar{B}(1+f_{\text{line}})\)).
- \(\theta_{\text{RC}}\): repayment cushion, as before.

Under stress, the revenue available to repay the line over \(T_{\text{eff}}\) is:

\[
\text{Cap}_{\text{repay,line}} = \alpha \cdot \mu_{\text{stress}} \cdot T_{\text{eff}}
\]

Coverage condition:

\[
\alpha \cdot \mu_{\text{stress}} \cdot T_{\text{eff}}
\ge
u_{\text{ref}} \cdot L_{\max} \cdot (1 + f_{\text{line}}) \cdot \theta_{\text{RC}}
\]

Solving for the **maximum** allowable line size \(L_{\max}\):

\[
L_{\max} = \frac{\alpha \cdot \mu_{\text{stress}} \cdot T_{\text{eff}}}{u_{\text{ref}} \cdot (1 + f_{\text{line}}) \cdot \theta_{\text{RC}}}
\]



Interpretation:

- The line limit is chosen so that, **at the assumed utilisation**, the stressed share of revenue over \(T_{\text{eff}}\) can still comfortably repay the average drawn balance plus fees.
- This is structurally the same as:
  - setting a SaaS / MRR-based line at a multiple of MRR, and
  - ensuring that, if the borrower channels a fixed % of revenue to debt service, the line amortises in a reasonable time even when growth slows.

---

### 3.5 Fixed-income and derivatives interpretation

For risk / structuring teams and LPs, the same logic can be reframed in fixed-income language.

1. **Cash advance as a finite-horizon Asset Backed Security (ABS) / royalty bond**

   - Underlying asset: a specified **revenue share** \(\alpha \in (0,1)\) of future onchain revenues \(R_t\) over \([t_0, T]\).
   - The **YT leg** is the claim on those cashflows until a cap \(R_{\text{target}} = A(1+f)\) is reached.
   - The **PT leg** is the residual principal / tail claim after the advance is fully repaid (or at maturity).

   Pricing-wise, the advance amount \(A\) is the **present value** of stressed cashflows:

   \[
   A
   \approx
   \sum_{t=1}^{T}
   \mathbb{E}_{\text{stress}}\bigl[\alpha R_t\bigr] \cdot D(t)
   \]

   where \(D(t)\) is a discount factor that embeds time value + credit spread, and the “stress” expectation already reflects the \(\mu_{\text{stress}}\) logic above. The implied fee \(f\) is the IRR that equates \(A\) with this PV.

2. **Revolving line as a revolving ABS / facility**

   - A line is a sequence of YT “draw tranches” with staggered start dates and effective horizons \(T_{\text{eff}}\).
   - The sizing condition in 3.4 is a **coverage test**:

     > stressed revenue share over \(T_{\text{eff}}\) ≥ drawn notional × (1+fees) × cushion.

   - This mirrors DSCR / coverage tests in revolving ABS deals and project-finance loans, where lenders require stressed cashflows to exceed debt service by a minimum multiple.

3. **PT/YT as standard bond strips**

   - PT ≈ a **zero-coupon bond** paying 1 at maturity: principal-only exposure.
   - YT ≈ a strip of cashflows between now and maturity: coupon / revenue-only exposure.

   This is directly analogous to yield-tokenisation designs such as [Pendle](https://docs.pendle.finance/) and [Exponent Finance](https://docs.exponent.finance/introduction/new-to-exponent), where SY positions are split into principal and yield tokens, and to [Xitadel’s](https://docs.xitadel.fi/what-is-ltt/) LTTs, which are overcollateralised, fixed-term debt instruments with explicit coverage logic on treasury assets rather than revenues.

4. **Hierarchy of views**

   - **UX layer** – founders and DAOs:
     - “Sell \( \alpha \) of revenue for \(T\) days”, “credit line sized off revenues”, “cap multiple \(1+f\)”.
   - **Credit policy layer** – risk team:
     - Revenue-based lending with stress scenarios and coverage multiples, analogous to royalty loans / MRR-backed lines and DSCR covenants.
   - **Structuring layer** – LPs and integrators:
     - Short-dated, amortising ABS-like tranches on onchain revenue, implemented as PT/YT strips on top of Exponent’s SY infra and aggregated into attnUSD.

This layered interpretation lets you keep borrower UX simple while giving LPs and risk stakeholders a clear, familiar framework for how limits and prices are derived.

---

## 4. Pricing: interest, spreads, and durations

### 4.1 Base pricing logic

We want pricing that:

- Pays LPs a **risk-appropriate IRR**.
- Is **simple** to communicate to borrowers.
- Is conservative relative to 3Jane-style unsecured pools which rely on heavier offchain underwriting  
  [3Jane](https://www.3jane.xyz/).

Let:

- \( A \): advance amount (or drawn amount for a tranche).
- \( R_{\text{target}} \): total repayment due (principal + fee).
- \( \tau \): expected time to full repayment (in years, under base case).
- Implied simple APR:
  \[
  \text{APR} \approx \frac{R_{\text{target}} - A}{A \cdot \tau}
  \]

We choose a **target IRR band** per risk tier (A/B/C) and **backsolve** \( R_{\text{target}} \) under base \( \tau \) such that:

- Under base revenue scenario: IRR ~ target.
- Under stress: IRR compressed but still acceptable.
- Under severe underperformance: limited loss per facility (controlled by limit sizing and tenor).

### 4.2 Revenue tiering (A/B/C) and credit spreads

Define:

- Tier A: low volatility, diverse venues, no single-point concentration, long history.
- Tier B: moderate volatility, some concentration, 3–6 months of history.
- Tier C: high volatility and/or short history.

Each tier has:

- Max tenor \( T_{\max} \).
- Max revenue share \( \alpha_{\max} \).
- Cushion \( \theta_{\text{RC}} \).
- IRR band \([r_{\min}, r_{\max}]\).

Example (illustrative):

| Tier | T_max | α_max | θ_RC | Target IRR band (USD terms) |
|------|-------|-------|------|------------------------------|
| A    | 180d  | 40%   | 0.8  | 8–12%                        |
| B    | 90d   | 35%   | 0.75 | 12–20%                       |
| C    | 45d   | 30%   | 0.7  | 20–35%                       |

We then:

1. Classify the facility (A/B/C) from revenue metrics \( \mu, \sigma, \sigma^{-}, \) concentration.
2. Choose \( \tau \) (linked to T, see 4.3).
3. Price \( R_{\text{target}} \) such that base-case IRR is in band.

### 4.3 Tenor & amortisation

Tenor selection is crucial for both **default containment** and **LP liquidity**, following similar reasoning to Xitadel’s LTT lifecycle (finite-state, fixed-term, with explicit maturity and failure states)  
[Xitadel LTT Lifecycle](https://docs.xitadel.fi/ltt-lifecycle-overview/).

For RCAs:

- Maximum tenor \( T_{\max} \) dictated by tier.
- Soft expected payback \( \tau < T_{\max} \).
- Hard maturity at \( T_{\max} \): any unpaid portion treated as **loss** unless restructuring.

For RRCL tranches:

- Treat each draw as a mini-advance:
  - assign \( T_i \), \( R_{\text{target},i} \).
- Amortise from revenue share until \( R_{\text{target},i} \) reached or \( T_i \) hit.

LP-side, this is essentially a portfolio of **short-dated YT positions**, similar in spirit to Pendle/PT/YT but with credit risk on revenues rather than just rate risk  
[Pendle Yield Tokenization](https://docs.pendle.finance/pendle-v2/Developers/Contracts/YieldTokenization).

### 4.4 attnUSD as counterparty: vault-level pricing

attnUSD is the main LP counterparty; it holds a mix of:

- Stablecoins.
- PT/YT from many revenue facilities.

We target a **vault-level net yield range**:

- e.g. 6–10% net after costs and expected losses for a diversified book.

Given:

- Mix of Tiers (A,B,C).
- Their IRR bands.

We can set a vault-level **target mix** such that:

- Weighted average IRR after expected loss ~ desired net yield.
- Duration profile is short enough (Pendle/Boros-style risk discipline; short tenors, ability to reprice frequently)  
  [Boros by Pendle](https://pendle.medium.com/boros-by-pendle-yield-trading-with-margin-63d026dc7399).

Pricing per vault (e.g. a “Creator RCA Vault”, “DePIN RRCL Vault”) is then:

- A mapping from facility’s tier to the IRR band that vault wants to lock in.
- Equivalent to Morpho’s vault-specific risk profile, except centralised and operator-driven at first  
  [Morpho Vaults](https://docs.morpho.org/learn/concepts/vault-v2/).

---

## 5. Vault caps, concentration limits, and risk structure

### 5.1 attnUSD “Core” vault

This is the primary vault that most LPs see:

- Holds diversified exposure across many revenue accounts and sectors.
- Has conservative caps and strict underwriting.

Configuration borrowed from:

- Morpho’s vault concentration & SmartLTV safeguards  
  [MetaMorpho Risk Model](https://forum.morpho.org/t/introducing-metamorpho-risk-model/447).
- Xitadel’s approach to fixed-term, non-overlapping LTT series with clear lifecycle and failure states  
  [Xitadel Docs](https://docs.xitadel.fi/).

Key limits:

- Name concentration: max \( c_{\text{name}} \) of NAV in a single entity (e.g. 5–10%).
- Sector/vertical caps (Pump.fun, DePIN, DEX, etc.).
- Launchpad caps (per MetaDAO/other).
- Tenor bucket caps (≤X% in > 90d, etc.).
- Seniority caps (super-senior revenue vs subordinated experimental flows).

### 5.2 Satellite “strategy” vaults (later)

Later we can mirror Morpho’s **MetaMorpho** model: allow **external curators** to create their own attnUSD-style vaults that select a subset of PT/YT exposure  
[metamorpho repo](https://github.com/morpho-org/metamorpho), [Morpho Vaults](https://docs.morpho.org/get-started/resources/contracts/morpho-vaults/).

- Curators choose risk profile (e.g. only Tier A, or only certain launchpads).
- Suppliers choose curators whose policies they trust.
- attn provides infra + base risk analytics, but delegates **allocation** decisions.

However, we should still:

- Keep **core underwriting** and **entity-level facility approval** central at v0–v1.
- Only allow satellite vaults to choose from already-approved facilities and PT/YT exposures.

This balances:

- Transparency and diversity (Morpho-style).
- Prevention of “anything goes” credit (3Jane, Wildcat, and some CeDeFi experiments show the risks of pushing too far, too early).

---

## 6. Centralised risk vs risk curators vs borrower-proposed terms

### 6.1 Should risk be centralised?

In early phases: **yes**, mostly.

Reasons:

- We’re underwriting a **new asset class** (onchain revenues) with limited default data.
- attnUSD is a single, protocol-level UX; catastrophic mispricing affects everyone.
- Market-based price discovery (Wildcat/3Jane style) is powerful but assumes a wide base of sophisticated LPs and robust legal/offchain infrastructure, which we don’t initially have  
  [Wildcat Whitepaper](https://docs.wildcat.finance/overview/whitepaper), [3Jane](https://www.3jane.xyz/).

So:

- v0–v1: **centralised risk team** sets:
  - Facility-level limits.
  - Tiers and IRR bands.
  - Portfolio caps.
- Expose analytics, but no open access to change risk parameters.

### 6.2 Role of external risk curators (Morpho-style)

Longer term:

- Permit **curated vaults** on top of attn PT/YT, analogous to Morpho’s MetaMorpho risk vaults  
  [Morpho Vaults](https://docs.morpho.org/learn/concepts/vault-v2/).
- Curators:
  - Don’t create facilities themselves.
  - Only choose among existing PT/YT exposures.
  - Publish written strategies, limits, and warnings (Morpho’s risk warnings concept is a good template).

This:

- Preserves a **single underwriting standard** at facility level.
- Lets LPs choose how much risk they want beyond attnUSD Core.
- Keeps us from ending up with unbounded borrower-curated markets where we can’t police risk at all.

### 6.3 Borrower-proposed terms, orderbook, RFQ, auctions

Wildcat lets borrowers define almost everything: rate, reserve mode, market parameters, with lenders deciding whether to join  
[Wildcat Docs](https://docs.wildcat.finance/overview/introduction).

For attn:

- We **do not** want fully generic borrower-defined credit markets.
- But we **do** want borrowers to express preferences within constraints.

Borrower proposal fields:

- Desired advance \( A_{\text{req}} \) or line increase.
- Max revenue share they are willing to route \( \alpha_{\max, \text{borrower}} \).
- Max acceptable “APR band”: e.g. low/med/high cost tiers.
- Soft preferred tenor (short/medium/long within their allowed range).

attn engine:

- Applies risk framework (Sections 3–4).
- Computes feasible \( A_{\max} \), \(\alpha\), \(T\), price.
- If solution lies within borrower’s preferences → **auto-accept**.
- If not → **return counter-offer** with a clear explanation.

Exponent orderbook and RFQ abstraction:

- The **canonical price discovery venue** for facility risk is the Exponent orderbook for the relevant **YT** series.
- For each new RCA/RRCL tranche:
  - The risk engine first computes a **model yield and a price floor** consistent with coverage tests and portfolio limits.
  - attnUSD posts **limit orders to buy YT** on Exponent around this floor (and may post asks if it wants to lighten existing exposure).
  - Primary issuance is effectively **underwritten at this model price**:
    - if external LP bids exist at or above the floor, they automatically fill part of the tranche via the orderbook;
    - otherwise attnUSD absorbs the whole issuance.

Notes on PT:

- PT represents residual principal / future revenues **beyond** the facility horizon \(T\).
- In v0–v1, PT is **not sold or traded**:
  - It is either retained by the borrower or locked in protocol accounting.
  - The Exponent integration focuses on YT as the tradable claim on the facility’s revenue slice over \([t_0, T]\).
- Any future PT liquidity (if ever enabled) would be a separate design decision and is **not** part of the initial product.

From the borrower’s point of view:

- This behaves like an **RFQ-style process**:
  - they request a facility (advance or line),
  - the risk engine responds with a firm quote based on the model and current vault state,
  - the fact that execution is satisfied via YT limit orders on Exponent is completely abstracted away.

- In other words, attn can treat “orderbook + attnUSD quotes” as an RFQ engine under the hood.

As LP depth grows, we can add a **primary RFQ / auction layer** on top:

- For new credit deals, attn:
  - pre-announces the tranche and floor yield to qualified LPs,
  - invites them to place competitive bids on the relevant Exponent market (or via RFQ API),
  - allocates the tranche at a **clearing yield** above the floor.
- Settlement still happens as PT/YT trades on Exponent; the “RFQ / auction” is a UX and allocation layer, not a separate pricing mechanism.

Only once:

- LP demand is material,
- we have rich analytics around defaults and recoveries,
- and the Exponent orderbook is deep enough,

do we consider more **Wildcat-style borrower-led pricing**, where borrowers propose full parameter bands and LPs compete inside attn’s hard risk limits.

---

## 7. Full user journey

### 7.1 Borrower journey

1. **Connect and designate revenue account**
   - For MetaDAO/Pump: template revenue vault created automatically via Squads.
   - For existing Squads-based protocols: mark an existing Safe as revenue account.
   - For others: deploy attn PDA vault or migrate to Squads.

2. **Revenue observation**
   - attn monitors at least \( N_{\min} \) days of revenue.
   - Real-time dashboards show:
     - Trailing revenue figures, volatility.
     - Current tier classification.

3. **Limit discovery**
   - UI displays:
     - Suggested **RCA max** and **RRCL max**.
     - Allowed ranges of \( \alpha \), \(T\), and price bands.
   - Borrower optionally adds non-core collateral (treasury tokens, stables).

4. **Term proposal (optional)**
   - Borrower indicates:
     - How much they want (A or line increment).
     - Preferred revenue share and payback window.
     - Price sensitivity (“cheaper but smaller” vs “bigger but more expensive”).

5. **Engine pricing and approval**
   - Risk engine computes:
     - \( \mu, \sigma, \mu_{\text{stress}} \).
     - Tier, \( T_{\max} \), IRR band.
     - Limit-sized \( A_{\max} \) / \( L_{\max} \).
   - If borrower’s ask fits → auto-approve.
   - Else → show feasible alternatives.

6. **Facility creation (RCA / RRCL)**
   - Onchain:
     - Create a **Revenue-Bearing Position** via Exponent (SY + PT/YT) referencing the revenue account  
       [Solana Yields Standard](https://docs.exponent.finance/protocol/protocol-mechanisms/solana-yields-standard).
     - attnUSD vault buys YT leg (or PT/YT combination, depending on design) by filling its own or external limit orders on Exponent.
   - Borrower receives stables (USDC/USDT/etc.).
   - Revenue share rules activate in revenue account.

7. **Use of funds**
   - Borrower uses funds for:
     - Development, liquidity, campaign, BNPL funding, payroll, card spend, etc. (v3).
   - All spend endpoints (cards, payroll, BNPL) are **downstream**; attn only sees the credit draw.

8. **Repayment and monitoring**
   - Each new revenue deposit is split:
     - \( \alpha \) to facility buckets.
     - Remainder stays as free balance (earning base yield if available).
   - UI shows:
     - Remaining \( R_{\text{target}} \).
     - Estimated days to repay at current revenue.
     - Early repayment options.

9. **Closure / restructuring**
   - When \( R_{\text{target}} \) reached:
     - Facility closes automatically.
     - Revenue share resets to 0.
   - If tenor \( T \) reached with shortfall:
     - Write down YT in attnUSD vault and mark as loss.
     - Optionally offer restructuring (new facility with stricter terms).

### 7.2 LP journey (attnUSD)

1. **Deposit**:
   - LP deposits stables into attnUSD.
   - Receives attnUSD shares at current NAV.

2. **Portfolio view**:
   - Summary:
     - Exposure by sector, launchpad, name, tenor bucket, tier.
     - Realised and expected yield.
   - Facility-level detail for advanced users:
     - PT/YT positions, notional, maturity, performance.

3. **Yield accrual**:
   - As revenue flows back from entities:
     - YT positions pay cashflows into vault.
     - NAV increases net of fees and losses.
   - Yield is visible in attnUSD share price.

4. **Redemption**:
   - LP burns attnUSD.
   - Receives a pro-rata basket of stables (and, in future, optionally some very liquid PT/YT).

The UX should hide technicalities (PT/YT, SY, Exponent orderbooks) for 95% of LPs, similar to how 3Jane wraps a pool of unsecured credit lines behind a single USD3 instrument [3Jane](https://www.3jane.xyz/), as described in the “3Jane Lending & Credit Origination Process” figure in [State of Stablecoins – Messari](https://www.scribd.com/document/901365543/Mesari) and the explainer [Unsecured Lending Agreement 3 – How does Jane change the on-chain market?](https://www.trendx.tech/news/unsecured-lending-agreement-3-how-does-jane-change-the-on-chain-market-1627494).


---

## 8. Lessons from Pendle, Boros, Exponent, Wildcat, Xitadel, Morpho, 3Jane

### 8.1 Pendle & Boros: yield tokenisation & rate trading

- **Pendle**:
  - Wraps yield-bearing assets into a standardised SY token, then splits into PT and YT  
    [Pendle Docs](https://docs.pendle.finance/Introduction/), [Yield Tokenization](https://docs.pendle.finance/pendle-v2/Developers/Contracts/YieldTokenization), [SY](https://docs.pendle.finance/ProtocolMechanics/YieldTokenization/SY/).
  - Supports AMMs where PT/YT can be traded, enabling fixed/float trades and various yield strategies.

- **Boros**:
  - Extends this to **funding rates** as a tradable yield unit (funding “futures”)  
    [Boros by Pendle](https://pendle.medium.com/boros-by-pendle-yield-trading-with-margin-63d026dc7399), [Boros v1.0](https://medium.com/boros-fi/boros-v1-0-3d29d5a0fac8), [Boros Funding Futures](https://medium.com/boros-fi/boros-introducing-funding-futures-d1f69111a8a7).
  - Uses **margin, OI caps, and oracles** for risk control.

Implications for attn:

- PT/YT infra via Exponent should mimic Pendle’s **standardised yield interface** to be composable  
  [Solana Yields Standard](https://docs.exponent.finance/protocol/protocol-mechanisms/solana-yields-standard).
- We can later:
  - Allow secondary trading of revenue YT (credit YT).
  - Build rate-swap like instruments on **revenue growth or discount factors**.
- For now:
  - We **do not** expose leverage or margin trading on revenue risk (Boros-style) to end users.
  - We **do** borrow Boros’ discipline around OI caps and margin logic when thinking about vault caps and tenor buckets.

### 8.2 Exponent: yield stripping on Solana

Exponent provides:

- Yield-exchange markets for Solana yield-bearing assets.
- A standard for wrapping and stripping yields into fixed and floating legs  
  [Exponent Docs](https://docs.exponent.finance/starthere), [Exponent Yield Stripping](https://docs.exponent.finance/protocol/protocol-mechanisms/exponent-yield-stripping).

We piggyback on this:

- Represent each revenue facility as an Exponent SY market.
- Use PT/YT as our **bookkeeping** and, later, as liquidity primitives.
- Use Exponent’s **orderbook** both for:
  - primary distribution of new PT/YT (underwritten at attn’s floor), and
  - secondary trading and mark-to-market.

This keeps attn implementation simple and leverages existing infra.

### 8.3 Wildcat: borrower-defined markets

Wildcat shows:

- It is possible to build **borrower-led undercollateralised credit markets** with high configurability (rates, lockups, access modes)  
  [Wildcat Docs](https://docs.wildcat.finance/overview/introduction), [Wildcat Whitepaper](https://docs.wildcat.finance/overview/whitepaper).
- However, it leans heavily on:
  - Offchain reputation.
  - Market discipline from LPs selecting or rejecting markets.

attn’s response:

- Borrowers **can** express preferences, but only **inside** attn’s risk envelope.
- We keep **credit creation** central and do not open up a full “anyone can create a market” surface.

### 8.4 Xitadel: overcollateralised, fixed-term LTTs

Xitadel’s LTTs are:

- Over-collateralised, fixed-term instruments backed by treasury tokens  
  [What is LTT?](https://docs.xitadel.fi/what-is-ltt/), [LTT Lifecycle](https://docs.xitadel.fi/ltt-lifecycle-overview/).
- With finite state machine lifecycle (Pending, Funding, Active, Matured, Failed).

We adopt:

- Fixed-term, state-driven modelling for RCAs and RRCL tranches.
- Clear termination conditions (Matured vs Defaulted).
- Potential use of LTT-like structures for **treasury-backed hybrid products**, but keep revenue as primary collateral.

### 8.5 Morpho & MetaMorpho: risk-curated vaults and SmartLTV

Morpho introduces:

- A base lending primitive (Morpho Blue) and **permissionless vaults** on top  
  [Morpho Docs](https://docs.morpho.org/), [Vault V2](https://docs.morpho.org/learn/concepts/vault-v2/).
- MetaMorpho vaults curated by third-party risk managers; each has its own risk profile  
  [metamorpho repo](https://github.com/morpho-org/metamorpho).
- SmartLTV metrics to ensure vault configurations respect risk bounds  
  [SmartLTV](https://medium.com/b-protocol/smartltv-is-live-on-mainnet-automating-risk-management-on-morpho-vaults-bcd290d1ee08).

We adopt:

- A **core** vault (attnUSD) plus eventually **curated satellite vaults**.
- Internal “SmartLTV-like” guardrails to ensure facility sets do not violate global risk parameters.

### 8.6 3Jane: unsecured credit underwritten by multi-source data

3Jane:

- Offers unsecured USDC credit based on a proprietary offchain credit engine (3CA) combining DeFi/CEX assets, bank balances, and scores  
  [3Jane](https://www.3jane.xyz/).
- Wraps the credit pool into a yield coin (USD3).

We contrast:

- We **do not** replicate 3CA; we stay onchain, revenue-only.
- We **do** reuse the idea of:
  - A yield token representing diversified credit exposure (attnUSD).
  - Entity-level credit accounts with flexible draws.

---

## 9. UX tradeoffs and guardrails

### 9.1 Hiding complexity

- Borrowers:
  - See only “advance”, “credit line”, “limit”, “share of revenue”, “estimated payback”.
  - Never need to understand PT/YT, Exponent, or orderbooks.

- LPs:
  - Default to attnUSD.
  - Can see high-level portfolio metrics; PT/YT only in advanced views.

### 9.2 Not underselling risk

To avoid underpricing:

- Keep tenors short initially (≤90 days).
- Use conservative stress factors \( k_\sigma \) and cushions \( \theta_{\text{RC}} \).
- Start with Tier B/C pricing (double-digit IRRs) and tighten only after real performance data.
- Communicate clearly that attnUSD is **credit risk**, not a pegged stable (like USD3, it is a yield token with loss risk)  
  [3Jane](https://www.3jane.xyz/).

### 9.3 Profitability vs growth

- Facilities must be profitable at vault-level after:
  - Loss expectations.
  - Operating and gas costs.
  - Insurance or reserve contributions (once introduced).

- Early on:
  - Bias towards **lower utilisation but safer** book.
  - Use incentives (token, fee discounts) later to support adoption, instead of cutting spreads below reasonable loss-adjusted levels.

---
## 10. Open questions and future work

1. **Revenue modelling sophistication**  
   - Move from simple \( (\mu, \sigma) \) analysis to:
     - Regime detection (bull/bear).
     - Market share and competitive metrics.
     - Correlation models across entities.
   - Use time-series models and stress testing.

2. **Default playbook and legal layer (small vs large facilities)**  
   - v0–v1: aim to keep **small and mid-size facilities purely onchain**:
     - enforcement via revenue-account control, shutdown of new advances, and programmatic write-downs in attnUSD;
     - no separate offchain loan agreements; the “contract” is the onchain program + in-app terms.
   - For **large, named credits**, plan for an **optional offchain legal wrapper** (revenue-based credit agreement, pledge / security, servicing / enforcement, assignment mechanics).  
   - This hybrid model is **aspirational** and described in detail in Section 11; it is not required to ship v0.

3. **Secondary markets for YT**  
   - Explore Pendle-like AMMs for revenue YT after we have enough variety.
   - Consider Boros-style funding futures on **revenue growth**.

4. **Stream-backed facilities (v2/v3)**  
   - Treat Sablier-style Lockup/Flow streams as revenue accounts:
     - ENFORCE route-ability and non-reroutability conditions.
     - Limit share of each stream that can be pledged.

5. **BNPL and card integration**  
   - Flesh out risk-sharing and data flows with card & BNPL partners.
   - Ensure entity-level facilities cannot be implicitly transformed into consumer loans on the attn side.

---
## 11. Aspirational legal / offchain architecture for large facilities

This section is **aspirational**: it sketches how attn could handle large, institutional-scale facilities once there is meaningful demand and regulatory clarity. It is not required for v0, which can operate purely onchain for small and mid-size tickets.

In practice, these large-facility structures are **OTC-style private credit deals**:

- Origination is bilateral or club (term sheet negotiation with a named entity).
- Primary distribution is to attnUSD and/or a small set of whitelisted LPs, not a public permissionless pool.
- Onchain PT/YT representations, if any, are either:
  - internal bookkeeping for attnUSD, or
  - transfer-gated instruments mirroring the legal participations, not freely tradable retail tokens.

### 11.1 Small / mid-size facilities: purely onchain

For small and mid-size facilities, attn should remain **fully onchain**:

- Enforcement is handled entirely via:
  - exclusive control over the revenue account / stream handle,
  - automated reduction or shutdown of fresh advances,
  - programmatic write-downs in attnUSD when coverage tests fail.
- There is no separate offchain loan agreement; the “contract” is:
  - the onchain program and its parameters, plus
  - the in-app terms the borrower accepts when opening a facility.

Default playbook for these facilities:

1. Coverage breach or sustained revenue collapse is detected.
2. Facility is frozen; no new drawings.
3. Revenue share is optionally increased within onchain caps to accelerate recovery.
4. After a defined cure period, any remaining shortfall is written down in attnUSD and recorded as a realised loss.

This keeps the long tail of smaller entities simple, composable, and jurisdiction-neutral.

### 11.2 Large, named facilities: two-layer enforcement model

For **larger lines** (e.g. ≥ X USD equivalent, or for systemically important entities), a purely onchain approach may be insufficient. Here, we can target a **two-layer enforcement model**, conceptually similar to what Xitadel and 3Jane implicitly rely on.

#### 11.2.1 Onchain credit instrument

Each large facility is still represented onchain, typically as an Exponent-style SY/PT/YT structure:

- A specific **facility ID**.
- Revenue account binding.
- Tenor and coverage tests.
- Default states (e.g. “Performing”, “In Default”) encoded at program level.

This mirrors Xitadel’s LTT lifecycle states (Pending → Funding → Active → Matured / Failed) and onchain coverage checks  
([LTT Lifecycle Overview](https://docs.xitadel.fi/ltt-lifecycle-overview/)).

Onchain logic:

- Computes coverage metrics.
- Flags default conditions.
- Blocks new drawings once default is triggered.
- Exposes a canonical state for offchain contracts to reference.

#### 11.2.2 Offchain legal wrapper

For large, named borrowers (major DEX, infra protocol, DePIN network, etc.), we add a conventional legal stack that maps cleanly onto the onchain facility.

1. **Revenue-based credit agreement**  
   - Contract between the borrower’s legal entity (company / foundation / DAO wrapper) and an attn SPV or trustee.
   - References:
     - the onchain facility ID,
     - the designated revenue account (PDA / Squads Safe) as the “payment account”.
   - Specifies:
     - governing law and jurisdiction,
     - principal amount and pricing mechanics (e.g. revenue share, cap multiple, tenor),
     - revenue-sharing and covenants (e.g. no rerouting of revenues away from designated account; information covenants),
     - events of default (both onchain triggers and offchain breaches),
     - acceleration and restructuring mechanics.

   This is the analogue, on the corporate/revenue side, of the unsecured loan agreements sitting behind 3Jane’s USD3 pool, which in their design enable non-performing debts to be sold to US debt-collection agencies rather than left purely onchain.

2. **Security / pledge agreement (if there is asset backing)**  
   - If the entity also pledges treasury assets (stables, LSTs, LRTs) à la Xitadel:
     - a pledge or security agreement over those assets, referencing the onchain collateral vault,
     - explicit remedies in case of default (enforcement on pledged tokens, right to instruct certain onchain actions, etc.).
   - This is conceptually similar to Xitadel’s overcollateralised LTTs, where treasury tokens back fixed-term instruments and onchain coverage tests drive default outcomes  
     ([What is LTT?](https://docs.xitadel.fi/what-is-ltt/)).

3. **Servicing / enforcement agreement**  
   - Defines a “credit servicer” or “enforcement agent” (internal or third party) empowered to:
     - monitor onchain facility state and revenue data,
     - declare offchain events of default when onchain coverage tests fail or covenants are breached,
     - take enforcement actions on behalf of attnUSD LPs:
       - demand letters and standstills,
       - restructuring negotiations,
       - legal proceedings or assignment of the claim.
   - Functionally similar to Xitadel’s notion of external enforcement agents monitoring coverage and triggering default actions in the LTT lifecycle  
     ([External Enforcement Agents](https://docs.xitadel.fi/external-enforcement-agents/), [Compliance Orientation](https://docs.xitadel.fi/compliance-orientation/)).

4. **Assignment / participation mechanics**  
   - For very large tickets, the documents should allow:
     - syndication of a portion of the facility to specific LPs or partners,
     - or assignment of the claim (in part) to another credit or distressed-debt fund or servicer.
   - This is analogous to 3Jane’s plan to auction non-performing unsecured debts to traditional US collectors (who purchase the legal claim, not just an onchain handle).

#### 11.2.3 Default playbook for large facilities

For large facilities with this hybrid structure:

1. Onchain coverage breach or sustained revenue collapse is detected.
2. Facility is frozen onchain; no new drawings.
3. Attempt to cure onchain (e.g. adjust revenue share within predefined caps).
4. If default persists beyond a defined cure period:
   - the offchain credit agreement allows **acceleration** of the full outstanding amount;
   - the enforcement agent can:
     - negotiate restructuring with the borrower’s legal entity (extend tenor, adjust share, partial write-down),
     - enforce via pledged assets or other legal remedies,
     - or assign/sell the claim to a specialised credit/distressed-debt fund or collector.
5. Any recovery is routed:
   - back into the onchain facility (reducing defaulted balance), or
   - directly into attnUSD,
   - and allocated to LPs with appropriate write-backs.

### 11.3 Design goals for this aspirational layer

- Keep the **core product** (long tail of entities, small and mid tickets) clean and fully onchain.
- Make it possible, when needed, to:
  - structure **institutional-scale deals** with governance, covenants, and enforceability comparable to treasury financings (Xitadel) or unsecured consumer/SMB credit (3Jane);
  - bridge between DeFi-native LPs and traditional credit/distressed capital.

All of this requires jurisdiction-specific legal work. The protocol’s job is to:

- define a clear mapping between onchain facility states and offchain rights; and
- keep the onchain state machine simple and composable, so different legal wrappers can sit on top where appropriate.

---

## 12. Summary of key design answers

- **Should risk be centralised?**  
  - Yes, at v0–v1. attn runs a central risk engine.  
  - Later, allow **curated vaults** on top of attn PT/YT, but facilities remain centrally underwritten.

- **Ship RCAs and RRCLs or just PT/YT?**  
  - Ship **both RCAs and RRCLs as primary UX**.  
  - PT/YT/Exponent remains infra and advanced building block.

- **Reputation / credit scores?**  
  - No. Underwriting is **revenue-first**, optionally **asset-bumped**, no reputation scores.

- **Allow firms to propose their own limits and prices Wildcat-style?**  
  - Yes, but **bounded**:
    - Borrower indicates ask and preferences.
    - Engine accepts or counter-offers inside the risk envelope.
  - No fully free-form borrower-defined markets in v0–v1.

- **Orderbook vs RFQ vs auctions?**  
  - Use **Exponent’s orderbook from day one**:
    - attnUSD posts limit orders at a model-based floor.
    - External LPs can bid tighter and take primary allocation.
  - From the borrower’s perspective, this behaves like an **RFQ-style quote**:
    - they ask for credit,
    - attn responds with a firm price,
    - underlying execution is via the orderbook.
  - Add explicit RFQ/auction allocation for large deals once LP depth is real.

- **Legal / offchain architecture for large facilities?**  
  - v0–v1: small and mid-size facilities are **purely onchain**; enforcement via revenue-account control and programmatic write-downs, no mandatory offchain loan docs.  
  - Later: optionally enable a **two-layer model** for large, named credits:
    - onchain facility state machine (facility ID, coverage tests, default states);
    - offchain revenue-based credit agreements, pledge/security, enforcement/servicing and assignment mechanics (Section 11).

- **Does this doc cover the full journey?**  
  - Yes:
    - Credit limit sizing (Section 3).
    - Pricing / interest (Section 4).
    - Duration selection (Section 4.3).
    - Vault caps & LP side (Section 5).
    - Central vs curated risk (Section 6).
    - Full borrower / LP journeys (Section 7).
    - How to price per vault when attnUSD is counterparty (Section 4.4).
    - Lessons from 3Jane, Morpho, Wildcat, Xitadel, Pendle, Boros, Exponent (Section 8).
    - UX / product implications (Sections 2, 9).
    - Open questions (Section 10).
    - Aspirational legal/offchain layering for large facilities (Section 11).

---

## 13. Source index

Core references (non-exhaustive):

- [3Jane](https://www.3jane.xyz/)
- [Morpho Docs](https://docs.morpho.org/)
- [MetaMorpho Risk Model](https://forum.morpho.org/t/introducing-metamorpho-risk-model/447)
- [SmartLTV](https://medium.com/b-protocol/smartltv-is-live-on-mainnet-automating-risk-management-on-morpho-vaults-bcd290d1ee08)
- [Morpho Vaults / Vault V2](https://docs.morpho.org/learn/concepts/vault-v2/)
- [metamorpho repo](https://github.com/morpho-org/metamorpho)
- [Wildcat Docs](https://docs.wildcat.finance/)
- [Wildcat Whitepaper](https://docs.wildcat.finance/overview/whitepaper)
- [Xitadel Docs](https://docs.xitadel.fi/)
- [What is LTT?](https://docs.xitadel.fi/what-is-ltt/)
- [LTT Lifecycle](https://docs.xitadel.fi/ltt-lifecycle-overview/)
- [External Enforcement Agents](https://docs.xitadel.fi/external-enforcement-agents/)
- [Compliance Orientation](https://docs.xitadel.fi/compliance-orientation/)
- [Pendle Docs](https://docs.pendle.finance/Introduction/)
- [Yield Tokenization](https://docs.pendle.finance/pendle-v2/Developers/Contracts/YieldTokenization)
- [SY Standard](https://docs.pendle.finance/ProtocolMechanics/YieldTokenization/SY/)
- [Boros by Pendle](https://pendle.medium.com/boros-by-pendle-yield-trading-with-margin-63d026dc7399)
- [Boros v1.0](https://medium.com/boros-fi/boros-v1-0-3d29d5a0fac8)
- [Boros Funding Futures](https://medium.com/boros-fi/boros-introducing-funding-futures-d1f69111a8a7)
- [Exponent Docs](https://docs.exponent.finance/starthere)
- [Solana Yields Standard](https://docs.exponent.finance/protocol/protocol-mechanisms/solana-yields-standard)
- [Exponent Yield Stripping](https://docs.exponent.finance/protocol/protocol-mechanisms/exponent-yield-stripping)
