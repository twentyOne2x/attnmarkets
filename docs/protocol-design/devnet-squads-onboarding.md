# Devnet Squads Onboarding Checklist

Last updated: 2025-10-30

This note captures the open work required to provide a first-class Squads safe creation flow on **devnet**. It lists how to exercise the current flow end-to-end, highlights the missing polish in the prod dapp (`apps/dapp-prod`), and assigns tasks to specific files so the team can iterate quickly.

## 1. How to Exercise the Flow on Devnet Today

1. **Configure environment variables** for the prod dapp build:
   - `NEXT_PUBLIC_DATA_MODE=live`
   - `NEXT_PUBLIC_CLUSTER=devnet`
   - `NEXT_PUBLIC_API_BASE=<devnet API base>` (currently `https://attn-api-406386298457.us-central1.run.app`)
   - `NEXT_PUBLIC_PROGRAM_IDS={"devnet":{...}}` with the latest devnet program IDs.
   - `NEXT_PUBLIC_ATTN_API_KEY=<devnet squads client key>` and `NEXT_PUBLIC_CSRF_TOKEN=<matching token>`.
   - `NEXT_PUBLIC_SQUADS_ATTN_MEMBER=<attn co-signer devnet wallet>`.
2. **Run the dapp locally** with `pnpm --filter dapp-prod dev` (or via Vercel preview) and grant your browser wallet access to devnet.
3. **Connect a devnet wallet** via the wallet selector (currently hidden behind the Demo toggle; see §2.1).
4. On the creator page, **request a nonce** (`POST /v1/squads/safes/nonce`) and sign it with the connected wallet.
5. **Submit the safe request** (`POST /v1/squads/safes`) using the signed nonce.
6. On success, check `/v1/squads/safes/:id` for status transitions and verify the onboarding checklist unlocks the Squads step.

> ⚠️ Until the UI issues below are addressed, connecting a wallet locally requires switching the header toggle to “Live,” and the creator wallet field does **not** auto-fill.

## 2. UX Gaps to Close

### 2.1 Navigation & Wallet Connection
- **Problem:** The header keeps the Demo toggle + mock wallet state on initial load. Even with `isLiveForced === true`, the Live badge renders, but the connect button only appears after toggling from Demo → Live because `getWalletButton` relies on user-triggered mode switches.
- **Validation:** In `apps/dapp-prod/app/components/Navigation.tsx`, `renderModeToggle` short-circuits when `isLiveForced` is true, but `getWalletButton` still expects demo state resets (`handleDisconnectWallet` calls `resetToDefaults`). There is no branch that automatically opens the wallet adapter when `cluster === 'devnet'`.
- **Tasks:**
  1. Introduce a `useEffect` that, when `isLiveForced` is true and `isWalletConnected` is false, calls `connectWallet()` once after mount (guarded so it does not spam requests).
  2. Replace the Demo reset copy with “Connect wallet” CTA in the nav whenever `runtimeEnv.defaultMode === 'live'` or `cluster === 'devnet'`. Remove the destructive reset confirmation in this path (it is only relevant to demo mode).
  3. Gate the reset/clear helpers behind an explicit “Reset demo data” button that only shows when `mode === 'demo'`.
  4. Ensure the wallet badge always displays the connected address or “Connect wallet” (no interim demo wording) when `isLiveForced`.
- **Outcome:** Devnet builds prompt for a real wallet immediately; users never see demo-only language, and the connection persists across navigation.

### 2.2 Creator Wallet Auto-Fill & Messaging
- **Problem:** The creator wallet input at `apps/dapp-prod/app/creator/components/SquadsSafeOnboarding.tsx:129-210` listens only to the local form state. `connectedWalletAddress` comes from the wallet adapter, but the form is initialised before a user connects, leaving the field empty.
- **Tasks:**
  1. Lift `currentUserWallet` from `AppContext` via `useAppContext()` (already available in the parent page) and pass it into `SquadsSafeOnboarding` as a prop, or call the hook inside the component. On change, call `updateForm({ creatorWallet: currentUserWallet })` when `creatorWalletManuallyEdited` is false.
  2. After auto-fill, display inline helper text that says “Auto-filled from your connected wallet (currently receiving Pump.fun fees). Replace this if a different signer should own the Squads safe.”
  3. Add a secondary paragraph for builders/DAOs: “If your team already uses a Squads safe, enter the signer wallet that controls it; you can link the existing safe after this step.”
  4. Add Playwright coverage that: (a) connects a wallet, (b) navigates to `/creator`, (c) asserts the input value matches the connected address, (d) edits the field manually and confirms it no longer auto-resets, and (e) verifies the copy rendered.
- **Outcome:** Connecting a wallet sets the form default immediately, while manual overrides remain respected and persona guidance is clear.

### 2.3 Builder / DAO Path Copy
- **Problem:** All instructions assume a Pump.fun creator wallet, but builders often operate an existing Squads safe.
- **Tasks:**
  1. Add a short explainer block (below the input helper text) that splits the guidance: “Creators: use the wallet currently receiving Pump.fun fees. Builders/DAOs: enter the signer wallet that controls your existing Squads safe; you can link attn later.”
  2. Link to the forthcoming “Hook an existing Squads safe” guide (see §3.3).
- **Outcome:** Users understand which address to supply regardless of persona.

### 2.4 Guided Tour Alignment
- **Problem:** The welcome tour (`apps/dapp-prod/app/components/WelcomeGuideModal.tsx`) doesn’t branch into the devnet creator checklist.
- **Task:** When `cluster === 'devnet'`, ensure the “Creator” journey points directly to `/creator`, confirms wallet connection, and highlights the Squads section.

### 2.5 Checklist Feedback
- **Problem:** The onboarding checklist on `/creator` (see `apps/dapp-prod/app/creator/page.tsx`) does not annotate timestamps or status for nonce requests vs. submissions.
- **Task:** Add per-step badges and `completed_at` display for:
  - “Nonce requested”
  - “Nonce signed”
  - “Safe submitted”
  - Future: “Safe ready (Squads approved)”

## 3. Backend & Docs Follow-Up

### 3.1 Devnet API Keys & Allow Lists
- Ensure a dedicated devnet API key exists and is referenced in `.env.local` examples (`docs/devnet-setup.md` update).
- Confirm CORS allows `http://localhost:*` and the devnet preview domain after the recent multi-origin change (`protocol/crates/attn_api/src/main.rs#L758`).

### 3.2 Readiness Messaging
- The creator page currently surfaces “attn API readiness check failed” if credentials are missing (located at `apps/dapp-prod/app/creator/components/SquadsSafeOnboarding.tsx:652-719`). Add a devnet-specific hint: “Provide devnet API key and CSRF token in your env to proceed.”

### 3.3 Guide for Existing Squads Safes
- Draft a companion doc charting how DAOs with an existing Squads safe request attn co-signature without re-creating the safe. Link from the UI copy added in §2.3.

## 4. Acceptance Criteria

- Devnet builds load directly in Live mode, show the wallet connect button, and auto-fill the creator wallet field on connect.
- Persona-specific copy clarifies which address to use.
- The onboarding checklist reflects nonce/signature/submission progress with timestamps.
- API readiness banner only fails when the endpoint is down, not due to misconfiguration, and includes remediation hints.
- Documentation (this page + `docs/devnet-setup.md`) enumerates the required environment variables and key management steps.

## 5. Open Questions

1. Should builder/DAO users skip the auto-generated Squads request entirely and jump to an “attach existing safe” form? (Needs product decision.)
2. Do we want to stage a devnet faucet flow that funds the signer wallet before Squads submission?
3. How should we display pending Squads status to collaborators who are not the original requester?
4. Copy/nomenclature: do we keep the `/creator` route name or adopt umbrella language like **Sponsor** (builder, DAO, creator)? If we rename, audit all references (`rg -g '*.tsx' 'Creator' apps/dapp-prod`) plus docs to keep terminology consistent.

## 6. Sponsor Onboarding Terminology & Copy Work

- **Goal:** align the UI copy so solo builders, DAOs, and traditional creators recognise themselves. Adopt “Sponsor (Builder, DAO, Creator)” unless product picks a different umbrella term.
- **Deliverables:**
 1. **Route naming:** consider renaming `/creator` to `/user` (or similar). If we keep `/creator` for now, update page headers and breadcrumbs to read “Sponsor Console (Builders, DAOs, Creators)” while documenting the future route change.
 2. **Component copy sweep:** use `rg "Creator"` across `apps/dapp-prod` and docs to identify hero headers, CTA buttons, checklist items, and tooltips that should switch to the inclusive terminology.
 3. **Tour & welcome modal:** ensure `apps/dapp-prod/app/components/WelcomeGuideModal.tsx` and the onboarding tour ask “Are you a Sponsor (Builder, DAO, Creator)?”.
 4. **Backend/API schemas:** confirm any responses (`/v1/governance`, `/v1/squads/safes`) that return `creator_wallet` remain backward compatible, and capture follow-up work if we rename fields to `user_wallet`.
  5. **Button/tooltips:** wherever “Sponsor” appears alone (nav links, CTAs, checklist badges), add `title` or helper copy clarifying “Users include creators, builders, and DAOs with on-chain revenue.”
  6. **Testing:** add regression cases that check the new copy renders (Playwright snapshots or React Testing Library assertions).

_Please update this document as the devnet flow evolves._
