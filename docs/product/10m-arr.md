# attn ARR & TVL Path – Pump.fun, MetaDAO, B2B

Goal: make the TVL and ARR ceiling less hand-wavy by:

- treating **Pump.fun creator rewards** as a dedicated cash-advance + autostaking wedge,
- adding **MetaDAO-style treasury-backed facilities**,
- layering **B2B revenue-backed credit** and **high-ticket BNPL (watches)**,
- and showing concrete paths to **$1m** and **$10m** protocol ARR.

---

## 1. Core assumptions and notation

### 1.1 Global notation

- \( R_{\text{pump}} \): annual Pump.fun creator rewards ([earnings.wtf)](https://earnings.wtf):  
  - baseline \( R_{\text{pump}}^{\text{base}} = \$150m \)  
  - upside \( R_{\text{pump}}^{\text{max}} = \$300m \)
- \( s \): share of that flow financed via attn cash advances (0–1).
- \( f \): **flat factor fee** on each advance (e.g. 0.10 = 10%).
- \( \alpha_{\text{margin}} \): protocol share of gross credit revenue after LP yield + expected losses.  
  Working assumption: \( \alpha_{\text{margin}} \approx 35\% \)  
  (in line with a book where borrowers pay ~9–10% blended, LPs earn ~4–5%, losses ~1–2%).

For staking:

- \( B_{\text{idle}} \): average idle balance sitting in a revenue account.
- \( y_{\text{SOL}} \): base SOL staking yield (assume 6%).
- \( \alpha_{\text{stake}} \): protocol take rate on staking yield (assume 8%).

For MetaDAO-like facilities:

- \( N_{\text{meta}} \): number of projects using attn credit.
- \( T \): average treasury per project (assume \$1m).
- \( \lambda_{\text{LTV}} \): credit limit as % of treasury (assume 20%).
- \( u \): average utilisation of the limit (assume 50%).
- \( r_b \): borrower APR on the line (assume 10%).

For B2B:

- \( N_{\text{b2b}} \): number of B2B clients.
- \( E_{\text{b2b}} \): average outstanding per client.

For watches BNPL:

- \( W \): annual financed volume of watches.
- \( \phi_{\text{BNPL}} \): merchant fee as % of ticket (assume 6%; within typical BNPL merchant fees of roughly 2–8%).

All dollar amounts below are quoted as **$Xk / $Xm**.

---

## 2. Pump.fun creator cash advances

### 2.1 Cash-advance mechanics

For Pump.fun, treat credit as **invoice-style cash advances** against near-term creator rewards:

- Borrower: creator with **already-accrued or very near-term** Pump.fun rewards.
- Advance: attn buys a slice of those rewards at a **flat factor fee** \( f \) (5–15%).
- Tenor: short (days–weeks), but the fee is **non-annualised**, like merchant cash advances.

Core formulas:

- **Financed volume per year**  
  \[
  V_{\text{pump}} = R_{\text{pump}} \cdot s
  \]
- **Gross factor revenue per year**  
  \[
  G_{\text{pump}} = V_{\text{pump}} \cdot f
  \]
- **Protocol ARR from factor fees**  
  \[
  \Pi_{\text{pump, factor}} = \alpha_{\text{margin}} \cdot G_{\text{pump}}
  \]

Where \(\alpha_{\text{margin}}\) is the share that ends up as protocol revenue (rest = LP yield + expected loss + ops).

### 2.2 Do 5–15% flat factor rates make sense?

In Web2, **merchant cash advances (MCAs)** charge:

- **factor rates** typically in the **1.1–1.5** range (10–50% fees on the advance), not annualised,  
- on terms of a few months to a year, yielding **effective APRs that can easily exceed 40–100+%**.  

Using the usual APR approximation for a flat fee:

\[
\text{APR} \approx f \cdot \frac{365}{\text{tenor (days)}}
\]

Examples:

- 10% factor over 30 days ⇒ APR ≈ \(0.10 \cdot \frac{365}{30} \approx 122\%\).
- 5% factor over 60 days ⇒ APR ≈ \(0.05 \cdot \frac{365}{60} \approx 30\%\).
- 10% factor over 90 days ⇒ APR ≈ \(0.10 \cdot \frac{365}{90} \approx 41\%\).

So:

- **Envelope 5–15% factor is realistic** for high-risk, short-tenor advances (similar to MCAs).
- To avoid predatory optics:
  - stay at the **low end of the band (5–8%)** for tenors ≲60 days,
  - reserve **10–15%** for:
    - longer tenors (60–90 days) or
    - extremely volatile / high-risk creators.

You can also publish the **effective APR bands** in docs to keep it honest, even if the UI speaks in flat fees.

### 2.3 Pump.fun: profits from factor fees alone

Baseline:  
\( R_{\text{pump}}^{\text{base}} = \$150m \), \( \alpha_{\text{margin}} = 35\% \).

Illustrative combinations:

| Share of Pump flow financed \(s\) | Factor fee \(f\) | Financed volume \(V_{\text{pump}}\) | Gross factor revenue \(G_{\text{pump}}\) | Protocol share (35%) \(\Pi_{\text{pump, factor}}\) |
|----------------------------------|------------------|--------------------------------------|------------------------------------------|----------------------------------------------------|
| 5%                               | 5%               | \$7.5m                               | \$0.38m                                  | \$0.13m                                            |
| 5%                               | 10%              | \$7.5m                               | \$0.75m                                  | \$0.26m                                            |
| 10%                              | 10%              | \$15m                                | \$1.50m                                  | \$0.53m                                            |
| 20%                              | 10%              | \$30m                                | \$3.00m                                  | \$1.05m                                            |
| 20%                              | 15%              | \$30m                                | \$4.50m                                  | \$1.57m                                            |

So **Pump cash advances alone** can plausibly contribute between **\$0.1m–\$1.5m+** of protocol ARR depending on penetration and factor.

Note: this is **before** staking fee revenue on idle balances.

---

## 3. Pump.fun autostaking fee

Assume:

- creator rewards accumulate in attn revenue accounts,
- idle SOL (or SOL-denominated assets) is automatically staked at **6% base yield**,
- attn takes **8% of the yield** as a fee (creator keeps 92%).

Protocol staking fee rate:

\[
\alpha_{\text{stake}} \cdot y_{\text{SOL}} = 0.08 \cdot 0.06 = 0.0048 \; (0.48\% \text{ per year})
\]

For an average idle balance \( B_{\text{idle}} \):

\[
\Pi_{\text{pump, stake}} = 0.0048 \cdot B_{\text{idle}}
\]

Examples:

| Average idle balance \(B_{\text{idle}}\) | Protocol staking fee (0.48% p.a.) |
|------------------------------------------|-----------------------------------|
| \$25m                                    | \$0.12m                           |
| \$50m                                    | \$0.24m                           |
| \$100m                                   | \$0.48m                           |
| \$150m                                   | \$0.72m                           |

Interpretation:

- Under your simplifying assumption (“rewards idle on wallet”), **Pump.autostake alone** can comfortably be a **\$0.2m–\$0.7m** ARR wedge.
- In practice, idle balances will be lower than full yearly flow, so these are **upper-ish bounds**; but even at \$50m average idle you get **\$0.24m ARR**.

---

## 4. MetaDAO-style treasury-backed facilities

Here, attn lends against **treasury + governed burn discipline**, not just revenue.

Assumptions (per project):

- Treasury \( T = \$1m \).
- Credit limit \( L = \lambda_{\text{LTV}} \cdot T \), with \( \lambda_{\text{LTV}} = 20\% \) ⇒ \( L = \$200k \).
- Average utilisation \( u = 50\% \) ⇒ average outstanding \( E = u \cdot L = \$100k \).
- Borrower APR \( r_b = 10\% \).
- Protocol share of interest \( \alpha_{\text{margin}} = 35\% \).

Per project:

- **Outstanding**: \( E = \$100k \).
- **Gross interest per year**: \( E \cdot r_b = \$10k \).
- **Protocol revenue per year**:  
  \[
  \Pi_{\text{meta, per}} = \alpha_{\text{margin}} \cdot E \cdot r_b
  = 0.35 \cdot \$10k = \$3.5k
  \]

For \( N_{\text{meta}} \) projects:

- Total outstanding:  
  \[
  E_{\text{meta, total}} = N_{\text{meta}} \cdot E
  \]
- Protocol ARR:  
  \[
  \Pi_{\text{meta}} = N_{\text{meta}} \cdot \Pi_{\text{meta, per}}
  \]

Examples:

| \(N_{\text{meta}}\) | Total outstanding \(E_{\text{meta, total}}\) | Gross interest | Protocol ARR (35%) |
|---------------------|----------------------------------------------|----------------|--------------------|
| 30                  | \$3.0m                                       | \$0.30m        | \$0.11m            |
| 50                  | \$5.0m                                       | \$0.50m        | \$0.18m            |
| 100                 | \$10.0m                                      | \$1.00m        | \$0.35m            |
| 200                 | \$20.0m                                      | \$2.00m        | \$0.70m            |
| 300                 | \$30.0m                                      | \$3.00m        | \$1.05m            |

So **one large MetaDAO-like ecosystem** (100–200 projects using credit) is realistically a **\$0.3m–\$0.7m ARR** wedge. Cloning that model onto 2–3 similar ecosystems gets you into **\$1m+** from this vertical alone.

---

## 5. B2B onchain revenue credit (RPCs, wallets, infra)

Model B2B as more conventional revolving credit against **recurring usage fees** (RPC, wallets, DePIN, etc.):

Assume:

- Borrower APR \( r_b = 10\% \).
- Protocol share \( \alpha_{\text{margin}} = 35\% \).
- Each client carries average outstanding \( E_{\text{b2b}} \).

Per client:

- Protocol ARR:  
  \[
  \Pi_{\text{b2b, per}} = \alpha_{\text{margin}} \cdot E_{\text{b2b}} \cdot r_b
  \]

Examples:

| Clients \(N_{\text{b2b}}\) | Avg outstanding per client | Total outstanding | Protocol ARR (35%) |
|----------------------------|----------------------------|-------------------|--------------------|
| 5                          | \$250k                     | \$1.25m           | \$0.04m            |
| 10                         | \$500k                     | \$5.00m           | \$0.18m            |
| 20                         | \$1.00m                    | \$20.0m           | \$0.70m            |
| 30                         | \$1.00m                    | \$30.0m           | \$1.05m            |

This vertical is GTM-intensive but **capital-efficient**: a handful of meaningful infra clients can easily add **\$0.2m–\$1m** ARR.

---

## 6. High-ticket watch BNPL wedge (summary only)

From the watch BNPL doc:

- Typical tickets: Nautilus 5711 (~\$100k+), Submariner (~\$14k), common Richard Mille refs mid-six figures, etc.  
- Treat watch BNPL as:

  - Merchant paid upfront.
  - Merchant fee \( \phi_{\text{BNPL}} \approx 6\% \) (within BNPL norms of 2–8%).
  - attn retains 35% of that fee as protocol revenue after LP yield + expected losses.

Formulas:

- Annual financed volume \( W \).
- Gross fees: \( G_{\text{watch}} = W \cdot \phi_{\text{BNPL}} \).
- Protocol ARR: \( \Pi_{\text{watch}} = \alpha_{\text{margin}} \cdot G_{\text{watch}} \).

Examples:

| Financed volume \(W\) | Gross BNPL fees (6%) | Protocol ARR (35%) |
|------------------------|----------------------|--------------------|
| \$10m                  | \$0.60m              | \$0.21m            |
| \$50m                  | \$3.00m              | \$1.05m            |
| \$100m                 | \$6.00m              | \$2.10m            |
| \$200m                 | \$12.00m             | \$4.20m            |

High-ticket watches can be a **lumpy but very powerful add-on** once you have deep relationships with a few major dealers.

---

## 7. Scenario stacking: Today → Low → Mid → High

Here is a **layered scenario set** that respects “each vertical is a GTM” and shows ballpark TVL and ARR.

Assumptions per vertical:

- Pump APR computations use **30-day** average tenor.
- Watch BNPL outstanding uses **6-month** average tenor.

### 7.1 Scenario definitions

**Scenario A – “Today-ish”**

- Pump.fun:
  - \( R_{\text{pump}} = \$150m \), \( s = 2\% \), \( f = 7\% \).
  - Idle balance \( B_{\text{idle}} = \$20m \).
- MetaDAO:
  - \( N_{\text{meta}} = 20 \).
- B2B:
  - 3 clients × \$200k outstanding.
- Watch BNPL:
  - Not live yet.

**Scenario B – “Low” (first serious growth; ~\$1m ARR)**

- Pump.fun:
  - \( R_{\text{pump}} = \$150m \), \( s = 5\% \), \( f = 8\% \).
  - Idle balance \( B_{\text{idle}} = \$50m \).
- MetaDAO:
  - \( N_{\text{meta}} = 50 \).
- B2B:
  - 5 clients × \$250k.
- Watch BNPL:
  - \$10m financed per year.

**Scenario C – “Mid” (multi-vertical, few \$m ARR)**

- Pump.fun:
  - \( R_{\text{pump}} = \$150m \), \( s = 10\% \), \( f = 10\% \).
  - Idle balance \( B_{\text{idle}} = \$100m \).
- MetaDAO:
  - \( N_{\text{meta}} = 100 \).
- B2B:
  - 10 clients × \$500k.
- Watch BNPL:
  - \$50m financed per year.

**Scenario D – “High” (aggressive, but still single-ecosystem + watches)**

- Pump.fun:
  - \( R_{\text{pump}} = \$300m \), \( s = 20\% \), \( f = 10\% \).
  - Idle balance \( B_{\text{idle}} = \$150m \).
- MetaDAO:
  - \( N_{\text{meta}} = 200 \).
- B2B:
  - 20 clients × \$1m.
- Watch BNPL:
  - \$100m financed per year.

### 7.2 Scenario outputs (ARR and TVL)

Approximate **protocol ARR** and **credit TVL** (average outstanding) by scenario:

| Scenario | Pump ARR (factor+stake) | MetaDAO ARR | B2B ARR | Watch ARR | **Total ARR** | Pump TVL | MetaDAO TVL | B2B TVL | Watch TVL | **Total TVL** |
|----------|-------------------------|------------|---------|-----------|---------------|----------|-------------|---------|-----------|---------------|
| Today-ish | \$0.19m                | \$0.07m    | \$0.02m | \$0.00m   | **\$0.27m**   | \$0.25m  | \$2.00m     | \$0.60m | \$0.00m   | **\$2.85m**   |
| Low      | \$0.58m                | \$0.18m    | \$0.04m | \$0.21m   | **\$1.11m**   | \$0.62m  | \$5.00m     | \$1.25m | \$4.93m   | **\$11.80m**  |
| Mid      | \$1.01m                | \$0.35m    | \$0.18m | \$1.05m   | **\$2.58m**   | \$1.23m  | \$10.00m    | \$5.00m | \$24.66m  | **\$40.89m**  |
| High     | \$2.20m                | \$0.70m    | \$0.70m | \$2.10m   | **\$5.70m**   | \$4.93m  | \$20.00m    | \$20.00m| \$49.32m  | **\$94.25m**  |

(Watch TVL approximated with 6-month average tenor: \( W \cdot 6 \text{ months} / 12 \).)

These are **not forecasts**, just **internal sanity-check bands** showing that:

- Even with **moderate penetration**, Pump + MetaDAO + a few B2B clients + some watch BNPL give **\$2–\$6m** protocol ARR at **\$40–\$100m** TVL.

---

## 8. Minimal mixes to \$1m and \$10m ARR

### 8.1 “Only two verticals” path to \$1m ARR

You explicitly wanted: **\$1m ARR without having to run every vertical**.

Take just:

- Pump.fun advances + autostaking, and
- MetaDAO-style treasury credit.

Example:

- Pump.fun:
  - \( R_{\text{pump}} = \$150m \),
  - \( s = 10\% \) of flow advanced,
  - \( f = 10\% \) factor,
  - idle balance \( B_{\text{idle}} = \$50m \).
- MetaDAO:
  - \( N_{\text{meta}} = 70 \) projects on credit.

Outputs:

- Pump.fun:
  - Financed volume: \( \$150m \cdot 10\% = \$15m \).
  - Gross factor revenue: \( \$1.5m \).
  - Protocol share (35%): ≈ **\$0.53m**.
  - Staking fee on \$50m idle (0.48%): ≈ **\$0.24m**.
  - **Total Pump ARR ≈ \$0.77m**.
- MetaDAO:
  - Total outstanding: \( 70 \cdot \$100k = \$7.0m \).
  - Gross interest (10%): \$0.70m.
  - Protocol share (35%): ≈ **\$0.25m**.

Combined:

- **Protocol ARR ≈ \$1.01m**.
- **TVL ≈ \$8.2m**  
  (≈\$1.2m Pump outstanding + \$7.0m MetaDAO outstanding).

So **\$1m ARR is reachable with just two wedges**:

1. being the default **Pump.fun “credit + staking” backend** for ~10% of creator rewards, and  
2. serving ~70 MetaDAO-style projects with modest treasury lines.

### 8.2 A plausible \$10m ARR blend

Now a deliberately aggressive **multi-vertical mix**:

- Pump.fun:
  - \( R_{\text{pump}} = \$300m \),
  - \( s = 30\% \) of flow advanced,
  - \( f = 10\% \),
  - idle balance \( B_{\text{idle}} = \$200m \).
- MetaDAO-like ecosystems:
  - \( N_{\text{meta}} = 300 \) projects across MetaDAO + 1–2 similar ecosystems.
- B2B:
  - \( N_{\text{b2b}} = 30 \), each with \$1m outstanding.
- Watches BNPL:
  - Annual financed volume \( W = \$200m \).

Outputs:

- Pump.fun:
  - Financed volume: \( \$300m \cdot 30\% = \$90m \).
  - Factor revenue: \$9.0m; protocol share 35% ⇒ **\$3.15m**.
  - Staking fee on \$200m idle at 0.48% ⇒ **\$0.96m**.
  - **Total Pump ARR ≈ \$4.11m**.
- MetaDAO:
  - Total outstanding: \( 300 \cdot \$100k = \$30m \).
  - Gross interest: \$3.0m; protocol share ⇒ **\$1.05m**.
- B2B:
  - Total outstanding: \$30m.
  - Gross interest: \$3.0m; protocol share ⇒ **\$1.05m**.
- Watches BNPL:
  - Gross merchant fees: \( \$200m \cdot 6\% = \$12m \).
  - Protocol share: 35% ⇒ **\$4.20m**.

Total:

- **Protocol ARR ≈ \$10.4m**.
- **TVL ≈ \$166m**  
  (≈\$7.4m Pump + \$30m MetaDAO + \$30m B2B + ≈\$98.6m watch BNPL).

This is **not a near-term target**, but it shows:

- The **order of magnitude** of ARR is constrained more by:
  - how much of Pump.fun and similar creator flows you can anchor,
  - how many MetaDAO-like ecosystems you replicate,
  - how deeply you penetrate B2B and 1–2 high-ticket BNPL niches,
- than by pure onchain revenue being “too small”.

---

## 9. Service / persona / pricing / ARR summary

### 9.1 Per-service summary

| Service                                   | Client persona                            | Pricing (borrower-side)                                          | Protocol take                    | Typical annual protocol ARR band (once scaled)          |
|-------------------------------------------|-------------------------------------------|------------------------------------------------------------------|----------------------------------|---------------------------------------------------------|
| Pump.fun creator cash advances            | Pump creators with high creator rewards   | Flat factor 5–15% on advanced rewards; short tenors (days–weeks) | ≈35% of factor after LP + losses | \$0.1m–\$1.5m+ depending on 5–20% share of \$150–\$300m |
| Pump.fun autostaking on idle rewards      | Same                                      | User gets ~5.5% net if base 6% and 8% fee                        | 8% of yield (0.48% of balance)   | \$0.1m–\$0.7m for \$25–\$150m idle                       |
| MetaDAO-style treasury credit             | Onchain startups with governed treasuries | ~10% APR on revolving line sized at ~20% of treasury             | ≈35% of interest                 | \$0.1m–\$1.0m across 30–300 projects                    |
| B2B revenue-backed credit                 | RPCs, wallets, DePIN, infra               | ~8–12% APR on working-capital or growth lines                    | ≈35% of interest                 | \$0.04m–\$1.0m for \$1–\$30m outstanding                 |
| High-ticket watch BNPL (luxury dealers)   | Watch retailers (Patek, Rolex, RM, etc.)  | Merchant fee ~4–6% on financed tickets                           | ≈35% of merchant fee             | \$0.2m–\$4m for \$10–\$200m financed volume             |

### 9.2 Scenario-level ARR recap

Using the four stacked scenarios from §7:

| Scenario   | Verticals really “on”                                             | Protocol ARR | TVL    |
|-----------|-------------------------------------------------------------------|-------------:|-------:|
| Today-ish | Pump (small) + MetaDAO (20 proj) + tiny B2B                       |  ≈ \$0.27m   | ≈ \$2.9m |
| Low       | Pump (5% of Pump.fun) + MetaDAO (50 proj) + small B2B + small BNPL|  ≈ \$1.11m   | ≈ \$11.8m |
| Mid       | Pump (10%) + MetaDAO (100 proj) + more B2B + \$50m watch BNPL     |  ≈ \$2.58m   | ≈ \$40.9m |
| High      | Pump (20% of \$300m) + MetaDAO (200 proj) + stronger B2B + \$100m BNPL | ≈ \$5.70m | ≈ \$94.3m |

And two explicit mixes:

- **\$1m ARR** with only **Pump.fun + MetaDAO** (no B2B, no watches):  
  ≈\$1.01m ARR at ≈\$8.2m TVL.
- **\$10m ARR** with **all four verticals** at aggressive but plausible penetration:  
  ≈\$10.4m ARR at ≈\$166m TVL.

This gives you concrete levers:

- deepen **Pump.fun** integration (cash advances + autostaking),
- grow the number of **governed-treasury ecosystems** (MetaDAO-like),
- add **select B2B infra clients**, and
- later, switch on **one high-ticket BNPL niche** (watches) to bend the curve from \$5–\$6m toward \$10m+ ARR.
