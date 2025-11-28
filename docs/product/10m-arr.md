# attn.markets – TVL & ARR Planning

Goal: get a realistic sense of what TVL and gross interest/fee income (ARR) are achievable with:

- conservative borrower pricing (6–8–12% bands; flat 5–15% factor for short-term cash advances),
- mostly **short-tenor** products,
- and a **pessimistic view on idle balances**, especially for Pump.fun creators.

All numbers below are **order-of-magnitude planning**. They are gross interest/fee flows; actual protocol revenue = gross × “take rate” (e.g. 20–40% of interest/fees) after paying LPs.

---

## 0. Verticals we actually model

We focus on four concrete verticals:

1. **MetaDAO projects (treasury + early revenue)**  
   - Structured, Squads-governed treasuries on Solana.
   - Mix of treasury-backed and revenue-backed credit.

2. **Onchain B2B (RPCs, infra, wallets, SaaS)**  
   - Revenue-backed lines for businesses that already invoice/earn onchain.

3. **Pump.fun creator rewards**  
   - **Short-term cash advances** against upcoming creator rewards.  
   - Light auto-staking on idle balances with a small yield take.

4. **Card / payroll rails (Avici / Krak-type partners)**  
   - attn as a **wholesale revenue-backed credit line** behind their card / payroll books and some merchant BNPL.

Each vertical has:

- an assumed TVL band,
- borrower pricing band,
- and a contribution to gross ARR.

---

## 1. Pricing bands and basic assumptions

### 1.1 Borrower pricing bands (non-Pump)

For **RCA / RRCL-style credit** (non-Pump):

- Tier A (strong revenue/treasury, short tenor):  
  - Borrower APR: **6–8%**.
- Tier B (moderate risk):  
  - Borrower APR: **8–10%**.
- Tier C (riskier / experimental):  
  - Borrower APR: **10–12%**.

In this doc we mostly use:

- **8% APR** for MetaDAO + card/payroll verticals.  
- **10% APR** for general onchain B2B (RPC, infra, wallets).

You can always rescale if final bands differ.

### 1.2 Pump.fun cash advances – flat factor rates

For **Pump.fun cash advances**:

- Use a **flat factor** \( f_{\text{factor}} \in [5\%, 15\%] \).
- Creators see: “Receive \(A\) now, repay \(A \cdot (1+f_{\text{factor}})\) from upcoming rewards.”
- We do **not** talk APR in the UI; APR is only an internal risk metric.

Tenor constraints:

- For **pure creator reward advances** (no real project / company behind it):  
  - Max tenor: **7–30 days**.  
  - Typical: **7 or 14 days**.
- For **actual projects/firms that launched via Pump** (teams with ongoing plans, not one-off memecoins):  
  - Tenor per facility: **30–90 days**.  
  - Nothing beyond 90 days on Pump flows.

Effective APR examples (for internal risk only):

Let \( f_{\text{factor}} = 10\% \) (0.10):

- 7-day tenor: \( \text{APR} \approx 0.10 \times \frac{365}{7} \approx 521\% \).
- 14-day tenor: \( \text{APR} \approx 0.10 \times \frac{365}{14} \approx 261\% \).
- 30-day tenor: \( \text{APR} \approx 0.10 \times \frac{365}{30} \approx 122\% \).
- 60-day tenor: \( \approx 61\% \).
- 90-day tenor: \( \approx 41\% \).

This is why:

- Tenors must stay very short.
- Factor rates must be communicated as **flat fees for short-term liquidity**, not annualised.

In the **scenario modelling below**, we assume:

- Baseline Pump creator rewards flow:  
  - \( R_{\text{pump}}^{\text{max}} = \$300m \) (user-supplied estimate, “max”).  
  - Baseline used in the model: \( R_{\text{pump}} = \$150m \) (50% of max).
- Average **effective tenor** across all Pump advances:  
  - \( T_{\text{avg}} = 21 \) days (mix of 7/14 days for pure creators and 30–60 days for a minority of more serious projects).

---

## 2. Vertical 1 – MetaDAO projects (treasury + revenue)

### 2.1 Setup

Assume:

- ~100 MetaDAO projects over time.
- Typical treasury per project at launch: **\$\~1m**.
- Burn: **\$40–60k/month**, say **\$50k/month** for planning.
- Runway ~12–20 months; we cap at 12 months of burn for sizing.

Line sizing (simplified, treasury-backed):

- Let \( \text{Burn} = \$50k/month \).
- “Stress” runway we lend against: 12 months.
- Haircut×LTV across treasury + (future) revenues: say **20%**.
- Maximum **facility capacity** per project:
  \[
  C \approx 0.2 \times 12 \times 50k = \$120k.
  \]

Use **line size per project ≈ \$100k** for planning.

Utilisation assumption:

- Average utilisation of the line over a year: **50%**.  
  → Average TVL per project: **\$50k**.

Borrower pricing:

- APR: **8%** (Tier A/B between 6–10%).

### 2.2 Scenario TVL and ARR

Projects live and using attn:

| Scenario  | Projects with lines | Avg TVL per project | MetaDAO TVL | Gross interest at 8% APR |
|----------:|--------------------:|---------------------:|------------:|--------------------------:|
| Today     | 20                  | \$50k                | \$1.0m      | \$0.08m                   |
| Low       | 50                  | \$50k                | \$2.5m      | \$0.20m                   |
| Mid       | 80                  | \$50k                | \$4.0m      | \$0.32m                   |
| High      | 120                 | \$50k                | \$6.0m      | \$0.48m                   |

These are **mixed treasury + revenue-backed** lines; they look very close to Xitadel-type economics but scoped inside MetaDAO’s Squads constraints and revenue wiring.

---

## 3. Vertical 2 – Onchain B2B (RPCs, infra, wallets, SaaS)

This is a broader universe than MetaDAO but still:

- Strongly onchain revenues (fees, subscriptions, infra bills).
- Entity-level revenue accounts or onchain receivables.

Conservative planning TVL and pricing:

- Borrower APR: **10%** (Tier B between 8–12%).
- TVL bands by scenario:

| Scenario | Onchain B2B TVL | Gross interest at 10% APR |
|---------:|----------------:|---------------------------:|
| Today    | \$1.0m          | \$0.10m                    |
| Low      | \$5.0m          | \$0.50m                    |
| Mid      | \$10.0m         | \$1.00m                    |
| High     | \$20.0m         | \$2.00m                    |

This vertical will likely be slower to start than Pump.fun, but higher quality and stickier once onboarded.

---

## 4. Vertical 3 – Pump.fun creator rewards

### 4.1 Core assumptions

Creator rewards:

- User-supplied upper bound: **\$300m/year** creator rewards.
- Baseline for modelling:  
  \[
  R_{\text{pump}} = \$150m \text{ per year}.
  \]

Products:

1. **Short-term cash advances** against near-term rewards.
2. **Auto-staking on idle balances** (small and pessimistic in this update).

Parameters per scenario:

- \( s \): share of annual rewards financed by attn (market share on advanced volume).
- \( f_{\text{factor}} \): flat factor rate on advances.
- \( B_{\text{idle}} \): average idle creator rewards balance sitting in attn-linked accounts.
- \( y_{\text{SOL}} \): base staking yield on SOL = **6%**.
- \( \gamma \): attn yield take-rate on staking = **8%**.

**Important:** Here we assume creator rewards are spent **quickly**, so idle balances are **small**.

---

### 4.2 Pump advance volumes, TVL and revenue

Definitions:

- Annual rewards used in advances:  
  \[
  V_{\text{adv}} = s \cdot R_{\text{pump}}.
  \]
- Average tenor:  
  \[
  T_{\text{avg}} = 21 \text{ days}.
  \]
- Average outstanding TVL from advances:
  \[
  \text{TVL}_{\text{adv}} = V_{\text{adv}} \cdot \frac{T_{\text{avg}}}{365}.
  \]
- Advance fee income:
  \[
  \text{Rev}_{\text{adv}} = V_{\text{adv}} \cdot f_{\text{factor}}.
  \]
- Idle-balance staking income to attn:
  \[
  \text{Rev}_{\text{stake}} = B_{\text{idle}} \cdot y_{\text{SOL}} \cdot \gamma.
  \]

Scenario parameters (for \( R_{\text{pump}} = \$150m \)):

| Scenario | \(s\) (share of flow) | \(f_{\text{factor}}\) | \(B_{\text{idle}}\) (avg) |
|---------:|-----------------------:|----------------------:|--------------------------:|
| Today    | 2%                    | 7%                    | \$2m                      |
| Low      | 5%                    | 8%                    | \$5m                      |
| Mid      | 10%                   | 10%                   | \$10m                     |
| High     | 20%                   | 12%                   | \$20m                     |

Computed values:

| Scenario | \(V_{\text{adv}}\) (annual advanced) | TVL\(_{\text{adv}}\) (avg) | Rev\(_{\text{adv}}\) | Rev\(_{\text{stake}}\) | Total Pump gross |
|---------:|--------------------------------------:|---------------------------:|----------------------:|-----------------------:|------------------:|
| Today    | \$3.0m                               | ~\$0.17m                   | \$0.21m               | \$0.01m                | **\$0.22m**       |
| Low      | \$7.5m                               | ~\$0.43m                   | \$0.60m               | \$0.02m                | **\$0.62m**       |
| Mid      | \$15.0m                              | ~\$0.86m                   | \$1.50m               | \$0.05m                | **\$1.55m**       |
| High     | \$30.0m                              | ~\$1.73m                   | \$3.60m               | \$0.10m                | **\$3.70m**       |

Notes:

- **TVL is small** (sub-\$2m even in the high scenario) because the average tenor is short (~21 days).
- **Gross revenue is driven almost entirely by flat factors**, not idle yield.
- Idle yield is pessimistic: even for \$150m/year in rewards, we assume only **\$2–20m** idle at any time.

Tenor split consistent with these numbers (conceptually):

- 60–70% of volume: pure creator 7–14 day advances.
- 30–40% of volume: more structured 30–60 day advances for projects with better persistence.

---

## 5. Vertical 4 – Card / payroll rails (Avici / Krak-type partners)

This vertical is more medium-term but important for eventual scale.

Concept:

- Avici, Krak, etc. want to:
  - bank **payroll** and **everyday spending**, and
  - build unsecured credit on top of a **Trust Score** or similar.
- attn can provide:
  - **wholesale credit lines** to these entities based on their **fee/interchange revenue and loan books**, not on consumer receivables directly.
  - targeted facilities for specific **onchain revenue streams or watch-BNPL-type portfolios** launched via them.

Assumed economics for planning:

- APR to partners on attn lines: **8%** (Tier A/B).
- They can on-lend higher (e.g. 12–18%) to consumers/merchants; attn only sees the wholesale 8%.

TVL bands:

| Scenario | Card/Payroll TVL (wholesale) | Gross interest at 8% APR |
|---------:|-----------------------------:|--------------------------:|
| Today    | \$0m                         | \$0.00m                   |
| Low      | \$2.0m                       | \$0.16m                   |
| Mid      | \$5.0m                       | \$0.40m                   |
| High     | \$10.0m                      | \$0.80m                   |

This remains aspirational until:

- we have clear onchain data on their **revenue + losses**, and
- we negotiate explicit facility terms.

---

## 6. Portfolio view – TVL and gross ARR by scenario

Combine the four verticals:

- MetaDAO projects (treasury + revenue lines).
- Onchain B2B.
- Pump.fun.
- Card/payroll rails.

### 6.1 Scenario summary

For each scenario we list:

- TVL per vertical.
- Gross ARR per vertical (interest + Pump factors + staking take).

#### Today-ish

- MetaDAO TVL: **\$1.0m** @ 8% → **\$0.08m**  
- Onchain B2B TVL: **\$1.0m** @ 10% → **\$0.10m**  
- Pump TVL: **~\$0.17m**; gross → **\$0.22m**  
- Card/payroll TVL: **\$0m** → **\$0.00m**

Totals:

- **Total TVL ≈ \$2.2m**  
- **Total gross ARR ≈ \$0.40m**

#### Low

- MetaDAO TVL: **\$2.5m** @ 8% → **\$0.20m**  
- Onchain B2B TVL: **\$5.0m** @ 10% → **\$0.50m**  
- Pump TVL: **~\$0.43m**; gross → **\$0.62m**  
- Card/payroll TVL: **\$2.0m** @ 8% → **\$0.16m**

Totals:

- **Total TVL ≈ \$10.0m**  
- **Total gross ARR ≈ \$1.48m**

#### Mid

- MetaDAO TVL: **\$4.0m** @ 8% → **\$0.32m**  
- Onchain B2B TVL: **\$10.0m** @ 10% → **\$1.00m**  
- Pump TVL: **~\$0.86m**; gross → **\$1.55m**  
- Card/payroll TVL: **\$5.0m** @ 8% → **\$0.40m**

Totals:

- **Total TVL ≈ \$19.9m**  
- **Total gross ARR ≈ \$3.27m**

#### High

- MetaDAO TVL: **\$6.0m** @ 8% → **\$0.48m**  
- Onchain B2B TVL: **\$20.0m** @ 10% → **\$2.00m**  
- Pump TVL: **~\$1.73m**; gross → **\$3.70m**  
- Card/payroll TVL: **\$10.0m** @ 8% → **\$0.80m**

Totals:

- **Total TVL ≈ \$37.7m**  
- **Total gross ARR ≈ \$6.98m**

---

## 7. What it takes to hit \$1m and \$10m ARR

Remember: these are **gross interest + factor + staking take** numbers. If attn captures, say, 30% of that as protocol revenue (rest to LPs), protocol ARR = 0.3 × gross.

### 7.1 Path to ≈\$1m gross ARR

Several mixes will do; here is a **minimal** one:

- MetaDAO TVL: **\$2.0m** @ 8% → **\$0.16m**  
- Onchain B2B TVL: **\$4.0m** @ 10% → **\$0.40m**  
- Pump (between “today” and “low”):  
  - use **\$0.3m** TVL (≈ \$5–7m annual advances) → **\$0.4–0.5m** gross  
- Card/payroll: **\$0m**

Total:

- TVL ≈ **\$6.3m**  
- Gross ARR ≈ **\$0.96–1.06m**

This is achievable with:

- A few dozen MetaDAO projects.
- A handful (10–20) of onchain B2B clients.
- Modest adoption on Pump (~3–5% of baseline rewards advanced).

### 7.2 Path to ≈\$10m gross ARR

We can define a **stretch** scenario:

- MetaDAO TVL: **\$8.0m** @ 8% → **\$0.64m**  
- Onchain B2B TVL: **\$40.0m** @ 10% → **\$4.00m**  
- Pump vertical: more aggressive use:
  - share of flow \( s = 25\% \) (on baseline \$150m) → \( V_{\text{adv}} = \$37.5m \),
  - factor \( f_{\text{factor}} = 12\% \),
  - idle \( B_{\text{idle}} = \$25m \),
  - average tenor still 21 days:
    - TVL\(_{\text{adv}}\) ≈ \( 37.5m \times 21/365 \approx \$2.16m \),
    - Rev\(_{\text{adv}} = 37.5m \times 12\% = \$4.50m \),
    - Rev\(_{\text{stake}} \approx 25m \times 6\% \times 8\% = \$0.12m \),
    - Pump gross ≈ **\$4.62m**.
- Card/payroll TVL: **\$20.0m** @ 8% → **\$1.60m**

Totals:

- TVL ≈ **\$70m**  
- Gross ARR ≈ **\$10.86m**

Interpretation:

- Getting to **\$10m+ gross** requires:
  - tens of millions of TVL in B2B + card/payroll lines, and
  - Pump capturing a **meaningful** share of creator rewards with high repeat usage.
- Protocol-level ARR at a 30% take rate on this gross is **\$3.25m+**.

---

## 8. Distribution – avoiding “last resort lender” status

Concern: Avici, Krak, and similar players might eventually:

- build their own revenue-backed credit and BNPL rails, and
- use attn only as “last resort” balance-sheet capital.

Ways to avoid that:

### 8.1 Be the easiest infra for **onchain revenue accounts**

- Offer **drop-in revenue modules**:
  - For MetaDAO-style projects: templates that wire protocol fees / royalties into Squads revenue safes.
  - For Pump.fun: creator reward “parking” safes that can auto-advance and auto-stake.
  - For B2B: simple contracts that route onchain invoices / subscription income into attn-compatible vaults.

If attn owns the **canonical revenue account**, others integrate **with attn’s rails**, not around them.

### 8.2 Start where they are weakest

- **Pure onchain revenue** (Pump.fun creators, small DePIN, pseudo-anon DAOs):
  - Their own credit engines will be slower and more conservative there.
  - attn can move first and become the default for **weird / long-tail onchain income**.
- **Very short-term cash advances**:
  - 7–30 day factors on Pump, tied directly to creator rewards.
  - Easy to understand, fast to repay; acts as a wedge.

### 8.3 Offer wholesale credit capacity they can’t match early

- Provide **revenue-backed lines** to Avici / Krak-style entities:
  - They can offer consumer BNPL and card credit against **attn-funded wholesale facilities** while their own balance sheet and capital partners are immature.
- Over time:
  - They may add their own balance-sheet lenders,
  - but attn can remain a significant, specialist **revenue-based tranche** inside their capital stack.

### 8.4 Keep risk analytics and data as your moat

- If revenue accounts and advances are on attn rails:
  - attn has live, granular data on:
    - revenue volatility,  
    - seasonality,  
    - default/recovery stats.
- This lets you:
  - price better,
  - set better limits,
  - and structure **tranches** (first-loss / mezz / senior) attractive to external credit investors.

That data advantage is hard for latecomers to replicate.

---

## 9. Service / pricing map by persona

High-level map of what attn offers, pricing bands, and potential fee streams by vertical:

| Persona / vertical            | Main attn product(s)                                             | Borrower pricing (headline)                     | Main fee streams to attn (gross)                                  |
|------------------------------|-------------------------------------------------------------------|-------------------------------------------------|-------------------------------------------------------------------|
| MetaDAO project              | Treasury + revenue-backed RCA/RRCL lines                         | 6–10% APR (use 8% in model)                     | Interest margin on lines; small facility / origination fees       |
| Onchain B2B (RPC, infra, wallets) | Revenue-backed lines against onchain invoices / fees         | 8–12% APR (use 10% in model)                    | Interest margin; origination/renewal fees                         |
| Pump.fun creator (pure)     | 7–30d cash advances vs upcoming rewards + light auto-staking     | Flat 5–15% factor (7–12% in scenarios)          | Factor income; small yield take on truly idle balances            |
| Pump-launched “real” project| 30–90d short RCAs vs creator rewards + early fees                | Flat 5–12% factor (short)                       | Factor income; optional revenue-backed lines later                |
| Card/payroll partner (Avici/Krak-type) | Wholesale revenue-backed credit lines + BNPL/merchant-program support | ~8% APR wholesale                               | Interest margin; programme fees                                   |
| LPs (attnUSD, specialised vaults) | attnUSD (core) + specialised vertical vaults (e.g. Pump)    | Target 5–10% net yield depending on mix         | Protocol cut of interest/fees; possible performance / mgmt fees   |

Each of these maps cleanly into the scenario TVLs above.

---

## 10. Summary

- With **very conservative idle-balance assumptions** for Pump.fun and short average tenors (~21 days), Pump can still deliver **\$0.2–3.7m** gross ARR at modest market-share levels on a **\$150m baseline** creator rewards flow.
- MetaDAO + onchain B2B + card/payroll lines can reasonably support **\$10–40m** TVL with **6–10%** borrower APRs, yielding **\$1–4m** gross ARR.
- Combining these:
  - **\$1m gross ARR** is reachable with roughly **\$6–10m** TVL across MetaDAO, early B2B, and moderate Pump usage.
  - **\$10m+ gross ARR** requires **\$50–70m** TVL across:
    - \$8m MetaDAO lines,  
    - \$40m+ B2B lines,  
    - \$2m Pump TVL from very fast-turnover advances,  
    - \$20m wholesale card/payroll lines.
- Protocol-level ARR (fees to attn itself) is a fraction of this gross (e.g. 20–40% depending on how much you pay to LPs vs. keep).

The key constraint is **distribution**, not just modelling:

- Start where you can be the **canonical revenue account and credit engine** (MetaDAO, Pump.fun, niche onchain B2B).
- Then extend into wholesale lines for Avici/Krak-type partners once you have differentiated **onchain revenue risk data** and proven short-tenor products.

