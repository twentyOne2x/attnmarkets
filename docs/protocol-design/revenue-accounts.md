# Revenue Accounts: Generalized Stake Accounts for Cashflows

## 0. Purpose and Scope

This document defines a Solana-native revenue primitive that generalizes Solana stake accounts from validator rewards to arbitrary on-chain cashflows.

The goals:

* Reuse the mental model and mechanics of the Solana Stake Program.
* Represent arbitrary product/protocol revenue as stake-like positions.
* Make revenue positions composable into:

  * Fungible/non-fungible claims.
  * Yield-stripped PT/YT instruments.
  * Credit products (loans, cash advances, credit lines) with programmatic seizure.

The design is Solana-oriented but conceptually portable.

---

## 1. Relationship to Solana Stake Accounts

This design is explicitly derived from the Solana Stake Program. It keeps the same structure—system account, stake account, vote account, authorities, lifecycle—and swaps in “arbitrary revenue” for “validator rewards”.

### 1.1 Direct Concept Mapping

| Solana Stake Concept           | Revenue Account Concept                         |
| ------------------------------ | ----------------------------------------------- |
| Wallet (system account)        | Wallet / owner of revenue rights                |
| Stake Program                  | Revenue Program                                 |
| Stake account                  | RevenuePosition                                 |
| Vote account (validator)       | RevenueSource (product / protocol / asset)      |
| Delegated stake amount         | `shares` in RevenuePosition                     |
| Stake state (activating, …)    | RevenuePosition `state`                         |
| Inflation / fee rewards        | Incoming product/protocol cashflows (e.g. USDC) |
| Rewards credited to stake acct | Revenue credited to `accrued` for a position    |
| Staker authority               | `owner` (operational authority)                 |
| Withdraw authority             | `withdraw_authority` (economic authority)       |

Intuition:

* A **stake account** is “SOL locked into the Stake Program, delegated to a validator, accruing rewards.”
* A **revenue position** is “cashflow rights locked into the Revenue Program, delegated to a revenue source, accruing revenue.”

### 1.2 Lifecycle Mapping

Stake account lifecycle:

* `Uninitialized → Activating → Active → Deactivating → Inactive`.
* Only `Active` stake earns rewards.
* Inactive stake can be withdrawn or re-delegated.

Revenue position lifecycle:

* Same state machine:

  * `Uninitialized → Activating → Active → Deactivating → Inactive`.
* Only `Active` positions earn revenue from their `RevenueSource`.
* Inactive positions no longer accrue and can be withdrawn, repurposed, or used as “principal-only” objects.

### 1.3 Reward vs Revenue Accounting

Stake Program:

* Tracks total delegated stake to each validator (vote account).
* Mints inflation + fee rewards and credits them to stake accounts, based on stake weight and validator performance.

Revenue Program:

* Tracks `total_shares` for each `RevenueSource`.
* Tracks `global_index` (cumulative revenue per share).
* Applies index-based accounting so that each `RevenuePosition` accrues revenue proportional to its `shares`.

Everything else—authorities, state transitions, splitting/merging—is deliberately modeled after the Stake Program.

---

## 2. High-Level Concept

A **revenue account system** is a generalized staking system with:

* **RevenueSource**: the analogue of a vote account, representing a product/protocol that generates cashflows.
* **RevenuePosition**: the analogue of a stake account, representing a delegator’s share of that revenue.
* A **Revenue Program**: the analogue of the Stake Program, which:

  * Custodies revenue treasuries.
  * Distributes revenue proportionally to positions.
  * Enforces authorities and lifecycle.

On top of this base, we build:

* A **yield stripping layer**: producing PT/YT from revenue positions.
* A **credit layer**: loans and credit lines backed by those positions, with programmatic seizure of cashflows.

---

## 3. Revenue Program (Stake-Generalized Core)

### 3.1 Core Accounts

#### 3.1.1 RevenueSource (vote-account equivalent)

One `RevenueSource` per product/protocol/revenue stream.

Fields:

* `id`
  Unique identifier or PDA seed (e.g. `[b"source", product_id]`).

* `treasury_token_mint`
  SPL mint of the revenue token (e.g. USDC, SOL-wrapped).

* `treasury_token_account`
  SPL token account owned by the Revenue Program PDA; all revenue for this source must flow here.

* `total_shares`
  Sum of `shares` for all `Active` (and possibly `Activating`) positions.

* `global_index`
  Cumulative revenue per share (scaled integer), analogous to cumulative reward index.

* `config`

  * Optional warm-up/cooldown durations.
  * Fee parameters (protocol fee bps).
  * Allowed ingress programs.
  * Any per-source settings (cap, whitelists, metadata).

* `admin_authority` (optional)
  Address (multisig/DAO/PDA) allowed to update `config` and set ingress routes.

#### 3.1.2 RevenuePosition (stake-account equivalent)

One `RevenuePosition` per holder/share configuration.

Fields:

* `revenue_source`
  Pointer to `RevenueSource.id`.

* `owner`
  Operational authority (staker authority analogue): can change state, split, merge, assign.

* `withdraw_authority`
  Economic authority (withdraw authority analogue): can withdraw `accrued` and principal, if configured.

* `shares`
  Position’s share weight in the revenue stream. Equivalent to “delegated stake”.

* `state`
  Enum:

  * `Uninitialized`
  * `Activating`
  * `Active`
  * `Deactivating`
  * `Inactive`

* `last_index`
  Last seen `RevenueSource.global_index` at settlement.

* `accrued`
  Claimable revenue (in `treasury_token_mint`) not yet withdrawn.

* `metadata` (optional)
  Arbitrary data: labels, external IDs, etc.

### 3.2 Revenue Ingress and Routing

Revenue must flow into `RevenueSource.treasury_token_account`.

Ingress patterns:

* Product / protocol program sends a fixed percentage of each sale/fee to this treasury.
* Payment processor programs forward user payments to this treasury.
* Off-chain collection with periodic on-chain settlement to this treasury account.

Key property: the treasury’s owner is a PDA of the Revenue Program; no external authority can drain it except via program-defined instructions.

### 3.3 Index-Based Accounting (Lazy Rewards Generalized)

When new revenue `X` (in treasury tokens) is recognized for a `RevenueSource`:

1. Compute `delta_index = X * SCALE / total_shares`.
2. Update `RevenueSource.global_index += delta_index`.

Positions are updated lazily on interaction:

* On any interaction with a position (claim, state change, share change, split/merge):

  ```text
  delta = RevenueSource.global_index - position.last_index
  position.accrued += delta * position.shares / SCALE
  position.last_index = RevenueSource.global_index
  ```

This is equivalent to lazy reward settlement in many DeFi and staking systems and supports many positions efficiently.

### 3.4 Lifecycle and State Transitions

Reuse the stake lifecycle:

* `Uninitialized → Activating`
* `Activating → Active`
* `Active → Deactivating`
* `Deactivating → Inactive`

Configurable rules:

* `Activating → Active` after a warm-up period or immediately if `warmup_duration = 0`.
* `Deactivating → Inactive` after cooldown or immediately if `cooldown_duration = 0`.

Semantics:

* Only `Active` positions accrue new revenue.
* `Activating` and `Deactivating` give you delayed entry/exit semantics if desired (mimic stake warm-up/cooldown).
* `Inactive` can be:

  * Withdrawn (claim `accrued`, optionally reclaim shares/principal).
  * Used as a principal-only object for credit/yield stripping.

### 3.5 Instruction Set (Analogous to Stake Program)

Key instructions:

* `init_source`
  Create and initialize a `RevenueSource`. Set treasury mint, treasury account, config, admin.

* `configure_source`
  Update `config` and admin authority (subject to governance rules).

* `create_position`
  Create a new `RevenuePosition` with given `owner`, `withdraw_authority`, and optionally initial `shares`.

* `delegate_shares` / `assign_shares`
  Analogous to `delegate_stake`:

  * Assign a number of shares to a position for a specific `RevenueSource`.
  * Typically moves or locks a representation of revenue rights (see Section 4).

* `deactivate_position`
  Move from `Active` to `Deactivating`, starting cooldown.

* `reactivate_position`
  Move from `Inactive` back to `Activating` (if allowed by config).

* `settle_position`
  Apply index-based settlement (can be implicit inside other instructions).

* `claim`
  Transfer `accrued` to `withdraw_authority`.

* `split_position`
  Create a new `RevenuePosition` and move a subset of `shares` and proportional `accrued` to it.

* `merge_positions`
  Merge two positions with compatible authorities and source.

---

## 4. Representing Revenue Rights (Principal Layer)

The “principal” underlying a `RevenuePosition` can be represented in different ways, depending on how composable you want the system to be.

### 4.1 Internal Shares Only (Stake-Style)

Simplest: `shares` is internal state only.

* No separate SPL token exists.
* Transfers of rights are done by:

  * Changing `owner` / `withdraw_authority`.
  * Splitting/merging positions.

Pros:

* Minimal complexity.
* Maximum control by the Revenue Program.

Cons:

* Harder integration with external DeFi protocols that expect fungible tokens as collateral or LP assets.

### 4.2 Fungible SPL “revTOKEN” (Yield-Bearing Token)

Introduce an SPL token `revTOKEN` per `RevenueSource`:

* 1 `revTOKEN` = 1 share unit in that revenue stream.
* `revTOKEN.total_supply == RevenueSource.total_shares`.

Two design options:

1. **revTOKEN as canonical shares**

   * RevenueProgram mints/burns `revTOKEN` when:

     * Users deposit actual revenue-rights-bearing assets (NFTs, product keys, etc.).
     * Or admin mints supply corresponding to product rights.
   * `RevenuePosition.shares` becomes derived from `revTOKEN` held in the position account.

2. **revTOKEN as wrapped representation**

   * RevenueProgram maintains `shares` internally and optionally mints `revTOKEN` as a liquid wrapper.
   * revTOKEN holders can deposit revTOKEN into positions or other protocols.

This aligns with “yield-bearing token” standards: revTOKEN is the generalized “staked SOL”, and revenue accounts/positions are generalized stake accounts.

### 4.3 NFT-Based Product Rights

For 1-of-1 or discrete assets:

* NFT represents all future cashflows of a product.
* RevenueProgram:

  * Takes the NFT into custody.
  * Creates a `RevenueSource` and a “master” `RevenuePosition`.
  * Optionally fractionalizes into:

    * SPL revTOKEN, or
    * Multiple `RevenuePosition`s with different owners.

This pattern mirrors “NFT → fractional shares → revenue distribution”.

---

## 5. Yield Stripping Layer (PT/YT on Revenue Positions)

With revenue rights modeled stake-style, we add a **Stripper Program** that behaves like a generalized “yield stripping stake pool”.

### 5.1 Objective

Given a yield-bearing object (RevenuePosition or revTOKEN), produce:

* **Principal Token (PT)**
  Represents principal or residual rights at or beyond a maturity.

* **Yield Token (YT)**
  Represents the right to revenue generated within a defined period.

This enables:

* Selling future yield for upfront capital (cash advance).
* Trading yield and principal separately.
* Building yield curves / IR markets on top of revenue.

### 5.2 Inputs and Custody

The Stripper Program accepts:

* A `RevenuePosition` (with `Active` shares).
* Or a revTOKEN balance transferred into a Program-owned account.
* Or an NFT that indirectly maps to a revenue position.

On `strip`:

1. Transfer/lock the underlying:

   * If `RevenuePosition`: change `owner` and/or `withdraw_authority` to a Stripper PDA, or move it into a custody PDA account.
   * If revTOKEN: transfer to Stripper’s treasury/custody account.

2. Create a `StripInstance` record:

   * `underlying_reference` (position ID / revTOKEN mint / NFT ID).
   * `underlying_shares_or_amount`.
   * `maturity_timestamp`.
   * `pt_mint`, `yt_mint`.

3. Mint PT and YT SPL tokens to the user.

### 5.3 Revenue Handling

During the life of a strip:

* Underlying revenue accrues inside the Revenue Program as usual.
* Stripper Program periodically (or lazily) calls `settle_position` and `claim` on the underlying, routing all cashflows to a YT revenue treasury.

Rules:

* All revenue received before `maturity_timestamp` is claimable by YT holders pro rata by `yt_supply`.
* At or after `maturity_timestamp`:

  * PT holders can redeem PT to:

    * Reclaim the underlying position, or
    * Receive a specified residual payoff (e.g. remaining revenue or principal recovery).

Variants:

* Fixed-term PT/YT:

  * Clean separation between “yield until time T” and “principal at T”.
* Perpetual YT:

  * YT receives all future yield; PT only represents resale or protocol buyback rights.

### 5.4 Stripper Instructions

Key instructions:

* `strip`
  Inputs: underlying reference, shares/amount, maturity.
  Outputs: PT/YT SPL tokens.

* `claim_yield`
  Settle underlying; distribute treasury balance to YT holders.

* `redeem_PT`
  Burn PT; return underlying or pay residual.

* `close_strip`
  Clean up `StripInstance` when all PT/YT are redeemed and underlying is handled.

---

## 6. Credit Layer: Revenue-Backed Lending and Credit Lines

A **Credit Program** uses revenue positions, revTOKEN, and/or PT as collateral to provide loans and credit lines with programmatic seizure similar in spirit to “slashing” or re-delegation in staking.

### 6.1 Collateral Objects

Allowed collateral types:

* Direct `RevenuePosition` (principal + yield).
* revTOKEN (fungible claim on revenue).
* PT (principal leg from stripping).
* Possibly YT (for specialized structured products, though riskier).

Core requirement: the Credit Program must be able to:

* Control or custody collateral (authority over positions/tokens).
* Redirect or liquidate revenue rights on default.

### 6.2 Simple Collateralized Loan

**Loan account**:

* `borrower`
* `collateral_ref` (pointer to `RevenuePosition`/revTOKEN/ PT).
* `principal_borrowed`
* `interest_rate` or `interest_index` (for variable rate).
* `accrued_interest`
* `state` (`Active`, `Repaid`, `Defaulted`, `Liquidated`).

Workflow:

1. **Collateral deposit**
   Borrower deposits collateral:

   * Transfer revTOKEN/PT to a Credit PDA, or
   * Assign `owner`/`withdraw_authority` of a `RevenuePosition` to the Credit PDA.

2. **Loan origination**
   Credit Program computes a conservative collateral value and LTV, then allows borrowing in a liquid asset (e.g. USDC).

3. **Interest accrual**
   Debt grows per block/slot/time according to the interest model.

4. **Repayment**
   Borrower sends USDC to repay principal + interest.

5. **Liquidation**
   If health factor < 1 or other default conditions, Credit Program:

   * Transfers collateral to liquidator.
   * Or permanently reassigns revenue position/rights.

### 6.3 Revenue-Based Cash Advance (Factor-Based)

Structure similar to revenue-based financing:

* `advance_amount` (cash given to borrower).
* `repayment_target = advance_amount * factor` (e.g. factor = 1.2).
* `repaid_amount`.
* `revenue_split` (percentage of each incoming revenue that goes to lender).

Workflow:

1. Borrower pledges a `RevenueSource`’s “master position” or a designated `RevenuePosition`.
2. Credit Program configures the Revenue Program to:

   * Split each revenue event between borrower and lender according to `revenue_split`.
3. `repaid_amount` accumulates from lender’s share.
4. Once `repaid_amount >= repayment_target`:

   * Control of the revenue position reverts to borrower.
   * Revenue split reverts to 100% borrower (or configured baseline).

This is mechanically enforced via Revenue Program + Credit Program, with no reputational assumptions needed.

### 6.4 Credit Line Backed by Revenue

A credit line generalizes the loan to a re-usable facility.

**CreditLine account**:

* `borrower`
* `collateral_set` (list of `RevenuePosition`/revTOKEN/PT references).
* `credit_limit` (max principal).
* `current_debt`
* `rate_model` (e.g. utilization-based).
* `auto_sweep_config` (what fraction of revenue auto-serves debt).

Mechanics:

* Borrower draws from available credit up to `credit_limit`, subject to LTV.
* Revenue Program sends a portion of ongoing revenue from collateral sources to the Credit Program, which:

  * First covers accrued interest.
  * Then reduces principal.
* If revenue falls or borrower overdraws:

  * Health factor declines.
  * Credit Program can:

    * Increase `auto_sweep` to 100% of revenue, or
    * Liquidate by transferring collateral.

This yields a non-KYC, non-reputation credit line backed purely by enforceable cashflows.

### 6.5 Seizability and Enforcement

To make seizure guaranteed:

* Revenue treasuries are owned by the Revenue Program PDAs, not user wallets.
* Collateral positions (or their authorities) are controlled by the Credit Program PDAs.
* Default logic is purely on-chain:

  * If conditions met, Credit Program can reassign `owner`/`withdraw_authority` of `RevenuePosition` or transfer revTOKEN/PT to liquidators without off-chain steps.

This is the direct analogue of the ecosystem’s trust in the Stake Program to enforce delegation and reward rules.

---

## 7. Integration Patterns

### 7.1 Multisig / DAOs (e.g. Squads)

Typical configurations:

* `RevenueSource.admin_authority` is a Squads multisig or DAO-controlled PDA.
* `withdraw_authority` of master positions is a multisig.
* PDAs for Revenue/Credit Programs can be signers in multisig setups via `invoke_signed`.

This allows:

* Human governance over configuration, risk parameters, and upgrades.
* Programmatic enforcement for all economic flows (revenue distribution, loan repayment, liquidation).

### 7.2 External Yield Infrastructure

If there are existing PT/YT and AMM protocols:

* Expose revTOKEN as a “yield-bearing token” under their standard.
* Use their stripping and AMM layers instead of or in addition to your own Stripper Program.
* Credit Program can then treat their PT/YT as collateral types.

The abstraction layers remain:

1. Revenue Program = stake-generalized core.
2. Stripping = PT/YT layer.
3. Credit = lending/credit-line layer.

---

## 8. Implementation Notes (Solana)

### 8.1 PDAs

* `RevenueSource` PDA:

  * Seeds: `[b"source", product_id]`.
* `RevenuePosition` PDA:

  * Seeds: `[b"position", source_id, owner, nonce]` or random user-chosen seed.
* Treasury token account:

  * Seeds: `[b"treasury", source_id]`.

### 8.2 Security

* Ensure only the Revenue Program PDA can own treasury accounts.
* For each instruction:

  * Validate all accounts and program IDs.
  * Prevent unauthorized changes of `owner`/`withdraw_authority`.
* For Credit Program:

  * Collateral must not be withdrawable while loans/credit lines are active.
  * All state changes must keep LTV and health constraints satisfied or lead to immediate liquidation.

### 8.3 Fees and Incentives

* Protocol fee bps can be taken:

  * On revenue inflows (skim fee before index update).
  * On claims (fee on `accrued` withdrawals).
  * On loan origination, yield stripping, or liquidation bonuses.

* Incentives for:

  * Liquidators (bonus for executing liquidations).
  * Oracles/keepers (if any) for calling settling/claim functions, unless fully user-triggered.

---

## 9. Open Design Choices

Key trade-offs to decide per implementation:

* **Shares vs Tokens**

  * Internal-only shares vs fully fungible revTOKEN.
* **Per-source vs Pooled**

  * One `RevenueSource` per product vs pooled sources per category/protocol.
* **Stripping model**

  * Fixed-maturity PT/YT vs perpetual yield tokens.
* **Permissionlessness**

  * Who can create new `RevenueSource`s?
  * Who can list new revenue assets in stripping and credit layers?

Each choice affects complexity, UX, risk surface, and composability.

---

## 10. Summary

* Revenue accounts are a direct generalization of Solana stake accounts:

  * `RevenueSource` ↔ vote account (validator).
  * `RevenuePosition` ↔ stake account.
  * `Revenue Program` ↔ Stake Program generalized from SOL rewards to arbitrary SPL revenue.

* On top of this stake-like core, a yield stripping layer produces PT/YT instruments, and a credit layer uses revenue positions and PT as collateral for loans, cash advances, and credit lines with programmatic seizure.

The result is a cohesive, stake-inspired architecture for non-KYC, non-reputation credit backed purely by enforceable on-chain cashflows.
