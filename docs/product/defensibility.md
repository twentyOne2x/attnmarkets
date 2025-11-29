# attn.defensibility – Aggregator Risk, Distribution, and Partnerships

## 0. Purpose

This note formalises:

- The defensibility concerns around aggregators (Avici, bank-like apps, payroll, card processors).
- How much of attn’s stack is realistically copyable.
- Where moats can exist in practice.
- Whether attn should also work directly with merchants (e.g. watch BNPL) rather than only through aggregators.
- How legal structuring and contracts should be used (and not over-relied on).

The baseline assumption is:

> Any strong aggregator (Avici-like) can, given sufficient time and resources, replicate a narrow, internal version of attn’s functionality for **its own vertical**. The design problem is to make that option strictly worse, in expected value and complexity, than remaining plugged into attn.

---

## 1. Threat model

### 1.1 What aggregators like Avici already “have to” build

For an Avici-style product (card + payroll + SME banking):

- **Regulatory burden**: already taken on to run:
  - card issuing / BIN sponsorship,
  - KYC/KYB,
  - AML/CTF,
  - compliance around holding deposits / flows.
- **Offchain and identity data**:
  - KYC on individuals and SMEs,
  - employment data,
  - income/payment histories.
- **Onchain / custody infra**:
  - self-custody / MPC / accounts,
  - chain integration and indexing is not the hard part.
- **Revenue volatility models**:
  - for consumer & SME risk scoring, they will eventually need:
    - income volatility,
    - employer stability,
    - card spend patterns,
    - payroll reliability.

In other words, a lot of **data and regulatory work** needed for credit is on their roadmap regardless of attn.

### 1.2 What is copyable

For a single aggregator vertical (e.g. “Avici card/payroll credit”):

- Squads + PDA custody patterns are public.
- Exponent-style PT/YT infra is public.
- “RCA with coverage tests + line sizing + APR bands” can be re-implemented.
- External capital can be raised directly from:
  - credit funds,
  - family offices,
  - DeFi LPs willing to fund a branded pool.

Given a 12–24 month horizon and enough motivation, an Avici-like partner can:

- Build a **simple RCA abstraction** for its merchants/employers.
- Implement a **basic limit sizing formula**.
- Raise **dedicated credit capital** off its own brand.
- Use credit as a **loss-leader** to drive and retain users, even if P&L is mediocre.

Therefore, it is unsafe to assume:

- “Avici will never rebuild this.”
- “Being the only infra provider in that vertical is permanent.”

---

## 2. Strategic positioning: what game is attn actually playing?

Given that narrow vertical clones are feasible, attn’s realistic position is:

- **Not**: “own X vertical forever.”
- **Instead**:
  1. Be the **go-to revenue-backed credit infra partner** for:
     - early and mid-stage card/payroll/banking-like products,
     - new stables, debit cards, and money apps on emerging chains.
  2. Extract:
     - protocol fees,
     - credit data,
     - portfolio diversification,
     - brand and distribution,
     while the partner is in the phase where outsourcing infra makes sense.
  3. Accept that:
     - some partners will eventually internalise part of the stack,
     - attn must have:
       - other verticals,
       - other partners,
       - and independent merchant/protocol relationships.

Therefore, defensibility is **relative and dynamic**, not absolute. The core levers are:

- Risk + capital edge.
- Multi-vertical diversification.
- Depth of integration.
- Contractual and economic alignment.

---

## 3. What is actually hard (and can be a moat)

Even if Avici builds revenue models, KYC, and custody, there are still hard parts that attn can specialise in.

### 3.1 Risk and portfolio management across verticals

attn will see:

- MetaDAO treasury and revenue behaviour,
- pump.fun creator earnings and defaults,
- onchain B2B (RPC, infra, wallets),
- card/payroll/BNPL flows across multiple partners,
- watch and high-ticket BNPL,
- future verticals (NFT infra, DePIN, etc.).

This allows attn to build:

- Cross-vertical:
  - PD/LGD estimates,
  - correlation structure,
  - stress scenarios (e.g. “memecoin + DeFi collapse and its impact on card/payroll clients that are crypto-heavy”).
- A **portfolio optimisation layer**:
  - sizing risk per vertical and per partner,
  - controlling concentration limits,
  - calibrating capital deployment.

An Avici-like partner focusing solely on its own vertical:

- will have a **narrower** risk dataset,
- will likely require:
  - higher spreads to achieve the same loss-adjusted return,
  - or accept lower risk-adjusted returns for LPs.

### 3.2 Capital formation and structuring

attn’s job is to:

- Aggregate LPs (attnUSD, vaults, external credit funds).
- Offer:
  - senior / mezz / first-loss tranching,
  - strategy-specific vaults (pump vault, MetaDAO vault, card/payroll vault).
- Provide:
  - transparent reporting,
  - risk metrics,
  - and consistent underwriting frameworks.

For a partner, spinning up:

- capital stack,
- tranching logic,
- reporting infrastructure,

is a **non-trivial multi-year effort**, especially if their focus is product UX and distribution.

If attn can consistently be:

- the **cheapest and cleanest source** of revenue-backed credit capital for these partners,
- at scale,

then even if they *could* reimplement, it makes less sense economically.

### 3.3 Product speed and composability

attn can position as:

- the first place where new credit constructs appear:
  - watch BNPL with tranching and partial retailer risk,
  - pump.fun advance lines,
  - treasury-backed lines for launchpad DAOs,
  - invoice-style factoring for specific B2B flows.

If the cadence is:

- attn prototypes and runs these products,
- partners plug in when ready,
- attn iterates based on multi-partner feedback,

then the gap between attn and any single partner remains material.

---

## 4. Distribution strategy: aggregators **and** direct merchants

The question:  
> Should attn work with both payroll/banks (Avici-like) and merchants (watch BNPL) so attn owns some direct business relationships?

Recommended answer: **yes, explicitly.**

### 4.1 Why direct merchant relationships matter

1. **Independence from any single aggregator**

   - If Avici (or any other partner) cuts attn out, attn still holds:
     - direct lines to watch retailers,
     - direct relationships with B2B infra,
     - direct MetaDAO / pump.fun exposure.
   - This preserves TVL, brand, and deal flow.

2. **Bilateral bargaining power**

   - If a watch retailer uses:
     - Avici for card / checkout,
     - and attn for BNPL,
   - both Avici and the retailer have a reason to keep attn in the loop:
     - Avici to integrate BNPL more deeply at checkout,
     - the retailer because attn is the credit engine.

3. **Brand and reference accounts**

   - High-profile merchants (watches, luxury, major onchain infra clients) are independent reference clients:
     - “attn powers BNPL for X,”
     - “attn provides working-capital lines to Y infra project.”
   - This strengthens attn’s position when negotiating with aggregators.

### 4.2 Working with both

For each major aggregator class:

- **Payroll / banks / card apps (Avici, Slash, bank-like products)**  
  - Provide:
    - entity-level credit lines,
    - payroll float,
    - merchant lines via their distribution.
  - Let them control:
    - consumer UX,
    - KYC/KYB,
    - card and local fiat rails.
  - attn focuses on:
    - revenue-based underwriting,
    - capital and risk.

- **Merchants (watch BNPL, high-ticket retail, specific SaaS vendors)**  
  - Offer:
    - BNPL facilities,
    - working-capital lines,
    - customised risk-sharing structures (e.g. first-loss by merchant).
  - Integration:
    - directly to merchant systems,
    - optionally via aggregator rails (Avici card, Slash business account).

This two-sided approach ensures:

- Attn is not solely dependent on aggregators.
- Attn has firsthand merchant/protocol data that reinforces risk models.

---

## 5. Pricing and the “internalisation threshold”

The worry:

> If attn’s fee is high enough, partners will internalise the feature.

This is structurally correct. There is a **threshold** beyond which:

- The present value of “building it myself” exceeds
- The present value of “keep paying attn’s share over time.”

Design guideline:

- For any major aggregator partner:
  - ensure that the **incremental economics from using attn** are clearly superior to:
    - a realistic internal replication cost,
    - given their focus and constraints.

Concretely:

- Let:
  - \( r_b \) = borrower APR on the line,
  - \( s_p \) = attn’s share of gross fees,
  - \( s_{partner} \) = partner share = \( 1 - s_p - s_{LP} \),
  - \( s_{LP} \) = LP share.

- Internalisation becomes attractive when, over a realistic horizon \( H \), the partner’s **NPV of “keep paying attn”** outstrips:
  - expected **NPV of building an internal book** minus:
    - cost of capital for that book,
    - risk and loss variance,
    - engineering and operations cost,
    - regulatory / capital cost.

attn cannot perfectly model this, but as a heuristic:

- **Keep attn’s share “thin but meaningful” at the aggregator level**:
  - enough to:
    - fund risk, engineering, governance, and protocol growth,
    - signal a strong business,
  - but not so large that internalisation is obviously profitable.

This suggests:

- For aggregator-facing lines:
  - attn’s fee share might be **lower** than on more fragmented verticals like pump.fun advances,
  - relying more on:
    - volume,
    - and cross-vertical diversification,
    than on per-dollar margin.

---

## 6. Legal structuring and contracts

The question:

> Does attn need strong legal commitments so that breach of contract / abandoning the partnership would cost a lot?

Legal instruments can **slow down** or **increase the cost of** partner exit, but cannot:

- prevent eventual internalisation at scale,
- or force a partner to send new business.

Recommended approach:

### 6.1 What is realistic and useful

1. **Termed commercial agreements**
   - Multi-year contracts (e.g. 2–4 years) with:
     - minimum notice periods for termination (e.g. 6–12 months),
     - clear SLAs and responsibilities.

2. **Volume commitments / prioritisation**
   - For some products:
     - minimum routing commitment (e.g. “for product X, partner routes first Y% of eligible volume to attn”),
     - with:
       - volume-based rebates,
       - or pricing tiers.

3. **Early-termination fees**
   - If attn invests materially in custom engineering or integration:
     - include a cost-recovery or early-termination fee,
     - especially in the first years of the relationship.

4. **Rights of first refusal / negotiation**
   - ROFR on:
     - certain credit products,
     - new geographies or segments,
   - so that if the partner wants to launch a new credit module, attn has the first shot.

5. **Governance / equity-like alignment**
   - For very strategic partners:
     - small equity stake or token allocation,
     - board observer / advisory arrangement,
     - revenue-sharing on protocol growth.
   - This aligns long-term incentives beyond a single product.

### 6.2 What is overkill or risky

- **Highly restrictive non-competes**:
  - Large players and fast-growing startups will resist clauses that:
    - forbid them from building any internal credit,
    - or from using other credit providers in any form.
- **Attempting to “lock in” consumer credit**:
  - Forcing a partner to route all consumer credit via attn, irrespective of regulation or economics, is likely unrealistic and potentially creates legal risk for attn.

Contracts should **formalise economics and timelines**, not try to outlaw internal build completely.

---

## 7. Consumer credit vs entity-level credit

Given the regulatory and operational complexity of consumer lending:

- attn should **prefer entity-level exposure**:
  - employer / merchant / platform credit,
  - revenue-backed lines to businesses,
  - BNPL receivables held at the merchant/platform level.

Let:

- Avici / Slash / similar apps:
  - hold the consumer relationship,
  - manage:
    - consumer KYC,
    - dispute resolution,
    - regulatory compliance.
- attn:
  - funds and underwrites the **entity-level receivables**:
    - merchant BNPL receivables,
    - payroll float for employers,
    - wholesale lines to the platform itself.

This keeps attn:

- more defensible as infra (less front-line regulatory exposure),
- somewhat harder to displace (platform must replicate entire entity-level portfolio management stack).

If consumer direct exposure ever becomes necessary for scale, it should be:

- through carefully ring-fenced vehicles,
- in limited geographies,
- with specialist legal and compliance resources.

---

## 8. Design principles for defensibility

Summarising the operating principles that fall out of all this:

1. **Assume narrow clones are feasible**
   - Any strong aggregator can rebuild “just enough attn” for its own vertical within 1–2 years if properly motivated.

2. **Play a multi-vertical, multi-partner game**
   - MetaDAO,
   - pump.fun,
   - onchain B2B,
   - card/payroll,
   - watch BNPL and high-ticket retail,
   - future verticals.
   - No single relationship should define attn’s existence.

3. **Be the specialist risk-and-capital engine, not the front-end**
   - Focus on:
     - diversified portfolio construction,
     - revenue-based underwriting across multiple ecosystems,
     - capital formation and tranching.

4. **Treat aggregators as powerful, but not permanent, distribution**
   - Obtain:
     - TVL,
     - fees,
     - data,
     - and credibility,
   - while they genuinely need infra,
   - and be ready for some to internalise later.

5. **Maintain direct merchant and protocol relationships**
   - Watch BNPL merchants,
   - infra and SaaS B2B,
   - key DAOs and protocols.
   - These backstop TVL and give attn independent leverage.

6. **Use contracts as brakes, not walls**
   - Term, volume commitments, ROFR, termination fees, and rev-sharing:
     - slow down exit,
     - make cooperation more attractive,
     - but do not create artificial monopolies.

7. **Price with an eye on the internalisation threshold**
   - Avoid take rates that obviously justify a partner rebuilding everything.
   - Be thinner on aggregator-facing lines, richer on fragmented, high-friction verticals (like pump.fun advances).

---

## 9. Name and status of this doc

**Name:** `attn.defensibility – Aggregator Risk, Distribution, and Partnerships`  
**Status:** Internal design note for strategy, to be kept in sync with:

- TVL & ARR planning (`attn.markets – TVL & ARR Planning`),
- BNPL/watch risk-sharing docs,
- attnUSD portfolio and LP materials.

This doc should be revisited after the first 1–2 major aggregator integrations (e.g. Avici / Slash) once real-world behaviour and bargaining dynamics are observed.
