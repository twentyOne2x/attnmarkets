# Pump.fun CTO Onboarding Enhancements

## Overview

Creators who arrive from pump.fun need an accelerated path to claim CTO creator fees while aligning with the attn Squads controls. Today the user console always walks them through creating a brand-new 2-of-2 safe, even if they already operate a Squads vault. We also provide no guided hand-off into the official pump.fun CTO form.

This doc captures the incremental work required to:

- Detect when a creator already operates a Squads safe and guide them to add the attn signer instead of recreating infrastructure.
- Provide a clear CTA (plus optional guided helper) into the official Google Form.
- Offer contextual help so users understand which answers to supply and how to prepare supporting evidence.

## Goals

- ✅ Detect existing Squads safes owned by the connected user wallet (or configured admin wallet) and surface a frictionless “add attn signer” path.
- ✅ Provide a first-class Pump.fun CTO submission section, including an external link and inline helper so users can confidently complete the Google Form.
- ✅ Preserve the current “create safe” flow for new users with no Squads footprint.
- ✅ Capture safe metadata in attn-api regardless of whether the safe was created via attn or pre-existed.

## Non-Goals

- ❌ Automating the Google Form submission (manual Google auth required).
- ❌ Building a general-purpose Squads management UI beyond the attn signer addition.
- ❌ Replacing existing admin-only Squads overrides; we focus on the user-facing flow.

## User Journeys

1. **Net-new user (no safe)**  
   - Connect wallet → Request nonce → Submit safe → Success banner → CTA to Pump.fun form.

2. **Sponsor with existing Squads safe**  
   - Connect wallet → attn detects the safe → Checklist marks “Create Squads safe” as completed → Guide to add attn signatory → CTA to Pump.fun form once attn is added.

3. **Sponsor returning after safe creation**  
   - Safe metadata loads from attn-api. Success banner shows addresses, quick links, and the Pump.fun CTA. No duplicate submission error is shown.

## Work Streams

### Backend

- [x] Add `GET /v1/squads/safes/creator/:wallet`
  - [x] Query persistent storage for latest safe per creator (include cluster filter inferred from request mode).
  - [x] Return 404 when no safe exists; 200 payload should align with the existing `CreatedSafe` response.
  - [x] Ensure the route is protected by the standard API-key + CSRF requirements (no admin flag).
- [x] Update repository to persist “externally created” safes
  - [x] Add method to upsert safe metadata when the frontend reports an existing safe (safe address, members, threshold).
  - [x] Flag manual imports so admin dashboards can distinguish them.
- [ ] Consider optional Squads RPC verification
  - [ ] If available, fetch safe config from Squads API to validate that attn signer is present.
- [ ] Tests
  - [ ] Unit coverage for repository lookup/upsert.
  - [ ] Integration test for new route (happy path + 404 + unauthorized).
- [ ] **Background worker: stalled Squads requests**
  - **Problem:** If Squads creation lags or fails silently, `/v1/squads/safes/creator/:wallet` returns 404 and the user UI falls back to the nonce flow even though the request already exists. We currently rely on manual resubmits/imports.
  - **Solution:** add a periodic worker (every 5 minutes) that:
    1. Pulls `squads_safe_requests` where `status IN ('pending','submitted')` and `last_attempt_at < now() - 10 minutes`.
    2. Calls Squads API for each record. If a safe exists, call `upsert_imported_safe` to mark it `ready` (no more 404s).
    3. If Squads still has no safe and `attempt_count < 3`, resubmit the creation via the existing pipeline and push `next_retry_at = now() + backoff`.
    4. If all retries fail (`attempt_count >= 3` or age > 1 hour), set `status = 'failed'`, attach `status_sync_error`, and raise an alert (Slack/email) so an operator can intervene.
  - **Impact / expected UX once live:** 
    - `/v1/squads/safes/creator/:wallet` now returns 200 as soon as Squads finishes deploying a safe—the worker imports it within a few minutes—so users rarely see the creation tour after a successful request.
    - If Squads stalls or fails, the request automatically retries up to the configured limit; the user UI shows the existing-safe banner or an explicit “needs manual review” notice rather than looping on the nonce.
    - Operations get immediate alerts for genuinely stuck safes, so the queue never silently grows and no user remains blocked without visibility.
  - **Testing requirements:** 
    - Backend: add unit/integration coverage that seeds a pending record, stubs Squads API responses (success, retry, failure), runs the worker, and asserts the record transitions to `ready`, retries, or `failed` as designed.
    - Frontend (Playwright): extend the user suite to flip the mock from 404 to ready-safe payload, verifying the UI skips the creation tour and shows the success banner once the worker (simulated) updates the safe.
    - Alert path: ensure the failure branch triggers the alert integration (mock Slack/email) so ops awareness is testable.
- [ ] **Regression: existing safe still yields 404**
  - **Problem:** Prod wallet `ehNPTG1BUYU8jxn5TxhSmjrVt826ipHZChMkfkYNc8D` still sees the creation tour because the bridge call `/v1/squads/safes/creator/:wallet?cluster=devnet` returns 404. Cloud Run logs show every lookup fails; Cloud SQL has the request (ID `3144a127-79da-462d-8fb9-45ba343cb53a`) stuck in `pending` with `safe_address` NULL.
  - **Solution:** Import or update the record via `POST /v1/squads/safes/import` (or resubmit) so it moves to `ready` and carries `safe_address`, `status_url`, etc. Once the backend returns 200, the UI cache hides the tour automatically. Add an operational check to flag safes that remain `pending` beyond the expected window.

### Frontend – Sponsor Console

- [x] Squads detection hook
  - [x] On mount (live mode only), call `/api/bridge/v1/squads/safes/creator/:wallet`.
  - [x] Update the live checklist status and gating logic based on the response.
  - [x] Cache result in context to avoid redundant fetches during the session.
- [x] Success banner enhancements
  - [x] If the safe pre-existed, show “Existing safe detected” state with safe address + explorer/Squads links.
  - [x] Gate the nonce/signature form when the safe is already ready.
- [x] Pump.fun CTO helper card
  - [x] Add prominent CTA button linking to `https://docs.google.com/forms/d/e/1FAIpQLScCMDx2x2ewqaWvQ4JHs-hahEscqFKsV1NPoCTCIomil88AGA/viewform`.
  - [x] Optional: Inline accordion with tips (wallet address, proof suggestions, attn contact email).
  - [x] Highlight prerequisites (e.g., safe detected, attn signer confirmed).
- [x] Tours / guidance
  - [x] Leverage existing tour infrastructure to show a short walkthrough of the Google Form fields.
  - [x] Store a localStorage key to prevent repeat tours once acknowledged.
- [ ] Tests
  - [ ] Update unit and integration tests for the updated hook logic.
  - [x] Playwright coverage validating existing safe detection, CTA visibility, and duplicate submission handling.

### Frontend – Attn Signer Addition Flow

- [ ] Spec copy & UX
  - [ ] Explain why attn must be added as co-signer + target threshold.
  - [ ] Provide step-by-step instructions referencing Squads UI (with deep links if available).
- [ ] Capture confirmation
  - [ ] Provide UI for users to paste the transaction URL / status once attn is added.
  - [ ] Call a backend endpoint to refresh safe metadata and confirm signer presence.
- [ ] Tests
  - [ ] Component tests for instruction steps.
  - [ ] Flow test confirming the checklist transitions after attn signer confirmation.

### Analytics & Telemetry

- [ ] Track events
  - [ ] `squads_safe_detected` with metadata (cluster, safe address).
  - [ ] `pumpfun_cto_cta_clicked`.
  - [ ] `attn_signer_confirmed`.
- [ ] Dashboards
  - [ ] Update existing dashboards to chart the two user cohorts (new vs. existing safe).

## Acceptance Criteria

- [ ] Visiting user console with an existing safe does **not** prompt for nonce + signature; it shows success state plus signer instructions.
- [ ] New users can still create a safe and see “Pump.fun CTO” CTA immediately.
- [ ] Pump.fun helper content references the correct form and populates relevant hints.
- [ ] Automated test suite passes (`pnpm --filter dapp-prod lint`, `pnpm test`, backend unit/integration).
- [ ] Manual regression checks on user flow (create vs. detect) documented in release notes.

## Open Questions

- Should we auto-lookup the safe via Squads’ public API using the wallet, or rely on user input when importing?
- Do we want to store Google Form submission status locally (e.g., user checkboxes) even though we cannot confirm submission programmatically?
- For teams operating multiple safes, how do we let the user select the correct safe (dropdown vs. manual entry)?

> Update this document as decisions are made and boxes get checked. Once all items are complete and validated, append a short release summary.
