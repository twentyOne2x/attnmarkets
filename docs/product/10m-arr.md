# attn.markets TVL, ARR & Verticals  
_MetaDAO treasuries, Pump.fun creator flows, and borrower pricing (6–8–12%)_

This note reframes the TVL / ARR plan to:

- Respect borrower pricing bands of roughly **6% / 8% / 12% APR** (Tier A/B/C).
- Add **Pump.fun** as a short-tenor, cash-advance vertical.
- Clarify **cash-advance vs revolving line pricing**.
- Show what a **$10m ARR** target realistically implies.
- Address distribution concerns vs Avici, Krak, etc.

---

## 1. Pricing guardrails

You want to keep borrower headline pricing in a sane band, not 18%+.

Assume three risk tiers at facility level:

- **Tier A (best)** – 6% APR target  
- **Tier B (mid)** – 8% APR target  
- **Tier C (riskier tail)** – 12% APR target  

This is for:

- RCAs (cash advances) with **30–120 day** effective tenors.
- RRCLs (revolving credit lines) where utilisation over the year gives a similar IRR.

For **very short-tenor micro-advances** (e.g. 7–14 days to Pump.fun creators):

- You quote **flat fees** rather than headline APR (e.g. 0.5–1.5% on a 7–14 day bridge).
- Internally, you still monitor **annualised IRR** and keep the **portfolio average** in the 6–12% band.
- Individual micro-advances can annualise higher, but the *book* should not drift into predatory territory.

LP side:

- Target stablecoins → **4–6% net** after losses, depending on vault and tenor.
- This implies an attn “spread” on deployed credit of **~2–5%** (borrower APR minus LP yield), depending on segment.

If average borrower APR ≈ 9–10% and average LP yield ≈ 4–5%, then:

- Protocol spread ≈ **4–5% on average deployed credit**.

This is what we use below to back out ARR vs TVL.

---

## 2. MetaDAO: treasury-driven credit is small but real

For MetaDAO-type cohorts:

- Typical fundraise: **$500k–$2m** into a **Squads treasury**.
- Typical burn: **$40k–$100k/month**.
- 12–18 months of runway is common.

Even if revenues are **zero** early on, the treasury + burn constraints in Squads give you a controlled environment to lend against:

- You know:
  - current balance,
  - burn,
  - available runway,
  - that funds are gated by governed spending rules.

A conservative treasury-backed line per project:

- Let:
  - \( B \) = treasury balance (e.g. $1m),
  - \( \text{burn} \) = monthly burn (e.g. $60k),
  - runway = \( B / \text{burn} \) (≈ 16.7 months),
  - haircut × LTV on “excess runway” = e.g. 0.2 (20%).

Example:

- \( B = 1\,000\,000 \), \( \text{burn} = 60\,000 \), 12-month minimum runway:
  - excess runway months ≈ 4.7,
  - excess dollars ≈ \( 4.7 \times 60\,000 \approx 282\,000 \),
  - capacity at 20% haircut×LTV ≈ **$56k** per project.

If you stretch to a bit less conservative (as in your earlier rough maths):

- Straight 0.2 × 12-month burn = \( 0.2 \times 12 \times 60\,000 \approx 144\,000 \) capacity.

Realistic range:

- **$50k–$150k** per MetaDAO project, depending on:
  - treasury level,
  - runway constraints,
  - how aggressive you are.

If:

- 100 MetaDAO projects,
- 50% of them actively use lines,
- average utilisation = 50% of capacity,

then with e.g. $100k capacity per project you get:

- Effective deployed per project ≈ $50k,
- Deployed across 50 projects ≈ **$2.5m**.

Even if you are more aggressive and get to:

- 100 projects × \$100k deployed = **$10m**,

that is still **small** in absolute TVL terms. So MetaDAO treasury-backed credit is **useful but not enough** alone.

---

## 3. Pump.fun creator revenues: cash-advance wedge

### 3.1 What Pump.fun pays creators (order of magnitude)

Mechanics:

- Pump.fun charges **1% swap fee** on trades and a listing fee when tokens “graduate”.   
- A portion of the fee (often quoted as **0.05–0.3% of trading volume**) is shared with creators/streamers.   

Empirical numbers:

- TokenDispatch reported Pump.fun distributing **$3m to creators in three weeks** early in the revenue-share program.   
- Axios later reported that creators have claimed **$21m in fees in a single week** at peak activity.   

Rough implication:

- Even if that $21m/week is a spike, it shows that creator rewards can be at **hundreds of millions per year** on a run-rate basis (e.g. 50–200m+ annualised is plausible, depending on volume regime).

So your “~$300m annualised” mental model is not crazy as a *growth scenario*; current public data suggests:

- “Steady-state” / normalised might be **$50–200m/year**,
- Peak regimes can be **$1b+ annualised** if the $21m/week level is sustained.

### 3.2 How much of that can attn reasonably finance?

Let:

- \( R_{\text{year}} \) = annual creator rewards (USD) actually flowing onchain.
- Suppose effective \( R_{\text{year}} \) ≈ **$150m** as a conservative mid-case.

Define:

- \( f_{\text{penetration}} \): fraction of all creator rewards that ever get financed via attn (e.g. 10–30%).
- \( T \): average advance tenor (days) – for Pump.fun you expect **very short**, e.g. 7–30 days.

If an advance is basically “I sell the next \(T\) days of my creator rewards”, then average outstanding notional is:

\[
\text{Outstanding} \approx f_{\text{penetration}} \cdot R_{\text{year}} \cdot \frac{T}{365}
\]

Examples:

1. **Low penetration, very short tenor**  
   - \( R_{\text{year}} = 150m \)  
   - \( f_{\text{penetration}} = 10\% \)  
   - \( T = 7 \) days  
   ⇒ Outstanding ≈ \( 0.1 \times 150m \times 7/365 \approx \$2.9m \).

2. **Moderate penetration, 30-day tenor**  
   - \( f_{\text{penetration}} = 20\% \), \( T = 30 \)  
   ⇒ Outstanding ≈ \( 0.2 \times 150m \times 30/365 \approx \$2.5m \).

3. **Aggressive penetration, 30-day tenor, higher R**  
   - \( R_{\text{year}} = 300m \), \( f_{\text{penetration}} = 30\% \), \( T = 30 \)  
   ⇒ Outstanding ≈ \( 0.3 \times 300m \times 30/365 \approx \$7.4m \).

Conclusion:

- Even with aggressive adoption, **Pump.fun cash advances are likely a single-digit-millions TVL vertical** on Solana.  
- But they are **short-tenor, high-turnover** and can be **high-yield** within your 6–12% APR band, so they punch above their weight in ARR relative to TVL.

---

## 4. Product shape: cash advances vs lines (and pricing)

### 4.1 Cash advances (RCAs) – per YT / per invoice

Use case:

- A Pump.fun or creator economy user sells a **slice of future creator rewards** (a YT strip) for cash today.
- A MetaDAO project sells a **specific invoice / revenue event** (e.g. a launchpad payout, a campaign payout).

Characteristics:

- Short tenor (7–60 days typical; 90 max for safer names).
- Self-liquidating from that specific stream.
- Lumpy and episodic.

Pricing guideline:

- Aim for **effective APR in 8–12% band** for “normal” deals.
- Express to users as **simple fee** on the notional, based on tenor:

  - 30-day Tier B advance at 8% APR → fee ≈ 8% × 30/365 ≈ **0.66%**.
  - 30-day Tier C advance at 12% APR → fee ≈ 12% × 30/365 ≈ **0.99%**.

For very short advances (e.g. 7 days), fee can look small in absolute terms but large annualised:

- 7-day advance with 0.25% fee → APR ≈ 0.25% × 365/7 ≈ 13%.  
- You can set internal guardrails like:
  - “For tenors < 14 days we cap fee so that implied APR ≤ 15–18%, unless explicitly justified.”

You can *optionally* charge slightly higher fee percentages on **one-off RCAs** vs longer, reusable lines (see below), while still keeping APR within or near the 6–12% band on typical tenors.

### 4.2 Revolving lines (RRCLs) – across multiple YTs / months

Use case:

- A MetaDAO project or more mature protocol with recurring revenue wants a **reusable line**.
- A top Pump.fun creator with sustained volume wants a **rolling limit** based on trailing rewards (not just one token).

Characteristics:

- Limit \( L_{\max} \) sized via your Section 3.4 logic (stressed revenue, utilisation, horizon).
- Utilisation floats over time; each draw behaves like a small RCA slice.
- Better names, more data, more diversification → treat as lower risk than one-off RCAs.

Pricing guideline:

- Tier A line: **6% APR** target.
- Tier B line: **8% APR**.
- Tier C line: **10–12% APR** (but try to reserve 12% for genuinely noisy, risky books).

Borrowers get:

- Better pricing for sticking to a relationship product (line) and routing multiple YTs / revenue streams into it.
- A simpler UX: “Your line is 100k at 8% APR; here’s your monthly minimum if fully drawn.”

You still structure each draw as an internal YT slice (for Exponent/PT–YT bookkeeping), but user sees a single line product.

### 4.3 Relative pricing: “higher %” on one-off RCAs

Putting it together:

- **One-off RCAs**:
  - Slightly higher fee per unit time,
  - Very flexible, per-stream,
  - Good for Pump.fun bursts, single campaigns, invoices.

- **RRCLs**:
  - Better APR,
  - Require more history, K-factors (tier A/B), and more robust revenue streams,
  - Good for MetaDAO cohort, more mature apps, multi-month creator income.

This matches your intuition: **sell a single YT slice → more expensive; aggregate into a revolving facility → cheaper**.

---

## 5. ARR math: what does $10m look like?

Assume you keep average **borrower APR ≈ 9–10%**, LPs get **4–5%**, and attn’s net spread is:

- Protocol spread ≈ **4–5%** on average deployed credit.

Then:

- \( \text{ARR}_{\text{attn}} \approx \text{Deployed} \times \text{spread} \).

To reach **$10m ARR** to attn on a stable basis:

- If spread = 4% → need **$250m** average deployed.
- If spread = 5% → need **$200m** average deployed.

Given MetaDAO + Pump.fun alone are unlikely to exceed **$20–30m** deployed in the near term, you should think of:

- **Phase 1** – prove product/credit with:
  - MetaDAO cohort (treasury-backed + early revenue),
  - Pump.fun + similar creator flows (short-tenor RCAs),
  - a few other Solana-native revenue verticals (DEX fees, infra).

  Realistic target: **$10–30m deployed**, yielding **$0.4–1.5m ARR** at 4–5% spread.

- **Phase 2** – expand to:
  - EVM projects via wrapped attn vaults,
  - B2B SaaS-like revenues,
  - card/BNPL platforms as B2B borrowers (entity-level credit behind their consumer products).

  Target: **$50–100m deployed**, **$2–5m ARR** to attn.

- **Phase 3** – if you become the default revenue-credit engine across ecosystems:
  - Dozens of major protocols / platforms integrating attn as wholesale lender.
  - Aggregated deployed **$200m+**, enabling **$8–10m+ ARR**.

The key point: **$10m ARR** is a Phase-3 outcome that requires **being plugged into multiple big revenue pipes**, not just MetaDAO and Pump.fun.

---

## 6. Distribution and competition vs Avici, Krak, etc.

You are correctly worried that:

- Avici, Krak, and other neobanks / card players might **build their own credit** for their primary users.
- attn risks becoming **“last resort lender”** if those platforms vertically integrate credit.

There are three answers here:

### 6.1 Pick verticals where they are unlikely to compete directly

- **MetaDAO**:
  - Onchain governance, Squads treasuries, Futarchy, etc.  
  - This is idiosyncratic; a Kraken or Avici is unlikely to build “MetaDAO-specific revenue + treasury credit” infra.

- **Pump.fun** and similar high-velocity onchain creator flows:
  - Regulatory and reputational risk is high, as Le Monde and others have noted .  
  - Many retail-facing neobanks may not want direct exposure to this segment.
  - You can be a **specialist, risk-aware lender** here, with narrow, well-defined exposure limits.

- **Narrow B2B ecosystems**:
  - RPCs, infra providers, wallets with clear onchain revenue PDAs.
  - This is bespoke, small but high-margin. Generalist neobanks are unlikely to bother.

If you anchor yourself in these “weird but high-signal” segments first, you become **the default specialist**.

### 6.2 Offer to be the wholesale engine, not the UX

Position attn as:

- A **B2B revenue-credit rail** under Avici/Krak/Slash, not a competing consumer app.

Examples:

- Avici / Krak can:
  - Keep all **consumer credit risk** (overdrafts, personal lines) for now.
  - Use attn only for **entity-level credit** to:
    - high-trust DAOs,
    - fintech partners,
    - ecosystem projects whose onchain revenue attn underwrites.

- You provide:
  - limit sizing,
  - coverage tests,
  - PT/YT and attnUSD infrastructure,
  - backstop capital.

They get:

- An **off-balance-sheet** way to offer deeper credit to key B2B / community partners without re-building your infra.

You can further sweeten distribution with:

- Revenue-sharing on spread or protocol fees.
- White-label endpoints (“/revenue-credit-limit”) so they never need to show attn branding.

### 6.3 Make attnUSD a useful asset *for them*

If attnUSD is:

- A credible, low-vol, revenue-backed USD share token,
- With open analytics and short average duration,

then:

- Avici-style DAOs, Krak treasury desks, MetaDAO treasuries etc. can:
  - hold attnUSD as a **yield sleeve**,
  - or use it as **collateral** elsewhere,
  - which creates pull for your product.

Distribution then looks like:

- “We will underwrite your key B2B partners’ revenues”  
  + “You can park excess treasury or savings in attnUSD with known duration and risk.”

This is closer to **wholesale funding + structured credit** than retail lending; that is a harder segment for those teams to internalise, and therefore more defensible for you.

---

## 7. How hard to push Pump.fun, practically?

Given the numbers:

- Creator rewards already in **tens to hundreds of millions per year**.
- Realistic outstanding capacity for you, at modest penetration, is **low- to mid-single-digit millions**.

Pump.fun should be treated as:

- A **high-velocity, high-visibility wedge** into the creator economy:
  - lots of small RCAs,
  - fast data feedback,
  - good story (“we advance against live revenue, not vibes”).

- Not the entire business:
  - Even an aggressive Pump.fun vertical probably tops out at **$5–10m deployed** without over-concentration and regulatory headaches.

Product shape there:

- **Primary**: very short-tenor RCAs against specific upcoming rewards:
  - durations 7–30 days,
  - fee schedule consistent with 8–12% APR equivalent on 30–90d,
  - internal cap on ultra-short APR.

- **Secondary**: for a few top-tier, long-running creators:
  - a small **RRCL** sized off trailing 90–180 days of rewards,
  - at 6–8% APR,
  - with tight utilisation and line size caps.

This gets you:

- Useful TVL + ARR,
- A clean narrative (“we bank real onchain income, even in chaotic segments”),
- Without needing Pump.fun to carry your entire TVL story.

---

## 8. Summary

- **Borrower pricing**: keep headline APRs around **6 / 8 / 12%** by tier for normal tenors; micro RCAs can be fee-based with internal APR guardrails.
- **MetaDAO**: treasury-driven credit per project is **$50–150k**, giving **$2–10m** deployed if you have 50–100 active borrowers. Useful, but small.
- **Pump.fun**: creator rewards are **tens–hundreds of millions per year**; realistic outstanding capacity from short-tenor RCAs is **a few million**, maybe **up to ~5–10m** at aggressive adoption.
- **$10m ARR** requires **$200–250m average deployed** at a **4–5% protocol spread**; that is a **Phase-3** target across multiple chains and verticals, not just MetaDAO + Pump.fun.
- **Distribution vs neobanks**: treat attn as a **wholesale revenue-credit engine**, not a consumer app, and target weird/high-signal B2B and creator niches first where they are unlikely to compete.
- **Pump.fun strategy**: push it hard as a **showcase vertical for cash advances**, but plan the core business around broader **B2B, launchpad, and protocol revenue** lines where ticket sizes and stability are higher.
