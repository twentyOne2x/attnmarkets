# attn.markets Future Work Backlog

This note captures medium‑term enhancements we plan to ship after the current autosweeper + dual‑control release. Items are intentionally lightweight so we can flesh them out as requirements solidify.

## 1. Sweep + LST Stake Combo Transaction
- **Problem**: Today the autosweeper runs `delegate_sweep`, then a follow-up transaction stakes the withdrawn SOL into an LST (Helius/Jito/etc.). Two transactions means two signatures and more UX friction.
- **Idea**: Build a single transaction that (a) calls `delegate_sweep`, then (b) immediately invokes the target LST program’s stake instruction. This could be packaged as a Blink so creators (or the keeper) approve everything in one tap.
- **Open tasks**:
  - Collect program IDs and instruction layouts for preferred LST providers (accounts, data schema).
  - Verify CPI compatibility when `delegate_sweep` sits in the same txn as the stake instruction (pay attention to compute limits).
  - Track minted LST vs inbound SOL to display “extra yield earned” and support unwind flows.
  - Add off-chain helpers to choose between Jito / Helius (APY comparison, fee policy).

## 2. LST Unstake UX
- **Goal**: Let creators redeem LST proceeds back to native SOL from inside the dashboard.
- Requires off-chain lookup of the LST balance, building the withdrawal instruction, and optional reminder/banner when a lock is active.

## 3. Autosweeper Analytics
- Surface sweeper status (`delegate`, `fee_bps`, `last_sweep_ts`) across API + frontend.
- Emit alerts when sweeps fail (locked vault, fee vault empty, etc.).
- Report total SOL routed via sweeper vs manual withdrawals.

## 4. Financing Enhancements
- Associate `lock_collateral` calls with advance IDs to simplify bookkeeping.
- Auto-unlock immediately on repayment (keeper integration).
- Expose advance status in `/v1/governance` and frontend banners.

## 5. Creator Notifications
- Notify creators when a sweep occurs, when LST stake completes, or when a lock prevents autosweeping.
- Channel options: email, SMS, or in-app toast/history.

## 6. Permissioned Integrations
- Optional whitelist of sweeper delegates (per creator) to support third-party treasury managers.
- Add CLI/API toggles that let creators rotate sweeper delegates without touching on-chain state manually.

