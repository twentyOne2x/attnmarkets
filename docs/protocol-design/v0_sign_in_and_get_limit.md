# attn.markets – “Revenue-backed Limit + Leaderboard” v0 Design

## 0. Scope and objectives

### What this version should do

1. Let a creator:

   * Connect a wallet (no message signing).
   * See:

     * Their 7d creator rewards / revenues (if pre-indexed via Dune/Pump) or a reasonable default.
     * A simple, explainable revenue-backed **borrow limit**.
   * Optionally submit a Telegram and/or Twitter handle.

2. Automatically:

   * Add the wallet to a **creator leaderboard** inside the dapp.
   * Highlight wallets that are pre-indexed and “recognized” (welcome-home moment).

3. GTM:

   * You use Dune + Pump to pre-index top creator wallets off-chain.
   * You DM them (X/TG), send them to attn.markets.
   * They arrive, connect wallet or log in with Twitter (later phase), and instantly see:

     * “We already track you; here’s your limit and ranking.”

4. Non-goals (for this design):

   * No onchain program required.
   * No hard auth (message signing not required yet).
   * No real money flows – the demo “open advance / repay” behaviour can stay simulation-only for now.

---

## 1. High-level user flows

### Flow A – Creator from Pump DM, wallet-first

1. You identify a wallet from Dune + Pump.
2. You reach out on X/TG, send them a link:
   `https://app.attn.markets/user` (or `?wallet=<their_wallet>` optional).
3. They open:

   * Click “Connect Wallet”.
   * Wallet connects (no signature).
4. Backend:

   * Looks up that wallet in the pre-index DB.
   * Returns:

     * `fees7d_usd` (and maybe other metadata).
     * `estimated_borrow_limit` (or front-end computes it).
     * `preIndexed: true`.
5. Frontend:

   * Pre-fills weekly earnings.
   * Shows “Estimated borrow limit: $X”.
   * Shows their leaderboard rank, explicitly marked.
   * Prompts: “Drop your Telegram so we can follow up.”
6. On submit:

   * Backend stores Telegram handle linked to wallet.

### Flow B – Wallet-first, not pre-indexed

1. User arrives at `/user` or `/leaderboard`.
2. Clicks “Connect Wallet”.
3. Backend returns no pre-index row.
4. Frontend:

   * Sets reasonable default weekly earnings (e.g. existing `10000` slider).
   * Shows: “We haven’t indexed your rewards yet; you can still simulate a limit.”
   * Lets them override weekly earnings manually (demo).

### Flow C – Twitter-first (phase 2)

1. User clicks “Log in with X/Twitter” (landing or dapp).
2. Twitter OAuth completes; backend receives `twitter_handle`.
3. Backend:

   * Looks up `twitter_handle -> wallet(s)` from pre-index mapping.
4. Frontend:

   * Shows list of wallets we believe belong to them.
   * User chooses one → we treat as if wallet connected.
   * For full “verified” binding, a later optional sign-message flow can be added.

---

## 2. Architecture overview

### 2.1 Existing stack (from repo)

* **Frontend:**

  * Next.js 13+ App Router (TypeScript).
  * Two apps:

    * `apps/landing` – marketing page.
    * `apps/dapp` – interactive demo app.
  * State management:

    * `apps/dapp/app/context/AppContext.tsx` – central simulated state:

      * `creators`, `poolData`, `userPosition`, `currentUserWallet`, etc.
      * Mock functions like `depositToPool`, `addCreatorLoan`, `addCreatorToList`, `calculateLPAPR`.
    * `DataModeContext` (likely to switch between demo/api providers).
  * UI:

    * `Navigation`, `Tooltip`, `BorrowSlider`, `RepaySlider`, tables, etc.
    * Pages (already wired):

      * `/` (dashboard)
      * `/user` – revenue account & advances (creator view).
      * `/leaderboard` – creators and loans.
      * `/deposit` – LP / attnUSD side.
  * Analytics: `@vercel/analytics/react`.

* **Backend:**

  * Currently **none** for persistent business data; everything is:

    * In-memory via React context.
    * Persisted to `localStorage` (via AppContext/store).

* **Onchain:**

  * None. All numbers are simulated.

### 2.2 Proposed additional stack

For this v0:

1. **Backend in the same Next app (`apps/dapp`):**

   * Use App Router Route Handlers (e.g. `apps/dapp/app/api/...`).
   * Provide REST-style endpoints for creators and identities.

2. **Database:**

   * Postgres (Supabase/Neon/RDS/Planetscale – any managed DB).
   * Access via Prisma or a light-weight SQL client.
   * Tables for:

     * `creators` (indexed from Dune/Pump).
     * `creator_identities` (Telegram/Twitter handles).
     * optionally `borrow_limits` snapshots, but the limit can be derived on the fly.

3. **Indexing pipeline (off-app):**

   * Separate ETL job (can be a cron script or notebook) that:

     * Queries Dune.
     * Reads Pump data (creator rewards, wallet ↔ socials).
     * Writes into `creators` table.

4. **Optional Auth (phase 2):**

   * NextAuth.js with Twitter provider, or custom OAuth route handlers.

---

## 3. Data model

### 3.1 Core entities (DB-level)

TypeScript-style interfaces to clarify shape.

```ts
// Creator revenue profile, pre-indexed from Dune/Pump
interface Creator {
  id: string;                // UUID
  wallet: string;            // solana address
  chain: 'solana';           // future-proof
  source: 'pump' | 'manual' | 'other';
  fees7d_usd: number;        // last 7 days creator rewards
  fees30d_usd: number | null;
  lifetime_fees_usd: number | null;
  last_indexed_at: Date;
  indexed_twitter_handle?: string | null;
  indexed_telegram_handle?: string | null;
}
```

```ts
// Extra identity that user explicitly provides in the UI
interface CreatorIdentity {
  id: string;                // UUID
  wallet: string;
  telegram_handle?: string | null;
  twitter_handle?: string | null;
  login_method: 'wallet_connect' | 'twitter_oauth';
  is_verified: boolean;      // for later (sign-message or manual check)
  created_at: Date;
  updated_at: Date;
}
```

```ts
// Derived, not necessarily stored; can be computed
interface BorrowLimit {
  wallet: string;
  fees7d_usd: number;
  maxBorrowable_usd: number;     // e.g. 2 * fees7d_usd
  suggested_advance_usd: number; // e.g. 50% of max
  liquidity_cap_usd: number;     // min(maxBorrowable, per-wallet cap, pool liquidity)
}
```

### 3.2 How DB interacts with current AppContext

* `creators` in AppContext is currently a **pure demo array**.
* Long term, `creators` in AppContext should be fed from the backend:

  * For **connected wallet**: `GET /api/creators/:wallet`.
  * For **leaderboard**: `GET /api/creators?sort=fees7d&limit=100`.

For v0 you can:

* Keep the simulation logic in AppContext for non-indexed users.
* For known wallets, seed AppContext’s `creators` from backend responses.

---

## 4. Features and implementation details

### F1 – Wallet connect with limit (no message signing)

#### 4.1 UX

* Location: `apps/dapp/app/user/page.tsx`.
* States:

  * No wallet →

    * Button: “Connect wallet & set up revenue account”.
  * Wallet connected:

    * If known in DB, show:

      * “We already track your revenues.”
      * Weekly revenues read-only or lightly editable.
      * Borrow limit (derived).
    * If not known, show:

      * Default 7d revenues value with hint:

        * “We haven’t indexed your creator rewards yet; you can still simulate a limit.”

#### 4.2 Behaviour

1. On `handleConnectWallet` success (already implemented with deterministic wallet):

   * Call backend:

     * `GET /api/creator?wallet=<wallet>`
   * If the backend returns a Creator row:

     * Use `fees7d_usd` to set `weeklyEarnings` in `user/page.tsx`.
     * Add or update a creator in AppContext’s `creators`.
   * Else:

     * Keep existing default `weeklyEarnings`.

2. Borrow limit calculation:

   * Use **existing** `calculateBorrowingTerms(weeklyEarnings, borrowPercentage)` for UX.

   * Additionally, compute a simple “headline limit”:

     ```ts
     const maxBorrowable = weeklyEarnings * 2;         // 2 weeks of revenue
     const liquidityCap = Math.min(maxBorrowable, availableLiquidity);
     const suggestedAdvance = liquidityCap * 0.5;      // 50% as default
     ```

   * Display on UI:

     * “Based on your 7d revenues, you could borrow up to $`liquidityCap`.”
     * “Suggested first advance: $`suggestedAdvance` (50% of max).”

3. No message signing:

   * Keep wallet connect as UI-only, no `signMessage`.
   * Hard assumption:

     * All this is informational; DB doesn’t rely on cryptographic proof yet.

#### 4.3 Where to implement

* `AppContext`:

  * Add methods:

    * `fetchCreatorProfile(wallet: string): Promise<Creator | null>`
    * `syncCreatorFromBackend(wallet: string): Promise<void>`

* `user/page.tsx`:

  * After `setCurrentUserWallet`, call `fetchCreatorProfile` and update UI:

    * If Creator found, set `weeklyEarnings` from server and mark as recognized.
  * Add explicit display of:

    * “Estimated borrow limit” block, using computed `BorrowLimit`.

---

### F2 – Creator leaderboard (connected wallets + limits)

#### 4.1 UX

* Location: `apps/dapp/app/leaderboard/page.tsx`.
* Table already exists, showing:

  * Rank, wallet, weekly earnings, loan status, repayment rate, interest, status.

#### 4.2 Behaviour changes

1. Data source:

   * Instead of only using in-memory `creators`, add load from backend:

     * `GET /api/creators?sort=fees7d&limit=100`.
   * Merge backend creators into AppContext’s `creators` on initial load.

2. Additional columns (optional v0):

   * “Borrow limit (simulated)”:

     * For each creator, compute `maxBorrowable = 2 * fees7d_usd`.
   * “Recognized” badge:

     * If `creator.source === 'pump'` or `indexed_twitter_handle` exists.

3. “Connected” vs “not connected”:

   * If `creator.wallet === currentUserWallet`, highlight row (already done).
   * Add a top section:

     * “You are currently ranked #X out of Y revenue accounts.”

#### 4.3 Where to implement

* `AppContext`:

  * Add `loadLeaderboardCreators()` that calls `/api/creators` and fills `creators`.

* `leaderboard/page.tsx`:

  * On mount, if `creators.length === 0` or explicitly:

    * Call `loadLeaderboardCreators()`.
  * Use `fees7d_usd` to compute limit for display.

---

### F3 – Identity capture (Telegram/Twitter)

#### 4.1 UX

* Location: `apps/dapp/app/user/page.tsx` (creator view).
* After wallet connect and showing the limit:

  * A small card:

    * “Leave your Telegram so we can reach you.”
    * Input: `@handle` (Telegram).
    * Optional input: Twitter handle, if not already from Pump.

  * Button: “Save contact”.

#### 4.2 Behaviour

1. On submit:

   * POST to backend:

     ```http
     POST /api/creator-identities
     {
       wallet,
       telegram_handle: '@…',
       twitter_handle: '@…' | null,
       login_method: 'wallet_connect'
     }
     ```

   * Backend:

     * Upsert `CreatorIdentity` for `wallet`.
     * Optionally propagate into `creators.indexed_telegram_handle` for convenience.

2. Frontend:

   * Show success toast:

     * “Contact saved. We’ll follow up on Telegram.”

3. No need for message signing:

   * At this stage, Telegram is advisory info; you will sanity-check big accounts manually anyway.

#### 4.3 Where to implement

* New React state in `user/page.tsx`:

  * `telegramHandle`, `twitterHandleInput`, `isSavingIdentity`.

* `AppContext`:

  * Add `saveCreatorIdentity(data: { wallet, telegram?, twitter? }): Promise<void>`.

---

### F4 – “Welcome home” for pre-indexed creators

#### 4.1 UX

When a pre-indexed wallet connects:

* At `/user`:

  * Banner:

    > “We already track your creator rewards from Pump.
    > Last 7d: `$X`.
    > You could borrow up to `$Y` in an advance.”

* Replace generic default text with small note: “Numbers derived from onchain data. Demo only; no obligation.”

* At `/leaderboard`:

  * If `currentUserWallet` in list and flagged as `source = 'pump'`:

    * Tag: “Pump creator” / “Indexed via Pump”.

#### 4.2 Behaviour

* At `fetchCreatorProfile` time, backend can include:

  ```json
  {
    "wallet": "...",
    "fees7d_usd": 12345,
    "source": "pump",
    "indexed_twitter_handle": "@handle",
    "preIndexed": true
  }
  ```

* Frontend:

  * If `preIndexed === true`, set a `isPreIndexed` flag in local state or inside the creator.
  * Conditional UI copy based on this flag.

---

### F5 – Twitter login (phase 2)

This can be done later, but design now.

#### 5.1 UX

* Landing (`apps/landing/app/page.tsx`):

  * Add secondary CTA:

    * “Log in with Twitter (for creators already earning on Pump)”.

* Dapp (`apps/dapp/app/page.tsx` or `/user`):

  * Add “Log in with Twitter” button next to “Connect wallet”.

#### 5.2 Behaviour

1. User clicks “Log in with Twitter”.

2. NextAuth/Twitter OAuth or custom OAuth flow:

   * Redirect to Twitter, user authorizes.
   * Callback route receives `oauth_token`, `twitter_username` etc.

3. Backend:

   * Looks up `creators` table by `indexed_twitter_handle` (case-insensitive).
   * Finds 0, 1, or many wallets.

4. Frontend:

   * If exactly one wallet:

     * Treat as if user connected that wallet:

       * Fill `currentUserWallet` in AppContext.
       * Fetch profile and show limit.
   * If multiple:

     * Show “Select wallet” step.
   * If none:

     * Show: “We don’t have your wallet mapped yet; connect wallet to proceed.”

#### 5.3 Data relations

* Pre-index pipeline should fill `creators.indexed_twitter_handle` when Pump gives you that mapping.
* `CreatorIdentity` from UI can later be used to assist mapping.

---

## 5. Backend API sketch

### 5.1 Routes

Under `apps/dapp/app/api`:

1. `GET /api/creator`

   * Query: `wallet=<address>`
   * Response: `Creator | null` (+ derived borrow limit if desired).

2. `GET /api/creators`

   * Query:

     * `sort=fees7d|borrowLimit`
     * `limit=100`
   * Response: `Creator[]`.

3. `POST /api/creator-identities`

   * Body: `{ wallet, telegram_handle?, twitter_handle?, login_method }`
   * Response: `{ success: true }`.

4. (Phase 2) `GET /api/creator-by-twitter`

   * Query: `handle=@xyz`
   * Response: `Creator[]` (or `Creator + wallet list`).

You can keep all calculations in frontend; backend is mostly data store.

---

## 6. How this fits into current files

### 6.1 `AppContext.tsx` (central hub)

Extend to support:

* `currentUserWallet` is already there.

* Add async methods:

  ```ts
  async function fetchCreatorProfile(wallet: string): Promise<Creator | null> { ... }
  async function loadLeaderboardCreators(): Promise<void> { ... }
  async function saveCreatorIdentity(identity: { wallet: string; telegram_handle?: string; twitter_handle?: string }): Promise<void> { ... }
  ```

* Internally:

  * On load, `loadLeaderboardCreators` populates `creators`.
  * When `fetchCreatorProfile` returns a known creator, either:

    * Merge/update into `creators`.
  * When `saveCreatorIdentity` succeeds, update local `creators` entry (if present) with Telegram/Twitter.

### 6.2 `apps/dapp/app/user/page.tsx`

Key changes:

* After wallet connect:

  * Call `fetchCreatorProfile`.
  * If found:

    * Set `weeklyEarnings` from `creator.fees7d_usd`.
    * Show “recognized” banner.
  * Else:

    * Keep default but show “not indexed yet”.

* UI:

  * Add explicit “Estimated borrow limit” card:

    * Compute `maxBorrowable`, `liquidityCap`, `suggestedAdvance`.
  * Add identity inputs (Telegram/Twitter) + button that calls `saveCreatorIdentity`.

### 6.3 `apps/dapp/app/leaderboard/page.tsx`

Key changes:

* On mount:

  * Call `loadLeaderboardCreators` if not yet loaded.
* When rendering row:

  * Optionally show:

    * Limit column (derived from `fees7d_usd`).
    * Special badge if `creator.source === 'pump'` or `creator.indexed_twitter_handle`.

### 6.4 `apps/dapp/app/page.tsx` (dashboard)

Already shows:

* Pool-level stats.
* Top creators.
* CTA to `/creator` and `/leaderboard`.

Adjust messaging slightly:

* For creators:

  * “Connect wallet to see your revenue-backed limit.”
* For LPs:

  * Leave as is (simulated).

---

## 7. Tests and checklists

### 7.1 Wallet connect + limit UX

#### Behaviour / integration tests

* [ ] When no wallet is connected, `/user` shows “Connect wallet & set up revenue account” button.
* [ ] Clicking connect sets `currentUserWallet` in AppContext.
* [ ] After connect, frontend calls `GET /api/creator?wallet=<wallet>` once.
* [ ] If backend returns known creator:

  * [ ] Weekly earnings in UI reflect `fees7d_usd` from backend.
  * [ ] Limit card displays `maxBorrowable = 2 * fees7d_usd`.
  * [ ] “Welcome home” banner appears (pre-indexed).
* [ ] If backend returns null:

  * [ ] Weekly earnings default to demo value (e.g. 10k).
  * [ ] UI shows “not indexed yet” message.
* [ ] Changing weekly earnings updates limit numbers without errors.

#### Unit-ish tests (where applicable)

* [ ] Borrow limit calculation function returns:

  * [ ] `maxBorrowable = 2 * weeklyEarnings`.
  * [ ] `suggestedAdvance = 0.5 * maxBorrowable`.
  * [ ] `liquidityCap = min(maxBorrowable, availableLiquidity)`.

---

### 7.2 Leaderboard population

* [ ] On first visit to `/leaderboard`, app calls `GET /api/creators?sort=fees7d&limit=100`.
* [ ] The table populates with rows from backend.
* [ ] Rows are sorted by `fees7d_usd` descending by default.
* [ ] “Current user” wallet row is highlighted.
* [ ] If pre-indexed (`source = 'pump'`), badge is shown.
* [ ] If a creator has `fees7d_usd = 0`, row still renders gracefully.

---

### 7.3 Identity capture

* [ ] After wallet connect, Telegram input appears on `/user`.
* [ ] Typing `@handle` and pressing “Save” calls `POST /api/creator-identities`.
* [ ] On HTTP 200:

  * [ ] UI shows success toast.
  * [ ] AppContext updates identity data for that wallet.
* [ ] Submitting without wallet connected is disallowed in UI (button disabled or error).
* [ ] Submitting empty handle does not crash (backend validates).

---

### 7.4 Pre-index “welcome home”

* [ ] For a wallet present in DB with `source = 'pump'`:

  * [ ] Connect that wallet → “We already track your Pump creator rewards” message appears.
  * [ ] Weekly earnings match DB.
  * [ ] Leaderboard shows them with correct rank and badge.
* [ ] For a non-indexed wallet:

  * [ ] No such banner appears.

---

### 7.5 Twitter login (phase 2)

* [ ] Clicking “Log in with Twitter” kicks off OAuth redirect.
* [ ] On return:

  * [ ] If exactly one wallet mapped to handle:

    * [ ] User sees revenue account as if wallet connected.
  * [ ] If multiple wallets:

    * [ ] Wallet selection screen appears.
  * [ ] If zero wallets:

    * [ ] Clear message: “We don’t have your wallet mapped yet; connect wallet.”

---

### 7.6 Resilience / edge cases

* [ ] Backend unreachable:

  * [ ] `/user` still loads using purely simulated state.
  * [ ] Error messaging: “Could not load indexed revenues; showing demo values.”
* [ ] `GET /api/creators` returns empty:

  * [ ] Leaderboard displays “No users match…” instead of breaking.
* [ ] LocalStorage and AppContext mismatch:

  * [ ] AppContext’s reset still clears everything and recovers clean demo state.

---

## 8. Implementation order (recommended)

1. **Backend + DB:**

   * Create `creators` and `creator_identities` tables.
   * Implement `/api/creator`, `/api/creators`, `/api/creator-identities`.

2. **AppContext wiring:**

   * Add async methods for fetching creators and identities.
   * Wire `currentUserWallet` & `creators` to these methods.

3. **User page:**

   * Hook connect-wallet → fetch profile.
   * Implement limit card.
   * Implement identity capture.

4. **Leaderboard page:**

   * Load creators from backend.
   * Add recognized badges; ensure highlight for current user.

5. **Pre-index job (offline):**

   * Write Dune + Pump script that populates DB.
   * Sanity-check a small sample manually.

6. **Twitter login (optional phase 2):**

   * Add NextAuth or custom OAuth.
   * Implement `creator-by-twitter` lookup.
   * Add “Log in with Twitter” buttons and flow.

This gives you a minimal, reliable surface where:

* You can DM Pump creators with a link.
* They connect wallet without signing.
* They see a revenue-derived limit and leaderboard ranking.
* You collect Telegram/Twitter for follow-up.

All without needing onchain programs yet, and with a clear path to later add signing and real money flows.
