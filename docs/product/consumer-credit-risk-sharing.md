# attn.markets – Luxury Watch BNPL Pilot (3-month, tickets up to ~$1m)

Exploratory note on using attn as a **wholesale BNPL rail for high-end watches** (Patek, Rolex, Richard Mille) with **3-month tenors** and **tickets up to ≈$1m**.

Focus:

- Retailers sell watches to end customers with BNPL at checkout.
- Retailers decide how much **consumer credit risk** they keep vs pass to attn/partners.
- attn only ever has **B2B exposure** to the retailer (and/or structured pools), not to individual shoppers.

---

## 1. Why start with watches (Patek, Rolex, RM) and 3-month BNPL

Luxury watches are a good pilot vertical:

- High but discrete ticket sizes (from ~\$10k to mid-/high-six figures; occasional ≈\$1m pieces).
- Deep secondary markets, reference prices, and time-series data:
  - [WatchCharts](https://watchcharts.com/) – model-level “market value” + charts.
  - [Chrono24](https://www.chrono24.com/) – large global listing marketplace with price charts per reference.
  - [Bob’s Watches](https://www.bobswatches.com/) – curated Rolex/Patek data and market reports.

We want:

- Short, easily modelled **3-month BNPL** (not 12-month+), to keep:
  - duration risk low,
  - default and fraud detection windows tight,
  - capital turnover high.

Ticket goal:

- Typical watch BNPL up to ~\$250k–\$400k (Sub / Nautilus / RM sample range).
- Support edge cases up to ≈\$1m (rare RMs, very high-end pieces).

---

## 2. Price anchors – Patek 5711, Rolex Submariner, Richard Mille

We pick concrete, recognisable references as **anchors**, using current secondary-market data from watch-analytics and dealer sites. Prices below are approximate late-2025 secondary ranges, not AD retail, and meant only as **modelling levels**.

### 2.1 Patek Philippe – Nautilus 5711/1A

- Reference: **Patek Philippe Nautilus 5711/1A-010** (steel, blue dial).
- Original retail (when in production): ≈\$34,890.  
  Source: [WatchCharts](https://watchcharts.com/watch/patek-philippe/5711-1a-010).
- Current secondary “market value” and listing ranges:
  - WatchCharts “estimated market value” for 5711/1A sits around **\$100k+**.  
    [WatchCharts 5711 index](https://watchcharts.com/).
  - Large dealers (e.g. Bob’s Watches) and Chrono24 show many standard blue-dial 5711/1A pieces asking roughly **\$90,000–\$140,000** depending on year, condition, and set (box/papers).  
    [Bob’s 5711 guide](https://www.bobswatches.com/), [Chrono24 5711 listings](https://www.chrono24.com/patekphilippe/ref-5711-1a-010.htm).

**Working modelling anchor**:

- Treat a “typical” 5711/1A as **\$100k–\$120k** ticket.
- For examples, use **\$100k** as a clean round figure.

### 2.2 Rolex – Submariner (modern steel)

- Iconic line: **Rolex Submariner**, especially modern steel ceramic-bezel refs:
  - No-date: 124060.
  - Date: 126610LN (black).
- Secondary-market data:
  - Chrono24 and WatchCharts show modern steel Submariners commonly in the **\$10,000–\$15,000** pre-owned range, depending on reference, year, and condition.  
    [Chrono24 Submariner overview](https://www.chrono24.com/rolex/submariner--mod11.htm), [WatchCharts Submariner index](https://watchcharts.com/watch/rolex/submariner).
  - Bob’s market tables for current steel Submariner refs place many pieces around **\$11,000–\$18,000**.  
    [Bob’s Submariner price guide](https://www.bobswatches.com/rolex-submariner-prices).
  - Aggregated data across Submariner refs suggest an **average market price ≈\$14,000**.  
    [WatchCharts Rolex index](https://watchcharts.com/market-reports/rolex-watch-index).

**Working modelling anchor**:

- “Standard steel Sub” as **\$12k–\$15k** ticket.
- For examples, use **\$15k** as round number.

### 2.3 Richard Mille – RM 011 / RM 11-03 / RM 35-02

Richard Mille has many limited references; we use the “iconic” chronograph / sports cluster as modelling anchors:

- RM 011 “Felipe Massa” flyback chronograph (various titanium/rose-gold variants).
- RM 11-03 (updated chronograph line).
- RM 35-02 “Rafa” in Quartz TPT (e.g. red).

Indicative secondary-market levels:

- Brand-wide average on WatchCharts is roughly **\$268k per RM**.  
  [WatchCharts brand page](https://watchcharts.com/brand/richard-mille).
- RM 011:
  - Chrono24 shows many RM 011 pieces listed from **\$150k+** up to **\$300k–\$600k+** for rarer editions.  
    [Chrono24 RM 011 listings](https://www.chrono24.com/richardmille/rm-011--mod1340.htm).
  - Titanium “Felipe Massa” style pieces often transact around **\$200k–\$230k**.  
    [EveryWatch RM 011 data](https://everywatch.com/).
- RM 11-03:
  - Chrono24 shows titanium and gold RM 11-03 variants in the **\$300k–\$450k** band, with some above.  
    [Chrono24 RM 11-03 overview](https://www.chrono24.com/richardmille/rm-11-03--mod1517.htm).
- RM 35-02 “Rafa” (red Quartz TPT):
  - Chrono24 and dealers list these broadly in the **\$260k–\$350k** region, with some listings higher.  
    [Chrono24 RM 35-02](https://www.chrono24.com/richardmille/rm-35-02--mod1476.htm), [K2 Luxury RM35-02](https://k2luxury.com/).

**Working modelling anchors**:

- Entry / mid-tier RM for BNPL pilot: **\$250k–\$350k**.
- For examples, use **\$300k** as a representative RM ticket.
- Edge cases: seven-figure pieces exist; platform should allow **up to ≈\$1m** per BNPL purchase, subject to risk caps.

---

## 3. Roles and exposures

- **Retailer (watch shop)**:
  - Sells watches, offers BNPL at checkout.
  - Can:
    - hold **all**, **some**, or **none** of the **consumer default risk**;
    - always gets paid in full upfront in case 2/3 (via attn).

- **attn.markets**:
  - Provides **B2B credit line** / facility to retailer and/or special-purpose vehicles (SPVs).
  - May assume **consumer credit risk** (partially or completely) via structured arrangements.
  - Never has direct contractual exposure to consumers; only to:
    - retailers, and
    - structured pools (SPVs, vaults).

- **External investors / insurers** (optional):
  - May take:
    - senior credit tranches backed by pools of BNPL receivables, or
    - insurance-style exposure (credit insurance).

---

## 4. Baseline: retailer holds 100% consumer risk, attn only funds B2B

### 4.1 Setup

- Retailer offers 3-month BNPL to customers.
- Retailer bears all **consumer default / fraud** risk.
- attn provides only **B2B funding** to smooth cashflow.

Mechanics per BNPL sale (watch price \(P\)):

1. Customer chooses 3-month BNPL with retailer.
2. Retailer books a **receivable** from consumer for \(P\) (plus any BNPL fee).
3. Retailer can optionally draw from an attn **revolving revenue line** to:
   - cover working capital while instalments are collected.
4. attn’s risk:
   - purely on the **retailer** (business revenues, performance),
   - not on any particular consumer.

This is a “minimal integration” option: no change to attn risk stack, easy to ship.

---

## 5. Shared risk: retailer + attn share consumer default risk

Goal: allow retailer to **offload part of the consumer risk**, but keep strong alignment.

### 5.1 Notation

For a given BNPL **pool** (e.g. all watch BNPL contracts originated in a month):

- \(i\): index over individual consumer BNPL contracts in the pool.
- \(P_i\): price of watch \(i\) (e.g. \$100k 5711, \$15k Sub).
- **EAD – Exposure At Default** for contract \(i\):  
  \(EAD_i\): remaining principal if consumer fully defaults.
- **PD – Probability of Default** for contract \(i\):  
  \(PD_i\): modelled probability that contract \(i\) defaults over 3 months.
- **LGD – Loss Given Default** for contract \(i\):  
  \(LGD_i\): fraction of exposure lost if default occurs (after repossession/recovery of the watch).
- **Total financed BNPL notional** for the pool:  
  \[
  N = \sum_i EAD_i
  \]
- **Expected loss** on the pool:  
  \[
  EL = \sum_i PD_i \cdot LGD_i \cdot EAD_i
  \]
- **Loss random variable**:  
  \(L\) denotes the realised loss on the pool (unknown ex-ante; we model its distribution).

### 5.2 Three-tranche structure

We can structure risk as three layers on \(N\):

1. **First-loss tranche – Retailer**

   - Size:
     \[
     F = \alpha_{\text{FL}} \cdot N
     \]
     where \(\alpha_{\text{FL}}\) is the **first-loss share**, e.g. 5–10%.
   - Retailer absorbs any realised loss \(L\) up to \(F\).
   - Economics:
     - Retailer gets higher BNPL margin (fee share) to compensate for first-loss.
     - Ensures retailer has strong incentive to:
       - vet customers,
       - avoid fraudulent sales,
       - discourage obvious non-payers.

2. **Mezzanine tranche – attn**

   - Size:
     \[
     M = \alpha_{\text{MEZ}} \cdot N
     \]
     where \(\alpha_{\text{MEZ}}\) might be, for example, 10–20%.
   - attn absorbs losses in the band:
     \[
     \max(0, L - F) \quad \text{up to} \quad M
     \]
   - Economics:
     - This tranche is higher risk than senior, lower than pure first-loss.
     - It lives in a **specialised “watch BNPL vault”**, not in attnUSD core.
     - Priced to deliver a high IRR consistent with expected losses and tail risk.

3. **Senior tranche – external investors / insurers (optional)**

   - Size:
     \[
     S = N - F - M
     \]
   - Senior absorbs only losses above \(F + M\), which under conservative assumptions should be rare.
   - Can be:
     - sold to yield-seeking credit funds,
     - protected by external **credit insurance**,
     - kept on attn’s balance sheet in small amounts for alignment.

Tranche waterfall for realised loss \(L\):

1. Retailer:  
   \(\text{Loss}_{\text{retailer}} = \min(L, F)\).
2. attn (mezz):  
   \(\text{Loss}_{\text{attn}} = \min\big(\max(L - F, 0), M\big)\).
3. Senior:  
   \(\text{Loss}_{\text{senior}} = \max(L - F - M, 0)\).

### 5.3 How much risk each party holds

- Retailer first-loss **percentage of pool**: \(\alpha_{\text{FL}}\).
- attn mezzanine **percentage of pool**: \(\alpha_{\text{MEZ}}\).
- Senior investors (or insured layer) **percentage of pool**: \(1 - \alpha_{\text{FL}} - \alpha_{\text{MEZ}}\).

In cash terms:

- Retailer maximum loss = \(F = \alpha_{\text{FL}} \cdot N\).
- attn maximum loss = \(M = \alpha_{\text{MEZ}} \cdot N\).
- Senior maximum loss (before catastrophic tail) = \(S = N - F - M\).

We choose \(\alpha_{\text{FL}}, \alpha_{\text{MEZ}}\) so that:

- Retailer always has **non-trivial skin in the game** (e.g. minimum 5% first-loss).
- attn’s mezz risk is **diversified across retailers** and sized within attn’s risk budget.
- Senior layer is **very safe**, attractive for conservative credit LPs or insurers.

---

## 6. Case 3: attn (and partners) take 100% consumer risk

In some scenarios, retailers may want **zero consumer risk**.

### 6.1 Structure

- Retailer sells watch at price \(P\).
- At checkout, BNPL contract is originated into an SPV / pool.
- SPV pays retailer **100% of \(P\)** immediately (less BNPL/discount fee).
- attn and/or external credit investors **own 100% of the receivable** (consumer risk).

Risk profile:

- Retailer:
  - Consumer default/fraud risk: **0%**.
  - Counterparty risk: only on SPV/attn paying out as promised.
- attn:
  - Holds either:
    - full tranche stack (first-loss + mezz + senior), or
    - some part plus external investors.
- To avoid **misaligned incentives**, retailer must:
  - retain some risk **indirectly** (see Section 8),
  - or face strong contractual and reputational penalties for bad origination.

This is essentially **buy-now-pay-later factoring** of consumer receivables.

---

## 7. Numerical examples (3-month BNPL)

Assume:

- Tenor: **3 months**.
- No interest charged to customer (0% BNPL) – retailer pays discount/fee.
- Assume negligible recovery (conservative), so LGD ≈ 100% if default, after fees.

### 7.1 Example A – Rolex Submariner (~\$15k)

- Watch: modern steel Rolex Submariner (e.g. 126610LN).
- Ticket: \(P = \$15{,}000\).
- 3-month BNPL, 3 equal instalments of \$5k.

#### Case A1 – Retailer holds 100% risk

- Retailer’s consumer exposure: full \$15k.
- attn’s exposure:
  - Optionally a **B2B line** to the retailer:
    - If retailer draws \$15k from attn immediately, attn is exposed to **retailer business risk**, not to the consumer.
- If consumer defaults:
  - Retailer eats loss (less any recovery), still owes attn per B2B terms.

#### Case A2 – Shared risk (retailer + attn + senior)

Define pool of many similar BNPL Subs; pick tranche shares:

- First-loss share: \(\alpha_{\text{FL}} = 10\%\).
- Mezz share: \(\alpha_{\text{MEZ}} = 15\%\).
- Senior share: \(75\%\).

For a single watch approximated as pool of one (for intuition):

- First-loss \(F = 10\% \cdot 15,000 = \$1,500\).
- Mezz \(M = 15\% \cdot 15,000 = \$2,250\).
- Senior \(S = 75\% \cdot 15,000 = \$11,250\).

If the consumer fully defaults (no recovery):

- Loss \(L = \$15{,}000\).
- Retailer loss: \(\min(15,000, 1,500) = \$1,500\).
- attn mezz loss: \(\min(\max(15,000 - 1,500, 0), 2,250) = 2,250\).
- Senior loss: \(15,000 - 1,500 - 2,250 = \$11,250\).

In practice, we would rarely let senior take this much risk on a **single** exposure; real pools would have many contracts and loss rates well below 100%. But the example shows:

- Retailer holds **10% first-loss**.
- attn holds **15% mezz**.
- Senior/insured layer holds **75%**.

#### Case A3 – attn (and partners) take 100% risk

- Retailer sells the Submariner and receives \$15k (minus BNPL discount).
- SPV holds full consumer receivable; all risk is with:
  - attn (if we own entire stack), or
  - attn + external investors (if we tranche and place senior).

Retailer’s consumer loss exposure: **0%**.

### 7.2 Example B – Patek Nautilus 5711 (~\$100k)

- Watch: Patek Philippe Nautilus 5711/1A-010.
- Ticket: \(P = \$100{,}000\) (modelling a mid-range current secondary value).
- 3-month BNPL, 3 equal instalments of ~\$33,333.

#### Case B1 – Retailer holds 100% risk

- Retailer consumer exposure: \$100k.
- attn may provide a **short-tenor B2B advance** (e.g. 60–90 days) if retailer wants upfront liquidity.

#### Case B2 – Shared risk

Let tranche shares for the **watch BNPL pool** be:

- \(\alpha_{\text{FL}} = 10\%\) (retailer).
- \(\alpha_{\text{MEZ}} = 20\%\) (attn).
- Senior: 70%.

For one 5711-equivalent exposure:

- \(F = 10\% \cdot 100{,}000 = \$10{,}000\).
- \(M = 20\% \cdot 100{,}000 = \$20{,}000\).
- \(S = 70\% \cdot 100{,}000 = \$70{,}000\).

Loss outcomes:

- If consumer fully defaults (no recovery):
  - Retailer loss: \$10k.
  - attn loss: \$20k.
  - Senior loss: \$70k.
- If only 10% of this exposure (equivalently 10% of a large pool) defaults:
  - Expected loss pool-wide ≈\$10k,
  - Entirely absorbed by retailer first-loss.

#### Case B3 – attn (and partners) take 100% risk

- Retailer receives \$100k upfront.
- SPV/attn holds full consumer receivable.
- Retailer consumer credit risk: 0%.

### 7.3 Example C – Richard Mille (~\$300k) and high-ticket up to \$1m

- Watch: Richard Mille RM 011 / RM 11-03 / RM 35-02 style piece.
- Ticket: \(P = \$300{,}000\) (modelling a mid-range RM).  
  Platform supports tickets up to **\$1,000,000** with stricter caps and bespoke approval.

#### Case C1 – Retailer holds 100% risk

- Retailer exposure: full \$300k (or up to \$1m for a very high-end piece).
- attn only provides B2B credit to the retailer if desired.

#### Case C2 – Shared risk (example for \$300k ticket)

Suppose pool of RMs with tranche structure:

- \(\alpha_{\text{FL}} = 10\%\) retailer,
- \(\alpha_{\text{MEZ}} = 25\%\) attn,
- Senior: 65%.

For one \$300k BNPL contract:

- \(F = 0.10 \cdot 300{,}000 = \$30{,}000\).
- \(M = 0.25 \cdot 300{,}000 = \$75{,}000\).
- \(S = 0.65 \cdot 300{,}000 = \$195{,}000\).

If consumer fully defaults:

- Retailer loss: \$30k (10% of ticket).
- attn loss: \$75k (25%).
- Senior loss: \$195k (65%).

For pool-level modelling, we choose \(\alpha_{\text{FL}}, \alpha_{\text{MEZ}}\) so that:

- Typical loss rates (\(EL/N\)) are safely inside retailer + attn tranches.
- Senior tranche sees a very small probability of loss.

#### Case C3 – attn (and partners) take 100% risk, ticket up to \$1m

For a very high-end RM or similar piece at **\$1,000,000**:

- Retailer sells the watch with 3-month BNPL.
- SPV/attn pays retailer \$1m upfront (less discount).
- Full consumer risk sits in the SPV structure.
- Risk is distributed via tranches (F/M/S) and potentially hedged (see Section 9).

---

## 8. Guardrails against retailer “dumping bad customers” on attn

If attn takes **significant or 100%** consumer risk, we need to prevent retailers from:

- pushing obviously non-paying or fraudulent customers into BNPL,
- selectively using attn only for “bad” risk.

Mitigations:

1. **Minimum retailer first-loss** even when attn takes most risk

   - For “full risk transfer” products, retailer might still:
     - post a small **cash reserve** with attn (e.g. 3–5% of pool),
     - or accept automatic **clawbacks** (chargebacks to future BNPL proceeds) for early defaults/fraud.
   - Ensures retailer always has **economic pain** from bad origination.

2. **Eligibility rules and underwriting filters**

   - attn sets:
     - max BNPL ticket per customer (e.g. \$50k, \$100k, \$300k, \$1m tiers),
     - allowed geos / KYC levels (via partners),
     - minimum risk scores if a third-party scoring provider is involved.
   - Retailer can’t route arbitrary risk; system declines non-eligible customers.

3. **Performance-based caps**

   - If retailer’s vintage-level default rate exceeds thresholds:
     - attn automatically:
       - shrinks the retailer’s BNPL capacity, or
       - increases required first-loss share, or
       - suspends them altogether.
   - This mimics how Web2 BNPL providers adjust merchant terms based on performance.

4. **Monitoring and covenants**

   - attn monitors:
     - chargeback rates,
     - default curves by vintage,
     - unusual concentrations (e.g. many BNPLs to same address/card).
   - Retail agreements include covenants:
     - no artificial inflation of ticket prices,
     - no collusion with “friendly” fraudsters,
     - cooperation with repossession when feasible.

5. **Segregated “watch BNPL” product**

   - Consumer-risk exposure lives in a **segregated vault/SPV**, not in attnUSD core.
   - LPs opt in explicitly to this higher-risk, higher-yield strategy.

---

## 9. How attn can hedge or redistribute consumer BNPL risk

If attn takes significant consumer risk (mezz or full stack), hedging / distribution options include:

1. **Tranching and selling senior slices**

   - Mezz + first-loss (retained by retailer + attn).
   - Senior sold to:
     - credit funds,
     - structured-credit DAOs,
     - offchain investors via tokenised notes.
   - Senior enjoys:
     - short duration (3 months),
     - diversified pools of watch BNPL,
     - protection from first-loss + mezz.

2. **Credit insurance**

   - Buy **trade credit insurance** or bespoke covers on:
     - specific pools,
     - or entire watch BNPL programme.
   - Align retention:
     - Retailer + attn keep first-loss,
     - insurer protects part of senior exposure.

3. **Overcollateralised reserve**

   - For each pool:
     - lock an additional **cash or stablecoin reserve** (e.g. 5–10% of N).
   - Financing sources:
     - discount on BNPL receivables,
     - junior capital from attn or aligned LPs.
   - Reserve absorbs early and idiosyncratic losses.

4. **Portfolio limits and correlation checks**

   - Hard caps by:
     - retailer,
     - geography,
     - price band (e.g. \$10k–\$50k vs \$50k–\$250k vs \$250k–\$1m),
     - brand (Rolex vs Patek vs RM).
   - Prevent over-exposure to a single retailer or sub-segment.

5. **Repricing and vintage controls**

   - For each new vintage:
     - adjust BNPL discount / margin based on observed defaults and market conditions.
   - Keep duration short (3 months) so repricing is quick.

---

## 10. Summary comparison table – who holds the consumer risk?

For a single BNPL transaction (e.g. 3-month BNPL for a \$100k Nautilus 5711):

Assume for shared-risk scenario:  
\(\alpha_{\text{FL}} = 10\%\), \(\alpha_{\text{MEZ}} = 20\%\), senior = 70%.

| Scenario                              | Consumer default risk held by retailer | Risk held by attn                        | Risk held by external investors/insurers | Retailer gets full price upfront? | Notes                                                                                           |
|--------------------------------------|----------------------------------------|------------------------------------------|------------------------------------------|-----------------------------------|-------------------------------------------------------------------------------------------------|
| 1. Retailer holds 100% risk          | 100% of loss on \(P\)                 | 0% of consumer loss (only B2B exposure) | 0%                                       | Optional (via B2B line)           | attn only lends to retailer; no consumer exposure on attn side.                                |
| 2. Shared risk (example)             | 10% of pool (first-loss)              | 20% of pool (mezz tranche)              | 70% of pool (senior tranche)            | Yes (via SPV/attn funding)       | Retailer has strong skin in game; attn runs a “watch BNPL vault”; senior risk can be sold/insured. |
| 3. attn + partners hold 100% risk    | 0%                                     | Variable: can hold FL+mezz+senior or just junior | Remainder of stack as senior/insured     | Yes                               | Retailer entirely offloads consumer risk; must be tightly controlled with strong guardrails.   |

For a **\$300k RM** or **\$1m** ticket, the same table applies; only the absolute dollar amounts scale. For example, on a \$300k RM with \(\alpha_{\text{FL}}=10\%\), \(\alpha_{\text{MEZ}}=25\%\):

- Retailer max loss in shared-risk scenario: \$30k.
- attn max mezz loss: \$75k.
- Senior max loss: \$195k.

---

## 11. Where this sits in attn’s product roadmap

- Early phases:
  - Focus on **B2B credit** to protocols, platforms, and services (RPCs, wallets, infra, etc.).
  - For watch retailers:
    - start with **Scenario 1** (retailer holds 100% consumer risk, attn provides B2B funding),
    - optionally pilot a small **Scenario 2** shared-risk pool with strict caps.

- Later phases:
  - Build a dedicated **“watch BNPL” vault / SPV**:
    - short-tenor, diversified pool of 3-month watch BNPL,
    - explicit first-loss and mezz capital,
    - senior tranches for conservative credit LPs or insurers.
  - Only consider **Scenario 3** (retailer 0% consumer risk) once:
    - attn has strong underwriting data on retailer behaviour and consumer defaults,
    - robust guardrails and external risk-sharing are in place.

This keeps attn firmly focused on **entity-level financing and structured risk sharing**, while giving luxury-watch retailers a clear menu of how much consumer credit risk they want to keep vs move into onchain credit structures.
