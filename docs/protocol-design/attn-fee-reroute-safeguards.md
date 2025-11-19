# Revenue Reroute Safeguards

**Goal.** Define how attn mitigates the risk that, after financing against revenues, a user shifts user flow to new contracts or a new token so the pledged revenue PDAs go quiet.

attn cannot force new revenues to appear. Loss is reduced via per-asset custody, restricted revenue sources, conservative underwriting, fast lockups, collateral, and—where warranted—legal covenants.

---

## 1) Platform specifics

### DAO-native launchpads and projects (e.g., MetaDAO)
- **DAO custody by design.** Projects route all **product revenues** and **ICO proceeds** to a DAO Safe. Token holders govern spend; founders cannot unilaterally drain the Safe.
- **Financing implication.** We treat the DAO Safe as the canonical receiver. Financing requires registering the Safe’s revenue PDAs and any product routers that feed it.
- **Residual risk.** Teams can deploy **new programs/contracts** that route to unregistered endpoints. Governance can enforce updates, but detection and covenants are still required.


### Pump.fun (per token; “creator rewards”)
- **Per-token setting.** “Creator rewards” recipients are set **per token** at launch; claims require the creator signer.
- **Per-token reassignment.** Later changes (e.g., CTO) are **per token**. There is no wallet-wide default.
- **Financing implication.** Each financed Pump token must be rotated to a **Squads 2-of-2 Safe** (user+attn) or a **CreatorVault PDA** **before funding**.
- **Residual risk.** A user can launch a new Pump token and steer activity there. The original token’s creator rewards can decay to zero.


---

## 2) Threat model

- **Reroute after financing.** Revenues were landing in registered PDAs; after closing, activity moves to fresh endpoints.
- **Endpoint spoofing.** UI/API points to alternate routers while the original PDA remains idle.
- **Partial migration.** Revenues split across multiple PDAs; only a subset is registered.

**Constraint.** attn cannot compel future revenues. Mitigate by custody, hard sources, monitoring, collateral, and covenants.

---

## 3) On-chain enforcement

1) **Authority rotation (per asset)**
- For Pump tokens, set the creator to **Squads 2-of-2** or a **CreatorVault PDA** before any advance/loan.
- For DAO projects, ensure the **DAO Safe** is the admin/payee for product routers before funding.
- Withdrawals remain single-signer when `locked = false`.

2) **Hard revenue sources**
- Persist a canonical list of **revenue PDAs** in the vault (stored today as `CreatorVault.allowed_fee_accounts`).
- `sweep_creator_fees(operation_id)` (naming legacy) accepts only these sources.

3) **Debt-first waterfall**
- While any position is open, set `locked = true`.
- Route `revenues → principal → interest → residual to user/DAO`.

4) **Idempotency and pause**
- Keeper instructions carry monotonic `operation_id`.
- Global and vault-level pause gates block writes.

5) **Seizure path**
- On default, keep `locked = true`; seize collateral per policy and continue sweeping registered sources until repaid.

6) **Multi-PDA registration**
- At onboarding, enumerate all PDAs/program accounts that emit revenues for the asset (creator rewards, product fees, ICO proceeds).
- For upgradable routers, require governance approval to add new sources to the registry **before activation**.

---

## 4) Underwriting and collateral

**Seasoning**
- Require `30–90` days of successful on-chain sweeps before first draw.

**Dynamic LTV**
- Compute LTV from a TWAP of trailing sweeps; margin call if `LTV > threshold_bps`.

**Reserves**
- Maintain `reserve_days` (e.g., `7–14`) of revenues in-vault before any user/DAO withdrawal.

**Collateral ladder**
- **Stables first.** USDC/USDe/attnUSD at par with conservative haircuts.
- **PT secondary.** Value at `min(AMM mid, TWAP)` with haircut; do not rely on PT alone to mitigate reroute risk.
- **Vesting team tokens.** Accept pledged/vesting allocations where unlocks stay in-program (e.g., held in Squads or CreatorVault) so we stay overcollateralized without requiring fresh assets.
- **Whitelisted majors/team float.** Take SOL or circulating team tokens that clear FDV/liquidity and governance checks; apply deeper haircuts and custody them in approved safes.
- **Performance bond.** Escrow stables `10–30%` of facility for larger lines.

**Example caps (vs 30d trailing swept revenues, annualized)**

| Facility size | Max LTV | Additional collateral |
|--------------:|--------:|-----------------------|
| ≤ $25k        | 25%     | none                  |
| ≤ $100k       | 20%     | stables 5% or whitelisted tokens 10% |
| ≤ $500k       | 15%     | stables 12.5% or whitelisted tokens 25% |
| > $500k       | 10%     | stables 20% or whitelisted tokens 40% |

`Whitelisted tokens` = PT, SOL, or team allocations (liquid or vesting) that meet stability, FDV, and custody requirements.

**DSCR floor**
- Require `sweeps_30d / scheduled_payments ≥ 1.2×`; cure or top-up on fail.

**Progressive disbursement**
- Fund in tranches gated by ongoing sweeps; halt on miss.

---

## 5) Covenants (enforceable)

- **Sweep cadence.** ≥1 sweep per `N` hours; grace then default.
- **Revenue floor.** 7/30-day average ≥ `floor_bps × baseline_30d`.
- **Successor assignment.** Any successor token or product router must set the **same Safe/PDA** as recipient within `T` days of first revenue; else default.
- **Negative pledge.** No new liens on registered revenue PDAs; no reroute; no admin rotation without consent.
- **Cross-default.** Default under any pledged asset defaults all facilities for the same user/DAO (by Squads membership set or legal entity).
- **Make-whole / early termination.** Starvation or early exit requires paying outstanding plus a make-whole fee.

---

## 6) Monitoring and default process

**Indexing**
- Track per-PDA inflows; compute 1d/7d/30d averages; detect gaps and decay.

**Alerts**
- “No inflow for N hours” and “below floor” route to on-call.

**Default flow**
1. Alert triggers and vault stays `locked = true`.
2. Request remediation (rollback UI, register new PDA in the vault).
3. If uncured within SLA: margin call → seize collateral → continue sweeping registered sources to auto-repay.

---

## 7) Legal wrapper (for larger deals) (tbd?)

- **Master Revenue Pledge Agreement.** Binds identity to wallets/Squads members; covers current and future facilities.
- **Facility Agreement (per deal).** Amount, tenor, waterfall, LTV, cure periods.
- **Security Agreement.** Security interest over registered **revenue PDAs**, the **CreatorVault/DAO Safe proceeds**, and defined **successors**.
- **Information rights.** Deployment hashes and change notices for revenue logic.
- **Make-whole clause.** Cash equivalent of missed revenues plus penalties on reroute.
- **Guarantees.** Corporate or personal, depending on size.
- **On-chain acceptance.** Store `agreement_hash` and `user_id` in vault state; require wallet attestation at opt-in.

---

## 8) UX notes

- **Launch UX unchanged.** Users launch on Pump or their usual stack; DAOs keep their Safe.
- **Opt-in per asset.** Rotation/registration occurs per financed token or product.
- **Automated claiming.** Keeper handles claims/sweeps; user/DAO withdraws only when `locked = false`.

---

## 9) Residual risk

A user/DAO can still move activity to fresh contracts or a new token. attn cannot compel new revenues. Loss is reduced by seasoning, conservative LTV, reserves, collateral, make-whole, and fast defaults.

On Pump specifically, if a creator reassigns rewards away from the Squads/CreatorVault endpoints, we cannot unwind the advance; only pre-positioned collateral (stables, PT, vesting tokens) covers the shortfall.

---

## 10) Implementation checklist

- Extend `CreatorVault` with:
  - registry of revenue PDAs (stored today as `allowed_fee_accounts`),
  - `locked`, `reserve_days`, `baseline_30d`, `floor_bps`, `user_id`.
- Keeper:
  - enforce `operation_id`, pause gates, per-source accounting.
- Indexer:
  - compute TWAPs, DSCR, and covenant flags; expose via `/v1/governance` and alerts.
- Frontend:
  - per-asset opt-in flow; covenant status; locked/unlocked UX.
- Legal:
  - finalize templates; map jurisdictions; wire e-sign + wallet attestation.
