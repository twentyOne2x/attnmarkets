<!-- file: ecosystem-peaq-hyperscale-avici-pye.md -->

# Ecosystem Map: peaq, Hyperscale, Avici, Pye, and attn

This document summarises four external projects and how they relate to attn:

- **peaq** – DePIN / “Machine Economy” L1.  
- **Hyperscale** – AI-driven hedge fund + fast Web3 fund.  
- **Avici** – Solana-based distributed internet banking.  
- **Pye** – stake-account PT/RT markets on Solana.

It focuses on overlaps in problems, design patterns, and potential collaboration or differentiation.

---

## 1. peaq – Machine Economy Revenues

### 1.1 What peaq is

peaq is a layer-1 blockchain explicitly positioned as “the Machine Economy Computer”:

- Hosts DePIN (decentralised physical infrastructure) apps and device networks.
- Targets “millions of devices, billions of data points” owned by communities.:contentReference[oaicite:3]{index=3}  

In practice:

- Devices (cars, sensors, robots, etc.) plug into peaq-based apps.
- Those apps pay out on-chain rewards to device owners/operators.
- More than 50 DePIN projects across many industries are reportedly building on peaq.:contentReference[oaicite:4]{index=4}  

This yields **machine-level revenue streams**: predictable on-chain cashflows tied to physical infrastructure and services.

### 1.2 Relation to attn

peaq is a natural **upstream revenue source** for attn.

- **Attn use case:** “Machine Revenue Bonds”
  - Treat each DePIN app, subnet, or fleet as a revenue stream.
  - Route that revenue into a CreatorVault (directly on peaq or via a bridge).
  - Wrap into SY, then PT/YT, exactly as for Solana app revenues.
  - Offer:
    - advances against future machine earnings,
    - revenue bonds on device fleets,
    - diversified YT products across many DePIN projects.

- **Benefits for peaq-based projects**
  - Capex financing:
    - Operators can pre-sell yield (YT) to finance more devices.
  - Risk transfer:
    - Revenue variability can be offloaded to yield buyers.
  - Better analytics:
    - attn’s indexer can expose revenue histories per fleet or subnet.

- **Differences from attn’s base case**
  - Attn initially focuses on **Solana** apps and creators.
  - peaq’s device-level flows are often more granular and physical-world dependent.

In short:

- peaq produces machine revenues.
- attn can be the layer that securitizes those revenues into PT/YT and bundles them into attnUSD-backed products.

---

## 2. Hyperscale – Capital and Liquidity

There are two relevant faces of “Hyperscale”:

1. **Hyperscale Fund / Hyperscale DAO** – Web3-focused, ultra-fast capital allocator.:contentReference[oaicite:5]{index=5}  
2. **Hyperscale’s hedge fund side** – AI-driven hedge fund investing across DeFi and infra (Uniswap, Aave, Curve, MakerDAO, Solana, Jito Labs, and more).:contentReference[oaicite:6]{index=6}  

### 2.1 What Hyperscale does

- **Web3 funding:**  
  - “Ultra-fast funding” for early Web3 projects.
  - Crypto-native teams can apply in ~15 minutes and receive a funding decision within days.:contentReference[oaicite:7]{index=7}  

- **Hedge fund / investment arm:**  
  - AI-driven hedge fund leveraging data to allocate capital.:contentReference[oaicite:8]{index=8}  
  - Portfolio includes:
    - DeFi blue chips (Uniswap, Aave, Curve, MakerDAO, PancakeSwap, Ondo).
    - L1/L2 networks (Solana, Avalanche, Mantle, Blast).
    - Infra projects (Jito Labs, Render Network, Ocean, etc.).:contentReference[oaicite:9]{index=9}  

They explicitly position themselves as:

> “Training the most effective capital allocator in the world” and “deploying ultra-fast and universally accessible capital.”:contentReference[oaicite:10]{index=10}  

### 2.2 Relation to attn

Hyperscale is a potential **downstream capital partner** for attn:

- **As an investor in attn**
  - attn is infra + fixed-income for app/creator revenues.
  - Hyperscale invests in exactly such crypto infra and protocols.
  - They can provide seed or growth funding, plus portfolio synergies.

- **As a systematic LP / yield buyer**
  - attn creates YT and PT tranches across many revenue streams.
  - Hyperscale’s hedge fund stack can:
    - ingest attn indexer data,
    - train models on revenue histories and default rates,
    - price and buy YT/PT as uncorrelated yield relative to other DeFi assets.

- **As a liquidity and market-making ally**
  - They already understand and hold positions in DEX, lending, and yield protocols.
  - Hyperscale could:
    - provide initial liquidity in PT/USDC pools,
    - buy diversified YT baskets,
    - help tune pricing models for attnAdvance.

- **Differences from attn**
  - Hyperscale is primarily a **capital allocator and fund**.
  - attn is a **protocol** for revenue securitization and credit.
  - Hyperscale does not tokenize revenues; it invests in tokens and protocols that might.

Attn offers Hyperscale a new asset class (revenue bonds on apps/creators); Hyperscale offers attn capital, liquidity, and data-driven pricing.

---

## 3. Avici – Distributed Internet Banking

### 3.1 What Avici is

Avici DAO aims to build a **distributed internet banking infrastructure**:

- Purpose: replace central banks and traditional neobanks with onchain, self-custodial banking.:contentReference[oaicite:11]{index=11}  
- Current product:
  - Internet neobank:
    - instant virtual cards,
    - physical cards delivered globally,
    - self-custodial crypto-backed spending and ATM withdrawals.:contentReference[oaicite:12]{index=12}  
- Core ideas:
  - **Trust Score** – an onchain credit scoring system.:contentReference[oaicite:13]{index=13}  
  - Focus on **Solana** and “making wallets smarter”: programmable accounts that can encode policies, payroll, and credit logic.:contentReference[oaicite:14]{index=14}  
  - Long-term ambition: savings/mortgage vaults, onchain credit and mortgages for individuals and businesses.:contentReference[oaicite:15]{index=15}  

### 3.2 Shared problem space with attn

Both Avici and attn:

- Believe that **credit**, not just payments, is the missing piece of onchain finance.
- Aim to:

  - bring serious lending (mortgages, business loans, advances) onchain,
  - anchor decisions in auditable onchain data.

Both:

- Use Solana’s performance and programmability as a base.:contentReference[oaicite:16]{index=16}  
- Want fully onchain, transparent views into risk and solvency:
  - Avici: around savings/mortgage vaults and Trust Scores.
  - attn: around CreatorVault flows, PT/YT supplies, and StableVault composition.

### 3.3 Key differences from attn

- **Target borrower**
  - Avici: retail users and SMEs.
    - Salaried workers, freelancers, small businesses.
  - attn: apps, DAOs, token projects, and later possibly machine revenues.

- **Collateral / underwriting primitive**
  - Avici:
    - Trust Score built from:
      - income, assets, payroll, on/off-chain activity,
      - ZK-verified information where needed.:contentReference[oaicite:17]{index=17}  
    - Loans are undercollateralized or lightly collateralised; enforcement via:
      - payroll integration,
      - seizure of balances in Avici vaults,
      - interest rates and Trust Score penalties.
    - Debt “Jubilee” is part of the philosophy: rule-based forgiveness to stabilise cycles.:contentReference[oaicite:18]{index=18}  

  - attn:
    - Enforces hard custody over specific onchain **revenue streams** via CreatorVault and Squads multisig.
    - Tokenizes those revenues directly (SY → PT/YT).
    - Underwriting is at the **stream level**, not person level:
      - seasoning, LTV rules, waterfalls.

- **Tokenization boundary**
  - Avici:
    - Tokenizes governance and vault shares.
    - Does not tokenize individual salary/income streams into tradable PT/YT instruments.
  - attn:
    - Tokenizes *each* underwritten revenue stream into tradable PT/YT.

- **Role of forgiveness / policy**
  - Avici integrates policy & social concepts (Trust Score dynamics, Jubilee).
  - attn focuses on **mechanical revenue waterfalls**: sweeps pay principal/interest before residual to sponsor.

### 3.4 Relation to attn

- Avici is a **retail banking layer**; attn is a **revenue securitization layer**.
- Possible interaction:

  - Avici users who are creators or SMEs could:
    - route their business revenues through attn for structured financing,
    - then use Avici as their personal bank on top.
  - Avici’s Trust Score could be one signal into attn’s underwriting for certain small-business vaults.

But fundamentally:

- Avici = neobank + credit score for people.  
- attn = revenue bonds + credit for streams and apps.

---

## 4. Pye – PT/RT on Stake Accounts

### 4.1 What Pye is

Pye is a Solana protocol for managing and trading stake accounts:​:contentReference[oaicite:19]{index=19}  

- Extends native stake accounts with additional structures.
- Allows validators to issue staking products with custom commercial terms (fixed, variable yield).
- Introduces **Pye Accounts** and splits them into:
  - **PT** (principal token),
  - **RT** (reward token; YT analogue).

From their docs and blog:​:contentReference[oaicite:20]{index=20}  

- Stake accounts become tradable PT/RT instruments.
- RT trades based on forward-looking expectation of staking rewards.
- Holding both PT and RT replicates the stake account.
- Pye positions these as Solana-native “bond-like” and yield tokens for PoS staking.

### 4.2 Structural similarity with attn

Pye and attn share almost identical **mathematical structure**:

- Underlying:
  - Pye: stake account (SOL principal + rewards).
  - attn: revenue stream wrapped into SY.

- Decomposition:
  - Pye: stake account → PT (principal) + RT (rewards).
  - attn: SY → PT (principal leg) + YT (fee yield leg).

- Markets:
  - Pye: stake account PT and RT tradable via orderbooks and AMMs; stakers can:
    - sell future rewards,
    - trade principal without unstaking.:contentReference[oaicite:21]{index=21}  
  - attn: PT/YT similar, but applied to business/creator revenues instead of staking.

### 4.3 Differences from attn

- **Underlying asset**
  - Pye:
    - Underlying is SOL stake with **protocol-defined** yield (inflation + validator commission).
    - Risk is validator performance and protocol inflation changes.
  - attn:
    - Underlying is app/creator revenue with **business-defined** risk:
      - usage, fees, churn, migration, governance, etc.

- **Use case**
  - Pye:
    - Focused on turning Solana staking into a competitive, tradable fixed-income market.
    - Targets stakers and validators.:contentReference[oaicite:22]{index=22}  
  - attn:
    - Targets creator/app/DAO cashflows.
    - Adds credit products (advances, revenue-backed loans).

- **Enforcement**
  - Pye’s enforcement path:
    - stakes tied to validators and standard PoS rules.
    - no special control over external business revenues.
  - attn:
    - uses CreatorVault + Squads 2-of-2 to hard-wire fee capture and waterfalls.

### 4.4 Relation to attn

Pye is a **conceptual reference** for attn:

- It proves that:
  - splitting capital assets into PT (principal) and RT/YT (rewards) is viable on Solana,
  - markets can form around principal vs yield for fixed-income-like instruments.

attn extends this pattern from:

- “yield from staking” → “yield from app/creator revenues.”

Potential interactions:

- A future product where:
  - staked SOL revenues (Pye-style PT/RT) and app revenues (attn PT/YT) are combined into multi-source yield baskets.
- Shared infrastructure:
  - both protocols contribute to a broader Solana fixed-income ecosystem.

---

## 5. Summary

- **peaq**  
  - Produces machine-level DePIN revenues on its L1.  
  - Attn can securitize those revenues into PT/YT and integrate them into attnUSD portfolios.

- **Hyperscale**  
  - AI-driven hedge fund + fast Web3 fund.  
  - Natural investor and systematic LP for attn’s PT/YT and attnUSD.

- **Avici**  
  - Solana-based distributed internet bank for individuals and SMEs, with Trust Score and onchain credit.  
  - Shares the “onchain credit” thesis but does not tokenize revenues as collateral; focuses on retail and policy-driven risk (Jubilee).

- **Pye**  
  - PT/RT split of staking accounts on Solana.  
  - Provides a clear precedent for PT/YT style designs; attn applies the same pattern to app/creator revenues under stricter revenue custody.

Together, these projects define a broader landscape:

- **Revenue and work sources** (peaq, Solana apps/creators).  
- **Securitization and credit infrastructure** (attn, Pye for staking).  
- **Banking and UX layers** (Avici for retail).  
- **Capital and liquidity** (Hyperscale as fund/DAO).

Attn’s niche within this landscape is precise: it is the protocol that turns on-chain fee streams into revenue bonds and yield instruments – a missing fixed-income layer connecting raw revenue generation with sophisticated capital allocation.
