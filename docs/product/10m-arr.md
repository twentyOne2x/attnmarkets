# attn.markets – TVL & ARR Planning
## 0. Definitions and fee split

We will use:

- **TVL / credit outstanding** = average deployed credit (advances + drawn lines).
- **Gross fee revenue** = total fees and interest charged to borrowers per year.
- **Protocol net** = share of gross fees that accrues to attn (DAO / company), after LP yield.

Working assumption:

- LPs receive **70%** of gross fees as yield.
- attn keeps **30%** as protocol revenue (management + performance + origination, blended).

So:

\[
\text{Protocol Net ARR} = 0.3 \times \text{Gross Fee ARR}
\]

You can always adjust 30% → 20% or 40% later; numbers scale linearly.

---

## 1. Verticals overview

We keep four main verticals:

1. **MetaDAO / launchpad treasury-backed credit**  
   - Credit lines / advances against governed treasuries (Squads) with tight burn + runway rules.

2. **pump.fun creator advances (short-tenor, high factor rates)**  
   - Cash advances against near-term creator rewards on pump.fun.
   - Tenors 7–30 days, factor rates 5–15% flat per advance.

3. **Onchain B2B services (RPC, infra, wallets, tooling)**  
   - Revenue-backed working-capital lines for infra and SaaS-like projects that bill in crypto.

4. **Card / payroll / retail BNPL (Avici, Krak, etc.)**  
   - Entity-level revenue lines and BNPL facilities behind consumer-facing card and payroll rails.
   - Includes “watch BNPL” and similar high-ticket retail, but **assume 0 “today-ish”**.

For this revision:

- “Today-ish” = **MetaDAO + pump.fun only**  
  (B2B and card/payroll/retail BNPL = 0 TVL for now).

---

## 2. Pricing bands

High-level:

- **MetaDAO / treasury credit**  
  - Effective APR to borrowers: **10–14%** (blended; short–medium tenors).
  - Mix of advances and lines.

- **pump.fun creator advances**  
  - Tenor: **7–30 days**, mostly **14 days**.  
  - Factor rates: **5–15% flat** per advance (0.05–0.15 on principal).  
  - On a 14-day advance, 10% flat ≈ ~260% annualised, but tenor is very short and volumes are lumpy.

- **Onchain B2B working capital**  
  - Effective APR: **12–18%** on drawn balances (lower than pump, higher than MetaDAO; riskier but recurring).

- **Card/payroll & retail BNPL**  
  - Entity-level APR on outstanding: **10–16%**, depending on mix of customer types and loss rates.

In all cases, **LPs see most of that as yield**; attn takes a 30% slice.

---

## 3. Vertical 1 – MetaDAO treasury-backed facilities

Assumptions:

- MetaDAO launches ~100 projects that matter over time with:
  - Treasury per project: **$0.5m–$2m**, average **$1m**.
  - Burn ≈ **$60k/month**, runway ≈ **12 months** typical.
- You can safely allow a **haircut × LTV ≈ 0.2** on that treasury for credit lines, subject to burn/runway tests.

Per project:

- Average treasury: **$1m**.
- Safe line capacity:  
  \[
  \text{Line Cap} \approx 0.2 \times 1\text{m} = \$200k
  \]

But you only want **part of that drawn on average** (say 40–50%):

- Average drawn per project: **$80k–$100k**.

We keep the prior “order-of-magnitude” TVL and gross fee estimates:

### 3.1 MetaDAO TVL and fees

Assume:

- Effective borrower APR on drawn balances: **~12%**.
- All numbers below are **gross borrower fees**; protocol net = ×0.3.

| Scenario | # projects | Avg drawn / project | TVL (drawn) | Gross fee ARR @12% | Protocol net ARR @30% share |
|----------|------------|---------------------|-------------|---------------------|-----------------------------|
| Today-ish | 10        | $100k              | **$1.0m**   | **$0.08m**          | **$0.024m**                 |
| Low      | 20         | $125k              | **$2.5m**   | **$0.20m**          | **$0.06m**                  |
| Mid      | 25         | $160k              | **$4.0m**   | **$0.32m**          | **$0.096m**                 |
| High     | 30         | $200k              | **$6.0m**   | **$0.48m**          | **$0.144m**                 |

MetaDAO is **capital-efficient but small**; it is more of a **flagship / reference vertical** than the main ARR driver.

---

## 4. Vertical 2 – pump.fun creator advances (short tenor)

We treat pump as a separate, high-velocity vertical.

### 4.1 Volume and share assumptions

- Creator rewards: **up to $300m/year** ([earnings.wtf](https://earnings.wtf)).  
- Use a conservative **baseline** of **$150m/year** as “addressable” in the near term.

We then assume:

- **Baseline scenario**: attn finances **10%** of annual creator rewards via short-term advances:
  - Total advance volume per year: **$15m**.
- **Mid scenario**: **20%** capture → **$30m** advance volume.
- **High scenario**: **40%** capture → **$60m** advance volume.

Tenors and pricing:

- Tenor: **14 days** typical (7–30 days range).
- Factor rate: **10% flat** in the middle of 5–15% band for modelling.

So for a single advance:

- Principal: \( A \)  
- Repayment after 14 days: \( A \times (1 + 0.10) = 1.10A \)  
- Gross fee: \( 0.10A \)

### 4.2 Average outstanding TVL from short advances

If annual advance volume is \( V_{\text{year}} \) and tenor is \( T = 14/365 \) years, then:

\[
\text{Average Outstanding} \approx V_{\text{year}} \times \frac{T}{1\ \text{year}}.
\]

Baselines:

- Baseline volume: \( V_{\text{year}} = \$15m \)  
  → TVL ≈ \( 15m \times \frac{14}{365} \approx \$0.58m \).

However, to stay conservative (slippage, seasonality, partial ramp-up), we stick close to the **more pessimistic TVL**:

- Today-ish: use **$0.17m**.
- Low: **$0.43m**.
- Mid: **$0.86m**.
- High: **$1.73m**.

This implicitly assumes we **do not fully reach** the 10–40% volume capture immediately.

### 4.3 Gross and net ARR from pump.fun advances

We reuse the previously aggregated result for gross fee ARR (consistent with these TVL and factor assumptions):

| Scenario | Annual advance volume (approx) | Avg TVL (drawn) | Gross fee ARR | Protocol net ARR @30% |
|----------|--------------------------------|------------------|---------------|------------------------|
| Today-ish | ~$5m–7m                       | **$0.17m**       | **$0.22m**    | **$0.066m**            |
| Low      | ~$15m                          | **$0.43m**       | **$0.62m**    | **$0.186m**            |
| Mid      | ~$30m                          | **$0.86m**       | **$1.55m**    | **$0.465m**            |
| High     | ~$60m                          | **$1.73m**       | **$3.70m**    | **$1.11m**             |

Notes:

- **Today-ish** is intentionally undercooked until you actually ship this integration and see take-up.
- pump.fun is clearly your **highest-velocity, short-tenor yield vertical** once integrated and productised.

Idle-balance yield on creator rewards is **ignored here** (assume most rewards are spent quickly; any revenue from staking idle balances is a small bonus, not the core).

---

## 5. Vertical 3 – Onchain B2B (RPC, infra, wallets, SaaS)

Assumptions **“today-ish” = 0**:

- Target: infra / SaaS projects who already bill onchain or can expose revenue accounts.
- Effective APR: **15–18%** on drawn balances.
- Average line utilisation: **50–70%**.

We keep the prior TVL + gross fee ranges for planning; just set **today-ish TVL = 0** (not live):

| Scenario | TVL (drawn) | Gross fee ARR (@~15–18%) | Protocol net ARR @30% |
|----------|-------------|---------------------------|------------------------|
| Today-ish | **$0**     | **$0**                    | **$0**                 |
| Low      | **$5.0m**   | **$0.50m**                | **$0.15m**             |
| Mid      | **$10.0m**  | **$1.00m**                | **$0.30m**             |
| High     | **$20.0m**  | **$2.00m**                | **$0.60m**             |

This vertical is where **real TVL** can accumulate if you can systematically plug into infra / wallets.

---

## 6. Vertical 4 – Card / payroll / retail BNPL (incl. watches)  

High-level only; **assume today-ish = 0**.

This covers:

- Entity-level revenue lines behind:
  - payroll flows (e.g. Avici “smart payroll wallets”),
  - card receivables and interchange,
  - specific retail BNPL for high-ticket items like watches.

For this doc we stay aggregate and conservative:

- Effective APR on entity-level BNPL receivables: **10–16%**.
- Mix of short-tenor and medium-tenor receivables.
- TVL scenarios:

| Scenario | TVL (drawn) | Gross fee ARR (@~8–12%) | Protocol net ARR @30% |
|----------|-------------|--------------------------|------------------------|
| Today-ish | **$0**     | **$0**                   | **$0**                 |
| Low      | **$2.0m**   | **$0.16m**               | **$0.048m**            |
| Mid      | **$5.0m**   | **$0.40m**               | **$0.12m**             |
| High     | **$10.0m**  | **$0.80m**               | **$0.24m**             |

In practice, this vertical will be a **later GTM** once you:

- Ship strong core credit infra (MetaDAO + pump + maybe B2B).
- Have clear answers on consumer-risk sharing (as per your separate BNPL doc).

---

## 7. Portfolio view – TVL and ARR (gross vs net)

Here we aggregate all four verticals.

### 7.1 Scenario summary (with pump as #2, B2B/card = 0 “today-ish”)

Assumptions:

- “Today-ish”:  
  - MetaDAO: “Today-ish” line.  
  - pump.fun: “Today-ish” line.  
  - B2B: 0.  
  - Card/payroll/retail BNPL: 0.

- “Low / Mid / High”: all four verticals using the corresponding lines.

#### 7.1.1 By vertical (protocol net ARR, for reference)

All numbers in **$m per year**, protocol share at 30%:

- **MetaDAO (treasury-backed)**  
  - Today-ish: **$0.024m**  
  - Low: **$0.06m**  
  - Mid: **$0.096m**  
  - High: **$0.144m**

- **pump.fun (creator advances)**  
  - Today-ish: **$0.066m**  
  - Low: **$0.186m**  
  - Mid: **$0.465m**  
  - High: **$1.11m**

- **Onchain B2B**  
  - Today-ish: **$0**  
  - Low: **$0.15m**  
  - Mid: **$0.30m**  
  - High: **$0.60m**

- **Card/payroll/retail BNPL**  
  - Today-ish: **$0**  
  - Low: **$0.048m**  
  - Mid: **$0.12m**  
  - High: **$0.24m**

#### 7.1.2 Total TVL and ARR (gross vs protocol net)

| Scenario  | Total TVL (drawn) | Gross fee ARR (all borrowers) | Protocol net ARR (30% of gross) |
|-----------|-------------------|-------------------------------|----------------------------------|
| Today-ish | **$1.17m**        | **$0.30m**                    | **$0.09m**                       |
| Low       | **$9.93m**        | **$1.48m**                    | **$0.44m**                       |
| Mid       | **$19.86m**       | **$3.27m**                    | **$0.98m**                       |
| High      | **$37.73m**       | **$6.98m**                    | **$2.09m**                       |

So:

- A **mid case** across verticals gives you **~\$3.27m gross** and **~\$1.0m protocol net** on **~$20m TVL**.
- A “high” case gets you ~**\$2.1m net** on ~**\$38m TVL**.

---

## 8. Path to \$1m and $10m protocol ARR

### 8.1 Target: $1m/year protocol revenue

Under the 30% protocol share assumption:

- Required **gross fee ARR** ≈ \( \frac{1.0}{0.3} \approx \$3.3m \).

This aligns almost exactly with the **Mid** aggregate scenario above:

- TVL ≈ **$19.86m**  
- Gross fee ARR ≈ **$3.27m**  
- Protocol net ARR ≈ **$0.98m**

One realistic composition:

- MetaDAO: **\$4m** drawn, **\$0.096m** net.  
- pump.fun: **\$0.86m** drawn, **\$0.465m** net.  
- B2B: **\$10m** drawn, **\$0.30m** net.  
- Card/payroll/BNPL: **\$5m** drawn, **\$0.12m** net.

The contribution to **$1m net** is then:

- MetaDAO ~10%  
- pump.fun ~47%  
- B2B ~31%  
- Card/payroll/BNPL ~12%

Implication: pump.fun + B2B are the **workhorses**; MetaDAO and card/payroll add signal, strategic depth, and incremental ARR.

### 8.2 Target: $10m/year protocol revenue

Under the same 30% share:

- Required **gross fee ARR** ≈ \( \frac{10}{0.3} \approx \$33.3m \).

If blended effective borrower yield across all verticals is \( y \) on TVL, then:

\[
\text{TVL needed} \approx \frac{33.3}{y}
\]

Roughly, with a blended \( y \approx 15\% \) (mix of 10–16% APR and short-tenor factor rates):

- TVL needed ≈ \( \frac{33.3}{0.15} \approx \$222m \) average drawn.

One plausible “far future” composition (not a near-term target):

- MetaDAO / launchpads: **\$15m–$20m** drawn.  
- pump.fun + similar creator platforms: **\$40m–$60m** drawn (high-velocity short-tenor).  
- Onchain B2B: **\$80m–$100m** drawn.  
- Card/payroll/retail BNPL: **\$60m–$80m** drawn.

Such a book looks more like an **onchain private-credit fund** than a small boutique protocol. It requires:

- Deep integrations,
- Strong default history and risk controls,
- Probably multiple vaults / strategies and external risk curators.

The key takeaway: **\$1m protocol ARR** is reachable with ≈ **$20m TVL** if your pricing holds and execution is good; **\$10m** requires a few hundred million TVL and a broader GTM (beyond Solana-only and beyond the first few partners).

---

## 9. Distribution and “not being last-resort lender”

Your concern: Avici, Krak, Slash, etc. could build similar infra and treat attn as “last-resort lender”.

Positioning to avoid that:

1. **attn as revenue-account infra + credit engine, not a monolithic lender**

   - Own the **revenue account standard** (Squads-based, protocol-first).
   - Provide:
     - Revenue routing,
     - Stress-tested limit sizing,
     - PT/YT plumbing via Exponent.

   Other apps (Avici, Krak, etc.) can:

   - Embed attn via API or program calls to size entity-level lines against their users’ revenues.
   - Still run their own balance sheets for certain flows, but lean on attn when:
     - They want **off-balance-sheet capacity**.
     - They don’t want to build full credit and risk infra.

2. **Vertical-specific GTM wedges**

   - **MetaDAO**: be the **canonical revenue and treasury credit partner** for the ecosystem. Everyone else integrates _behind_ MetaDAO anyway.
   - **pump.fun**: become the **default “advance on your creator rewards” infra**, with deep product integration (flow built directly into the creator UX).
   - **Onchain B2B**: prioritise infra where **your credit improves their own UX** (e.g. RPC providers smoothing billing and costs, wallets subsidising users).
   - **Card/payroll/BNPL**: start with entity-level lines and **co-designed products** where partner sees you as infrastructure, not a competing neobank.

3. **LP capital as a moat**

   - If attn aggregates meaningful LP capital into attnUSD and related vaults:
     - You become an **easy plug-in liquidity and credit source** for many front-ends.
     - Even if Avici/Krak build some credit infra, they may still:
       - syndicate risk into attn,
       - or use attn as a second-line provider.

If you position as **“revenue-native credit infra that others can lean on”**, you are more likely to become the **shared backend** instead of the last-resort.

---

## 10. Service / pricing / revenue summary table

Below is a simplified table of **services**, **target clients**, **pricing bands**, and **ARR contribution** in the Mid scenario (approx, annual, $m):

| Service / vertical                           | Client persona                            | Product & pricing (to borrower)                                     | Gross ARR (Mid) | Protocol net ARR (Mid, 30%) |
|----------------------------------------------|-------------------------------------------|---------------------------------------------------------------------|------------------|------------------------------|
| MetaDAO treasury-backed credit               | MetaDAO projects / launchpad DAOs         | Lines / advances @ ~10–14% APR on drawn treasury-backed credit     | **$0.32m**       | **$0.096m**                  |
| pump.fun creator cash advances               | pump.fun creators (protocols, memecoins)  | 7–30d advances @ flat 5–15% (modelled ~10% at 14d average)         | **$1.55m**       | **$0.465m**                  |
| Onchain B2B working-capital lines            | RPC, infra, wallets, SaaS-like services   | 30–90d lines @ ~15–18% APR on drawn balances                       | **$1.00m**       | **$0.30m**                   |
| Card/payroll/retail BNPL (incl. watches)     | Cards, payroll apps, watch retailers etc. | Entity-level BNPL & lines @ ~10–16% APR (mixed short/med tenors)   | **$0.40m**       | **$0.12m**                   |
| **Total (Mid)**                              |                                           |                                                                     | **$3.27m**       | **$0.98m**                   |

And for **today-ish** (MetaDAO + pump only):

| Service / vertical                           | Gross ARR (Today-ish) | Protocol net ARR (Today-ish) |
|----------------------------------------------|------------------------|-------------------------------|
| MetaDAO treasury-backed credit               | **$0.08m**             | **$0.024m**                   |
| pump.fun creator cash advances               | **$0.22m**             | **$0.066m**                   |
| Onchain B2B working-capital lines            | **$0**                 | **$0**                        |
| Card/payroll/retail BNPL (incl. watches)     | **$0**                 | **$0**                        |
| **Total (Today-ish)**                        | **$0.30m**             | **$0.09m**                    |

This makes explicit:

- What each vertical could contribute at scale.
- How the **1m+ protocol ARR** target maps to roughly **Mid** scaling across them, with pump.fun and B2B doing most of the heavy lifting.

