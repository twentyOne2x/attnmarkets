# attn.markets – Business Scale, ARR Targets, and Distribution Strategy

This note formalises how attn can scale economically, what levels of **average deployed credit** are required to reach **$1m** and **$10m**+ ARR, and how distribution/partnerships should be structured so attn is not just a “last resort lender” behind Avici/Krak/others.

---

## 1. Objectives

Near- to medium-term economic objectives (protocol-level, pre-operating expenses):

- **Target A:** Reach ≈ **$1m ARR** from credit/spread and fees.
- **Target B:** Design a credible path to ≈ **$10m ARR** over time.

These targets are expressed in terms of:

- **Average deployed credit** across all facilities, not just vault TVL.
- **Net protocol margin** after LP yield and expected losses.

---

## 2. Basic economics and notation

We separate:

- **TVL in attnUSD / vaults**: total LP funds.
- **Average deployed credit** \(D\): the portion of TVL that is actually lent out (exposed to credit risk).

Key parameters (all annualised):

- \( D \) – Average deployed credit (USD).
- \( r_b \) – Average **borrower APR** across the book (weighted by deployed notional).
- \( r_{LP} \) – Average **net yield promised to LPs** (attnUSD, per vault mix).
- \( \ell \) – **Expected annual loss rate** on deployed credit (as % of \(D\)), after diversification and recoveries.
- \( r_{\text{prot}} \) – **Protocol gross margin rate** (before opex).

Approximate identity:

\[
r_{\text{prot}} \approx r_b - r_{LP} - \ell
\]

Protocol ARR:

\[
\text{ARR} \approx D \cdot r_{\text{prot}}
\]

Interpretation:

- If you earn 18% from borrowers, pay 10% to LPs, and expect 3% annual loss, you keep ≈ 5% as protocol margin.
- That 5% applied to the **average deployed credit** \(D\) is what pays for ops, token incentives, and profit.

---

## 3. Order-of-magnitude for $1m ARR

To get a feel for required scale, plug in illustrative bands.

### 3.1 Higher-yield / higher-risk book

Example “credity” configuration:

- Borrower APR \( r_b \) ≈ 20%  
- LP yield \( r_{LP} \) ≈ 10%  
- Expected loss \( \ell \) ≈ 3%  

Then:

\[
r_{\text{prot}} \approx 20\% - 10\% - 3\% = 7\%
\]

To reach \$1m ARR:

\[
D_{\text{needed}} \approx \frac{1{,}000{,}000}{0.07} \approx 14.3\text{m}
\]

So under an aggressive, high-yield, higher-loss mix, you could reach ≈$1m ARR with **mid-teens millions deployed** on average.

### 3.2 More conservative, treasury-heavy / lower-yield book

Example “safer” configuration:

- Borrower APR \( r_b \) ≈ 12%  
- LP yield \( r_{LP} \) ≈ 8%  
- Expected loss \( \ell \) ≈ 1\%  

Then:

\[
r_{\text{prot}} \approx 12\% - 8\% - 1\% = 3\%
\]

To reach \$1m ARR:

\[
D_{\text{needed}} \approx \frac{1{,}000{,}000}{0.03} \approx 33.3\text{m}
\]

So with low double-digit borrower APRs and low loss rates, you need on the order of **30–35m deployed**.

### 3.3 Practical target band for $1m ARR

Realistically, attn will have a **blended book**:

- Some **low- to mid-yield**, lower-risk facilities (treasury/runway-backed, strong governance).
- Some **higher-yield**, higher-risk facilities (revenue-based BNPL, merchant credit, riskier B2B).

That suggests a blended \( r_{\text{prot}} \) in the **3–6%** range.

- At \( r_{\text{prot}} \approx 4\% \) → need ≈ 25m deployed.
- At \( r_{\text{prot}} \approx 5\% \) → need ≈ 20m deployed.
- At \( r_{\text{prot}} \approx 6\% \) → need ≈ 16.7m deployed.

**Working target band for $1m ARR:**  
attn needs roughly **15–30m of average deployed credit**, depending on risk/return mix.

---

## 4. Order-of-magnitude for $10m ARR

Same logic, just scaled.

### 4.1 If attn keeps a healthy margin (5–7%)

Assume you stabilise at a reasonably profitable mix:

- \( r_{\text{prot}} \approx 5–7\% \)

Then:

- At 5% margin:

  \[
  D_{\text{needed}} \approx \frac{10{,}000{,}000}{0.05} = 200\text{m}
  \]

- At 6% margin:

  \[
  D_{\text{needed}} \approx \frac{10{,}000{,}000}{0.06} \approx 166.7\text{m}
  \]

- At 7% margin:

  \[
  D_{\text{needed}} \approx \frac{10{,}000{,}000}{0.07} \approx 142.9\text{m}
  \]

So, to reach ≈$10m ARR with a healthy spread, you likely need on the order of **150–200m of average deployed credit**.

### 4.2 If the book becomes very conservative (3–4%)

If, over time, competition and de-risking compress margins:

- \( r_{\text{prot}} \approx 3–4\% \)

Then requirements jump:

- At 3%: \( D \approx 333\text{m} \)
- At 4%: \( D \approx 250\text{m} \)

So the realistic “design goal” for a $10m ARR business is:

> Build a path toward **150–250m** of average deployed credit, with a blended protocol margin in the **4–6%** range.

That is a long-term goal and implies multiple verticals and geographies, not just one launchpad or one partner.

---

## 5. Vertical contributions: MetaDAO vs others

### 5.1 MetaDAO treasury + future revenue vertical

MetaDAO is an excellent **design partner**, but its scale is bounded.

Even if you:

- Look at **governed treasuries** in Squads (e.g. 500k–2m per project),
- Use a **runway-constrained, haircut LTV** (say, 15–25% of stable/blue-chip runway),
- And have 50–100 projects drawing **50% utilisation** on average,

you land in the rough bands:

- Average capacity per project (illustrative): 100k  
- Deployed with 50 projects using 50%: ≈ 2.5m  
- Deployed with 100 projects using 50%: ≈ 5m  

Even if MetaDAO becomes the largest launchpad and you push usage, you’re probably in the **5–10m** deployed credit range from this vertical.

Implication:

- MetaDAO can be **5–30%** of the book at scale, but **not the whole thing**.
- It is a great wedge to:
  - prove the revenue+treasury underwriting,
  - test the Exponent PT/YT plumbing,
  - and generate early, relatively safe yield.

### 5.2 Crypto B2B / infra vertical

Candidates with **larger, more stable, B2B revenue**:

- RPC providers, indexing/oracle infra, API SaaS.
- Custody and wallet SaaS (Business / Pro tiers).
- DePIN networks with usage-based income in stables or majors.

These firms often:

- Have 5–30m ARR-equivalent in revenue at the “crypto-native mid-market” level.
- Use working capital for:
  - customer acquisition,
  - global expansion,
  - hardware/capex (for DePIN).

A single B2B customer can justify **250k–2m** of revenue-based capacity. A portfolio of, say, 30–50 such names can give:

- Low end: 30 × 300k × 50% utilisation ≈ 4.5m deployed.
- More mature: 50 × 1m × 50% utilisation ≈ 25m deployed.

This vertical is a natural path to **tens of millions** of deployed credit, with:

- Reasonable default expectations (B2B, recurring revenue),
- Borrower APRs in the low-to-mid teens,
- Lower-than-consumer loss rates.

### 5.3 Onchain fintech / cards / BNPL / merchant verticals

Partners like:

- **Avici** (internet neobank, payroll account, trust score, unsecured loans).
- Other Solana/EVM card/wallet stacks.
- BNPL-like merchant ecosystems (ecommerce, luxury, specialised niches like watches).

Here attn can:

- Finance **merchant advances**, merchant BNPL working capital, and B2B credit lines.
- Underwrite against:
  - merchant revenue,
  - fee and interchange flows,
  - and, selectively, merchant treasury.

This is where you can realistically see **single-partner exposures in the 10–50m range** over time, because:

- Consumer volumes are large (cards, BNPL),
- Merchant networks can scale quickly,
- Revenue pools (fees, interchange, interest spreads) are meaningful.

Even if attn only funds a **small slice** of such partners’ books (e.g. a specialised watch BNPL program, a subset of geos, or a B2B merchant cohort), this vertical is essential to reach:

- ~**15–30m deployed** (for $1m ARR),
- on the way to ~**100m+ deployed** (toward $10m ARR).

---

## 6. Example compositions to reach \$1m and \$10m ARR

These are illustrative mixes, not forecasts.

### 6.1 $1m ARR target (≈20m deployed, 5% margin)

Assume:

- \( r_{\text{prot}} \approx 5\% \)
- \( D \approx 20\text{m} \)

Vertical mix (rough example):

- **MetaDAO runway credit:**  
  - 5m deployed (runway-constrained treasury facilities).  
- **Crypto B2B/infra:**  
  - 7m deployed (working-capital lines and RCAs).  
- **Fintech / merchant / BNPL (e.g. watch BNPL, small merchant cohorts):**  
  - 8m deployed.

Protocol ARR:

\[
\text{ARR} \approx 20\text{m} \cdot 5\% = 1\text{m}
\]

### 6.2 $10m ARR target (≈180m deployed, ~5.5% margin)

Assume:

- \( r_{\text{prot}} \approx 5.5\% \)
- \( D \approx 180\text{m} \)

Vertical mix (illustrative, more mature stage):

- **MetaDAO and other launchpads (Solana + EVM):**  
  - 15–25m deployed (runway + revenue-backed credit).

- **Crypto B2B / infra / DePIN:**  
  - 40–60m deployed (recurring-revenue term loans and revolvers).

- **Onchain fintech / card / BNPL / merchant verticals:**  
  - 80–120m deployed (multiple programs, diversified across merchants and geos).

- **Other specialised programs (e.g. specific RWA-adjacent revenue streams, niche protocols):**  
  - 10–30m deployed.

With \(D ≈ 180\text{m}\) and \(r_{\text{prot}} ≈ 5.5\%\):

\[
\text{ARR} \approx 180\text{m} \cdot 5.5\% = 9.9\text{m} \approx 10\text{m}
\]

---

## 7. Distribution and avoiding “last-resort lender” status

Concern: large onchain fintechs (Avici, Krak, others) could build their own underwriting and funding, leaving attn as a capital provider of last resort.

To avoid that, attn should design **how it plugs into these stacks** from the beginning.

### 7.1 Where Avici/Krak-type partners naturally need external capital

Even if a fintech builds its own credit engine, it still needs to decide:

- How much credit **risk** to hold on its own balance sheet.
- How quickly it wants to **grow** vs. how much equity it is willing to deploy.
- How much **duration and correlation risk** it is comfortable with.

attn can be positioned as:

1. **Off-balance-sheet capital for specific verticals:**
   - e.g. “onchain-native merchants”, “crypto-heavy geos”, “high-ticket verticals like watches”.
   - The partner originates and services; attn funds or co-funds.

2. **Revenue-backed funding for B2B and merchant-side credit:**
   - Avici’s consumer loans and home mortgages are not where attn starts.
   - Instead, focus on:
     - merchant advances,
     - B2B lines to crypto-native businesses,
     - working capital for payroll-backed entities and DAOs.

3. **Risk tranching and scaling:**
   - Early phase: the fintech wants to own the “safe” part and offload tail risk.
   - Later: as volumes scale, they want external partners to absorb more of the book, especially non-core geos or segments.

### 7.2 Integration patterns that create distribution and stickiness

To avoid being replaceable, target **integration depth**, not just “here is a pool of money”:

1. **Revenue-account + data integration, not just lending API**

   - Integrate attn’s revenue accounts or observability directly with:
     - merchant payout flows,
     - settlement rails,
     - card/BNPL transaction data (aggregated, privacy-preserving).
   - Provide underwriting and analytics that feed both:
     - attn’s risk engine,
     - and the partner’s trust/credit models (e.g. Avici Trust Score).

   This makes attn part of the **data and risk stack**, not only the funding stack.

2. **Dedicated joint vaults / programs**

   - Launch **co-branded or dedicated vaults**:
     - “Avici Merchant Revenue Vault”,
     - “DePIN Working Capital Vault”,
     - “Watch BNPL Vault”.
   - These vaults:
     - have partner-specific underwriting guidelines,
     - give LPs clarity on exposure,
     - and tie attn to the partner’s long-term success.

3. **Program-by-program deals**

   - Instead of being the generic lender of last resort, structure **program-level agreements**:
     - Watch BNPL program,
     - Specific merchant category,
     - Specific country/segment.
   - In each program:
     - the partner can set UX and front-end terms,
     - attn controls risk limits, pricing floors, and coverage tests.

4. **Multi-party capital stack, where attn has unique role**

   - Design stacks where:
     - partner takes a slice (first-loss or mezz),
     - attn takes a slice,
     - external credit funds or insurers take senior slices.
   - attn’s value:
     - orchestrating onchain structuring,
     - providing infra and PT/YT representation,
     - connecting DeFi LPs into these tranches.

   This discourages the partner from vertically integrating everything, because:

   - they still get economics and control,
   - but do not need to build or maintain all the onchain structuring and DeFi distribution.

### 7.3 Why attn is not simply a “fallback” lender

If attn does the following, it has real defensibility:

- **Specialisation in revenue-backed structures**:
  - Good at sizing and monitoring facilities based on live onchain revenue and governed accounts.
  - Off-the-shelf templates for:
    - launchpads (MetaDAO),
    - B2B infra,
    - merchant watch BNPL,
    - other verticals.

- **Data advantage over time**:
  - Default and performance data on thousands of entities across verticals.
  - Better posterior priors than any single fintech, especially across cross-ecosystem revenues.

- **Convenience + cost for partners**:
  - It is cheaper and faster for Avici/Krak/others to:
    - plug into attn for specific programs,
    - than to build onchain securitisation, vault infra, and LP distribution themselves.

- **Neutral infra positioning**:
  - attn is not trying to be *the* consumer neobank or *the* card issuer.
  - That lowers competition risk relative to partners and makes them more willing to integrate deeply.

If attn only offers “a pool of stables at X%” with no infra or data benefit, it will be last resort. If it offers **revenue-native structuring, risk infra, and access to DeFi LPs**, it becomes a **natural funding & structuring partner** instead.

---

## 8. Summary

- **Economics:**  
  - ARR ≈ \( D \cdot (r_b - r_{LP} - \ell) \).  
  - For **$1m ARR**, aim for roughly **15–30m of average deployed credit** with a blended 3–6% margin.  
  - For **$10m ARR**, aim for roughly **150–250m of average deployed credit** with a blended 4–6% margin.

- **Vertical contributions:**  
  - MetaDAO and launchpads: **5–10m** deployed (possibly 15–25m later) – great wedge, limited TAM alone.  
  - Crypto B2B/infra/DePIN: **tens of millions** in working-capital and revenue-based lines.  
  - Onchain fintech/card/BNPL/merchant programs: **tens to low hundreds of millions** across multiple partners and geos, if structured carefully.

- **Distribution and defensibility:**  
  - Don’t aim to replace Avici/Krak; **fund and structure their merchant/B2B and niche vertical credit**, especially where onchain revenues and crypto-native users dominate.  
  - Integrate deeply at the **revenue-account + data layer**, co-design vaults and programs, and become the default **revenue-backed securitisation + DeFi funding infra**.  
  - Over time, default and performance data across many verticals becomes a core moat that is hard for any single partner to replicate.

This frames MetaDAO-style revenue+treasury credit as one important wedge, but makes clear that meaningful ARR requires scaling into **B2B and fintech/merchant verticals**, with attn positioned as the **revenue-native credit and structuring engine** behind them.
