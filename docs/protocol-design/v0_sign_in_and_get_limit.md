attn.markets – “Revenue-backed Limit + Leaderboard” v0 (prod) Design

0. Scope and objectives

0.1 What this version should do

Within the prod app (apps/dapp-prod):
	1.	Let a creator:
	•	Connect a wallet (no message signing required for this UX; existing devnet/Squads flows stay intact).
	•	See, on /sponsor:
	•	Their 7d creator rewards / revenues, if pre-indexed from Dune/Pump/attn-api.
	•	A simple, explicit revenue-backed borrow limit derived from those revenues.
	•	Optionally submit a Telegram and/or Twitter handle for follow-up.
	2.	Automatically:
	•	Add the connected wallet to the creator leaderboard at /leaderboard.
	•	Highlight wallets that are pre-indexed and “recognized” (welcome-home).
	3.	GTM:
	•	Pre-index top creator wallets off-chain using Dune + Pump (and/or attn-api).
	•	DM them (X/TG) and send them to https://app.attn.markets/sponsor or https://app.attn.markets/leaderboard.
	•	They arrive, connect wallet, and see:
	•	“We already track you; here’s your limit and ranking.”
	4.	Non-goals for this v0:
	•	No new onchain program required.
	•	No additional message signing required for this experience.
	•	No real money flows required for this UX; advance/repay can remain simulated where needed.

⸻

1. High-level user flows

All flows now refer to the prod app routes:
	•	/sponsor – creator console.
	•	/leaderboard – creator leaderboard.
	•	/deposit – LP view (unchanged apart from using updated data where convenient).

1.1 Flow A – Pre-indexed creator from Pump DM, wallet-first
	1.	A wallet is identified via Dune + Pump.
	2.	You DM them a link, e.g.:
	•	https://app.attn.markets/sponsor?wallet=<their_wallet> (optional wallet hint).
	•	Or https://app.attn.markets/leaderboard.
	3.	They open /sponsor:
	•	Click “Connect Wallet”.
	•	Wallet connects (using existing wallet adapter; no signMessage required for this UX).
	4.	Backend:
	•	GET /api/creator?wallet=<wallet> is called.
	•	The route looks up the wallet in the off-chain creators table or attn-api.
	•	Returns:
	•	fees7d_usd and related metrics.
	•	Metadata including source and indexed social handles.
	•	A preIndexed: true flag when data came from the pre-index pipeline.
	5.	Frontend (/sponsor):
	•	Initializes weeklyEarnings from creator.fees7d_usd.
	•	Computes the simple revenue-backed limit (see §4.1.2).
	•	Renders a “welcome home” banner if preIndexed is true.
	•	Shows their leaderboard rank (from /leaderboard data) once available.
	•	Prompts them to drop Telegram/Twitter for follow-up.
	6.	On identity submit:
	•	POST /api/creator-identities is called and stores Telegram/Twitter handle linked to the wallet.

1.2 Flow B – Wallet-first, not pre-indexed
	1.	User lands on /sponsor or /leaderboard.
	2.	They click “Connect Wallet”.
	3.	Frontend calls GET /api/creator?wallet=<wallet>.
	4.	Backend returns no creator row (null).
	5.	/sponsor:
	•	Sets a reasonable default weeklyEarnings value (existing demo default is fine).
	•	Shows:
	•	“We haven’t indexed your rewards yet; you can still simulate a limit.”
	•	Allows manual override of weekly earnings (input already exists; messaging is updated).
	•	Computes and displays the limit based on user-entered earnings.
	6.	/leaderboard:
	•	The wallet is still added to the in-memory creators list as a “New” creator, with a simulated limit derived from their current weeklyEarnings.

1.3 Flow C – Twitter-first (phase 2)
	1.	User clicks “Log in with Twitter” on landing or /sponsor.
	2.	OAuth completes; backend receives twitter_handle.
	3.	Backend:
	•	GET /api/creator-by-twitter?handle=@xyz maps Twitter handle to one or more wallets via pre-indexed data.
	4.	Frontend:
	•	If exactly one wallet:
	•	Treat as if that wallet was connected:
	•	Set currentUserWallet in context.
	•	Fetch creator profile; show limit and rank.
	•	If multiple wallets:
	•	Show a “select wallet” step, then proceed as above.
	•	If none:
	•	Show a message:
	•	“We don’t have your wallet mapped yet; connect wallet to proceed.”

⸻

2. Architecture overview

2.1 Existing prod stack
	•	Frontend:
	•	Next.js 13+ App Router (TypeScript) in apps/dapp-prod.
	•	Primary routes:
	•	/ – dashboard (builders + LP overview).
	•	/sponsor – creator “User Console” (builders/DAOs/creators).
	•	/leaderboard – creator leaderboard.
	•	/deposit – LP / attnUSD side.
	•	Wallet and onchain:
	•	Solana wallet adapter (Phantom etc.).
	•	Devnet “Live mode” interactions.
	•	Squads safe integration.
	•	“Sign and list” flows.
	•	State management:
	•	apps/dapp-prod/app/context/AppContext.tsx:
	•	Holds creators, poolData, currentUserWallet, currentUserCreator, etc.
	•	Provides functions like getAvailableLiquidity, calculateLPAPR, signAndListCreator, etc.
	•	Backend:
	•	None for persistent creator business data in prod yet, or delegated to external attn-api.

2.2 Additional stack for this v0
	1.	Route handlers in prod app:
	•	Under apps/dapp-prod/app/api/...:
	•	GET /api/creator
	•	GET /api/creators
	•	POST /api/creator-identities
	•	(Phase 2) GET /api/creator-by-twitter
	2.	Database / source of truth:
	•	Postgres (Supabase/Neon/RDS/etc.) or existing attn-api as an abstraction.
	•	Access from route handlers via Prisma, SQL client, or HTTP calls to attn-api.
	•	Tables/entities:
	•	creators
	•	creator_identities
	3.	Indexing pipeline (off-app):
	•	Separate ETL job (cron, script, notebook):
	•	Queries Dune for creator rewards.
	•	Reads Pump data (rewards, social handles).
	•	Optionally merges in attn-api data.
	•	Writes/updates rows in creators.
	4.	Optional Auth (phase 2):
	•	Twitter login via NextAuth or custom OAuth route handlers.
	•	creator-by-twitter lookup routes as described.

⸻

3. Data model

3.1 Core entities

TypeScript-style interfaces for clarity; actual implementations can live in a shared folder or only on the server.

// Creator revenue profile, pre-indexed off-chain
export interface Creator {
  id: string;                // UUID
  wallet: string;            // solana address
  chain: 'solana';
  source: 'pump' | 'manual' | 'attn-api' | 'other';
  fees7d_usd: number;
  fees30d_usd: number | null;
  lifetime_fees_usd: number | null;
  last_indexed_at: string;   // ISO string
  indexed_twitter_handle?: string | null;
  indexed_telegram_handle?: string | null;

  // Convenience for frontend
  preIndexed?: boolean;      // true if populated by Dune/Pump/attn-api
}

// Identity info explicitly provided by the user in the UI
export interface CreatorIdentity {
  id: string;                // UUID
  wallet: string;
  telegram_handle?: string | null;
  twitter_handle?: string | null;
  login_method: 'wallet_connect' | 'twitter_oauth';
  is_verified: boolean;      // reserved for later sign-message/manual checks
  created_at: string;        // ISO
  updated_at: string;        // ISO
}

// Derived; computed in frontend from Creator + pool data
export interface BorrowLimit {
  wallet: string;
  fees7d_usd: number;
  maxBorrowable_usd: number;     // 2 * fees7d_usd
  suggested_advance_usd: number; // 0.5 * maxBorrowable_usd
  liquidity_cap_usd: number;     // min(maxBorrowable_usd, availableLiquidity)
}

3.2 Relation to existing prod state
	•	currentUserCreator in AppContext already holds metrics like:
	•	metrics.recent14dAverageUsd
	•	fees7d_usd or similar revenue metrics (depending on current schema).
	•	creators array in AppContext feeds:
	•	/leaderboard table.
	•	Some pool-level stats.

Integration for this v0:
	•	For connected wallet:
	•	fetchCreatorProfile(wallet) will fetch a Creator from backend and:
	•	Seed currentUserCreator / weeklyEarnings with fees7d_usd.
	•	Set a local isPreIndexed flag.
	•	For leaderboard:
	•	loadLeaderboardCreators() will populate/extend creators from backend:
	•	Pre-indexed creators from Dune/Pump.
	•	Newly connected wallets merged in.

⸻

4. Features and implementation details

F1 – Wallet connect + revenue-backed limit on /sponsor

4.1 UX
Location: apps/dapp-prod/app/sponsor/page.tsx.

States:
	•	No wallet connected:
	•	“Connect Wallet” button (existing).
	•	For this experience, no additional sign-message needed beyond existing flows.
	•	Wallet connected:
	•	If known in backend:
	•	“We already track your creator rewards.”
	•	weeklyEarnings read-only-ish (but can be lightly editable for simulation).
	•	Revenue-backed borrow limit card computed from 7d revenues.
	•	Optional note that values are derived from on-chain fees via Dune/Pump/attn-api.
	•	If not known:
	•	Default weeklyEarnings (existing demo default).
	•	“We haven’t indexed your rewards yet; you can still simulate a limit.”
	•	Input to override 7d earnings manually.

4.1.1 Behaviour on wallet connect
In /sponsor:
	1.	handleConnectWallet (or equivalent) resolves the wallet address (from wallet adapter or deterministic test wallet).
	2.	After setCurrentUserWallet(wallet) in context:
	•	Call fetchCreatorProfile(wallet) from AppContext.
	3.	If fetchCreatorProfile returns a Creator:
	•	Set weeklyEarnings = creator.fees7d_usd.
	•	Mark isPreIndexed = creator.preIndexed ?? creator.source === 'pump'.
	•	Update/merge the corresponding entry in creators in context.
	4.	If fetchCreatorProfile returns null:
	•	Leave weeklyEarnings at default.
	•	Set isPreIndexed = false.

4.1.2 Borrow limit calculation
Given:
	•	weeklyEarnings from either:
	•	Backend (creator.fees7d_usd), or
	•	User input (for non-indexed creators).
	•	availableLiquidity from existing getAvailableLiquidity() in AppContext.

Compute:

const maxBorrowable = weeklyEarnings * 2;     // 2 weeks of revenue
const liquidityCap = Math.min(maxBorrowable, availableLiquidity);
const suggestedAdvance = liquidityCap * 0.5; // 50% of capped max

Display in a dedicated “Revenue-backed limit” card:
	•	7d revenues.
	•	Max revenue-backed limit (liquidityCap).
	•	Suggested first advance (suggestedAdvance).
	•	Short explanation e.g.:
	•	“Max limit: min(2 × 7d revenues, available pool liquidity).”
	•	“Suggested advance: 50% of your max limit.”

Existing loan simulation (sliders, terms) can continue to use current calculateBorrowingTerms logic; this card is primarily a simplified headline limit for DM’d users.

4.1.3 Implementation notes
	•	Add to AppContext:

async function fetchCreatorProfile(wallet: string): Promise<Creator | null>;


	•	In /sponsor component:
	•	New local state:
	•	weeklyEarnings: number
	•	isPreIndexed: boolean
	•	After wallet connect, call fetchCreatorProfile and update state as described.
	•	Render the limit card near the top of the main creator console.

⸻

F2 – Creator leaderboard on /leaderboard (pre-indexed + connected wallets)

4.2 UX
Location: apps/dapp-prod/app/leaderboard/page.tsx.
	•	Table already exists and shows per-creator metrics.
	•	For v0, extend with:
	•	Revenue-backed limit per creator.
	•	“Recognized” vs “New” badge.
	•	Clear rank for current user.
	•	Optionally, a small banner for pre-indexed current user.

4.2.1 Data source and loading
	•	AppContext gains:

async function loadLeaderboardCreators(): Promise<void>;


	•	On first mount of /leaderboard:
	•	If creators.length === 0, call loadLeaderboardCreators().
	•	loadLeaderboardCreators():
	•	Calls GET /api/creators?sort=fees7d&limit=100.
	•	Merges returned rows with existing creators in state (dedupe by wallet; prefer backend fields like fees7d_usd, source, indexed_twitter_handle).

4.2.2 Columns and row annotations
For each creator row:
	•	“Borrow limit (simulated)”:
	•	Compute:

const maxBorrowable = creator.fees7d_usd * 2;
const liquidityCap = Math.min(maxBorrowable, availableLiquidity);


	•	Display liquidityCap as the row’s “Limit” value.

	•	“Recognized” status:
	•	A creator is “recognized” if:
	•	creator.source === 'pump', or
	•	creator.indexed_twitter_handle or creator.indexed_telegram_handle is non-empty, or
	•	creator.preIndexed === true.
	•	Render as a small badge, e.g. “Recognized” vs “New”.
	•	Current user highlight:
	•	If creator.wallet === currentUserWallet, keep or strengthen the existing row highlight (background or border).

4.2.3 “You are ranked #X” summary
At the top of /leaderboard:
	•	If currentUserWallet is set and is present in creators:
	•	Compute rank (0-based index + 1) based on the sorted list by fees7d_usd (or the same sort as the main table).
	•	Display:
	•	“You are currently ranked #X out of Y revenue accounts.”
	•	If the current user is recognized (source === 'pump' or indexed handle present):
	•	Show a slightly stronger banner, e.g.:
	•	“We already track your Pump creator rewards. You’re currently ranked #X by 7d revenues.”

⸻

F3 – Identity capture (Telegram / Twitter) on /sponsor

4.3 UX
Location: apps/dapp-prod/app/sponsor/page.tsx.
	•	After wallet connect and showing the revenue-backed limit, add a small identity card:
	•	Title: “Leave a contact handle”.
	•	Inputs:
	•	Telegram handle (@handle).
	•	Twitter/X handle (@username).
	•	Button: “Save contact”.
	•	Button is disabled when:
	•	No wallet is connected, or
	•	No handle is provided, or
	•	A save is in progress.

4.3.1 Behaviour
	1.	On submit:
	•	Call saveCreatorIdentity from AppContext:

await saveCreatorIdentity({
  wallet: currentUserWallet,
  telegram_handle,
  twitter_handle,
});


	2.	Backend (POST /api/creator-identities):
	•	Upsert creator_identities row by wallet.
	•	Optionally also propagate indexed_telegram_handle / indexed_twitter_handle into creators table for convenience.
	3.	Frontend:
	•	On success:
	•	Show a success notification.
	•	Optionally clear input fields or keep them.
	•	On error:
	•	Show an error notification.
	4.	No message signing:
	•	Identity is advisory; manual checks can occur later for large accounts.

4.3.2 Implementation notes
	•	AppContext adds:

async function saveCreatorIdentity(identity: {
  wallet: string;
  telegram_handle?: string;
  twitter_handle?: string;
}): Promise<void>;


	•	/sponsor:
	•	Local state:
	•	telegramHandle: string
	•	twitterHandleInput: string
	•	savingIdentity: boolean
	•	Button handler calls saveCreatorIdentity and triggers existing notification utility.

⸻

F4 – “Welcome home” for pre-indexed creators

4.4 UX
Two main surfaces:
	1.	/sponsor:
	•	When isPreIndexed is true:
	•	Show a banner above the limit card:
	•	“We already track your creator rewards from Pump / attn.”
	•	“Last 7d: $X.”
	•	“You could borrow up to $Y in an advance.”
	•	Additional line indicating data comes from on-chain fees and is demo-only.
	2.	/leaderboard:
	•	When current user’s creator row is recognized:
	•	Banner at top:
	•	“We already track your Pump creator rewards. You’re currently ranked #X by 7d revenues.”
	•	In-table “Recognized” badge for that row.

4.4.1 Behaviour
	•	fetchCreatorProfile sets preIndexed when:
	•	Row is from Dune/Pump/attn-api (controlled by ETL / backend).
	•	Or heuristics as a fallback: source === 'pump' or indexed handles present.
	•	Frontend only uses preIndexed and source/handles to control copy; no security-critical logic depends on this.

⸻

F5 – Twitter login (phase 2)

4.5 UX
	•	On landing (/) and/or /sponsor:
	•	Add a secondary CTA next to “Connect Wallet”:
	•	“Log in with Twitter (for Pump creators).”

4.5.1 Behaviour
	1.	User clicks “Log in with Twitter”.
	2.	OAuth flow via NextAuth or custom handler:
	•	Redirect to Twitter/X.
	•	Callback receives twitter_username / twitter_handle.
	3.	Backend calls GET /api/creator-by-twitter?handle=@xyz:
	•	Returns an array of Creator rows, or a specialized structure mapping handle → wallet[].
	4.	Frontend:
	•	If 1 wallet:
	•	Set currentUserWallet to that wallet.
	•	Call fetchCreatorProfile(wallet) as in the wallet flow.
	•	If multiple wallets:
	•	Show a selection UI.
	•	On selection, proceed as above.
	•	If no wallets:
	•	Show:
	•	“We don’t have your wallet mapped yet; connect wallet to proceed.”

⸻

5. Backend API sketch

All routes live under apps/dapp-prod/app/api.

5.1 GET /api/creator
	•	Query: wallet=<address>.
	•	Response: Creator | null.
	•	Optionally embed derived BorrowLimit if convenient, but frontend will compute it anyway.
	•	Logic:
	•	Lookup wallet in creators table or via attn-api.
	•	Set preIndexed true if row is from Pump/attn-api indexing.

5.2 GET /api/creators
	•	Query parameters:
	•	sort=fees7d|borrowLimit (default fees7d).
	•	limit=<number> (default ~100).
	•	Response: Creator[].
	•	Logic:
	•	Select top creators ordered by fees7d_usd (or equivalent).
	•	Optionally include simple aggregate fields for convenience.

5.3 POST /api/creator-identities
	•	Body:

{
  "wallet": "<address>",
  "telegram_handle": "@handle" | null,
  "twitter_handle": "@username" | null,
  "login_method": "wallet_connect" | "twitter_oauth"
}


	•	Response:

{ "success": true }


	•	Logic:
	•	Upsert into creator_identities by wallet.
	•	Optionally update creators.indexed_telegram_handle and creators.indexed_twitter_handle.

5.4 (Phase 2) GET /api/creator-by-twitter
	•	Query: handle=@xyz.
	•	Response:
	•	Creator[] (one per wallet), or
	•	A smaller structure: { handle, wallets: string[] }.
	•	Logic:
	•	Lookup handle in creators.indexed_twitter_handle (case-insensitive).
	•	Optionally incorporate signals from creator_identities.

⸻

6. Integration into current files

6.1 AppContext.tsx (prod)

Extend apps/dapp-prod/app/context/AppContext.tsx with:
	•	New async methods:

async function fetchCreatorProfile(wallet: string): Promise<Creator | null>;
async function loadLeaderboardCreators(): Promise<void>;
async function saveCreatorIdentity(identity: {
  wallet: string;
  telegram_handle?: string;
  twitter_handle?: string;
}): Promise<void>;


	•	fetchCreatorProfile:
	•	Calls /api/creator?wallet=....
	•	On success, merges the returned creator into existing creators by wallet.
	•	Optionally updates currentUserCreator.
	•	loadLeaderboardCreators:
	•	Calls /api/creators.
	•	Merges results into creators.
	•	saveCreatorIdentity:
	•	Calls /api/creator-identities with login_method = 'wallet_connect' for now.
	•	On success, updates the relevant creator record in creators with identity info.

Expose these via useAppContext().

6.2 /sponsor/page.tsx (creator console)

Key changes:
	1.	After wallet connect:
	•	Call fetchCreatorProfile(wallet).
	•	If present:
	•	Set weeklyEarnings from creator.fees7d_usd.
	•	Set isPreIndexed flag.
	•	If absent:
	•	Leave default weeklyEarnings.
	•	isPreIndexed = false.
	2.	Limit card:
	•	Compute maxBorrowable, liquidityCap, suggestedAdvance using current weeklyEarnings and getAvailableLiquidity().
	•	Render a card summarizing:
	•	7d revenues.
	•	Max limit.
	•	Suggested first advance.
	•	Clear explanation of formula.
	3.	Identity block:
	•	Add Telegram/Twitter inputs and “Save contact” button.
	•	Hook the button to saveCreatorIdentity.
	4.	Copy:
	•	When isPreIndexed:
	•	Show “We already track your creator rewards …” banner.
	•	When not:
	•	Show “We haven’t indexed your rewards yet; you can still simulate a limit.”

6.3 /leaderboard/page.tsx

Key changes:
	1.	Data loading:
	•	On mount, if creators.length === 0, call loadLeaderboardCreators().
	2.	Table:
	•	Add a column for “Limit” using the simple formula.
	•	Add a column or badge for “Recognized” vs “New”.
	3.	Current user summary:
	•	Compute rank for currentUserWallet and show a short summary at the top.
	•	If recognized, use the stronger “welcome-home” wording.

6.4 /page.tsx (dashboard)

Minimal changes:
	•	Adjust copy for creator CTA to reflect that connecting a wallet on /sponsor will show:
	•	“See your revenue-backed limit.”
	•	“Check your rank on the leaderboard.”

No functional changes required here for v0.

⸻

7. Tests and checklists

7.1 Wallet connect + limit UX (/sponsor)
	•	When no wallet is connected, /sponsor shows “Connect Wallet”.
	•	On connect, currentUserWallet is set in context.
	•	After connect, exactly one call to GET /api/creator?wallet=<wallet> is made.
	•	If backend returns a creator:
	•	weeklyEarnings equals fees7d_usd.
	•	Limit card shows maxBorrowable = 2 × fees7d_usd.
	•	liquidityCap = min(maxBorrowable, availableLiquidity).
	•	“Welcome home” banner is visible.
	•	If backend returns null:
	•	weeklyEarnings remains default.
	•	Copy indicates “not indexed yet”.
	•	Limit card uses the default/edited weeklyEarnings.
	•	Changing weeklyEarnings updates limit card consistently.
	•	Backend failures fall back to simulated state with an appropriate error message.

7.2 Leaderboard population (/leaderboard)
	•	On first visit, GET /api/creators?sort=fees7d&limit=100 is called.
	•	Table populates from backend rows.
	•	Rows sorted by fees7d_usd descending by default.
	•	Creator with fees7d_usd = 0 renders without issues.
	•	“Limit” column reflects min(2 × fees7d_usd, availableLiquidity).
	•	“Recognized” badge appears for rows with source = 'pump' or indexed handles.
	•	Current user row is highlighted and rank is computed correctly.

7.3 Identity capture (/sponsor)
	•	After wallet connect, Telegram/Twitter inputs are visible.
	•	Submitting valid handles triggers POST /api/creator-identities.
	•	On HTTP 200:
	•	Success notification is shown.
	•	Subsequent loads show identity reflected if propagated into creators.
	•	Submitting without a wallet is blocked (button disabled).
	•	Submitting with no handles does not send a request.
	•	Backend or network errors show an error notification and do not break the page.

7.4 Pre-index “welcome home”
	•	For a wallet existing in DB with source = 'pump' or preIndexed = true:
	•	Connecting that wallet on /sponsor shows “We already track your creator rewards …”.
	•	Weekly revenues match DB.
	•	Leaderboard displays:
	•	Recognized badge.
	•	Correct rank.
	•	Optional top-of-page banner.
	•	For a wallet not in DB:
	•	No “welcome home” messaging appears.
	•	“Not indexed yet” copy is shown.

7.5 Twitter login (phase 2)
	•	“Log in with Twitter” triggers OAuth redirect.
	•	On callback:
	•	If exactly one mapped wallet:
	•	currentUserWallet is set.
	•	fetchCreatorProfile is called.
	•	/sponsor shows limit and banner as expected.
	•	If multiple wallets:
	•	Wallet selection step appears and behaves correctly.
	•	If none:
	•	Clear “no mapping yet; connect wallet” message.

7.6 Resilience / edge cases
	•	If any API endpoint is unreachable:
	•	/sponsor still works with simulated state.
	•	/leaderboard shows a fallback message instead of breaking.
	•	If GET /api/creators returns empty:
	•	Leaderboard shows “No creators yet” rather than an error.
	•	Local state and context reset still restore a safe demo state.

⸻

8. Implementation order
	1.	Backend + DB / attn-api integration
	•	Create/extend creators and creator_identities tables.
	•	Implement:
	•	GET /api/creator
	•	GET /api/creators
	•	POST /api/creator-identities
	•	(Phase 2) GET /api/creator-by-twitter
	2.	AppContext wiring
	•	Add fetchCreatorProfile, loadLeaderboardCreators, saveCreatorIdentity.
	•	Update creators and (optionally) currentUserCreator based on backend responses.
	3.	/sponsor
	•	Wire wallet connect → fetchCreatorProfile.
	•	Implement revenue-backed limit card.
	•	Implement identity capture block.
	•	Add pre-index “welcome home” messaging.
	4.	/leaderboard
	•	Load creators from backend on mount.
	•	Add limit column and “recognized” badge.
	•	Add rank summary for current user.
	5.	Pre-index job
	•	Build Dune + Pump script/notebook to populate creators table.
	•	Manually validate a sample set.
	6.	Twitter login (phase 2)
	•	Integrate NextAuth or custom OAuth for Twitter.
	•	Implement creator-by-twitter route and UI selection if multiple wallets.
	•	Add “Log in with Twitter” CTAs.

This version keeps all core prod behaviour (wallet, devnet, Squads, LP flows) intact while layering on the DM-friendly creator experience: connect wallet, see revenue-backed limit and rank, and leave contact info for follow-up.