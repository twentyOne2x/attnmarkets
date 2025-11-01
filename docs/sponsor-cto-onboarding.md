# Pump.fun CTO Onboarding Enhancements

## Overview

Creators who arrive from pump.fun need an accelerated path to claim CTO creator fees while aligning with the attn Squads controls. Today the sponsor console always walks them through creating a brand-new 2-of-2 safe, even if they already operate a Squads vault. We also provide no guided hand-off into the official pump.fun CTO form.

This doc captures the incremental work required to:

- Detect when a creator already operates a Squads safe and guide them to add the attn signer instead of recreating infrastructure.
- Provide a clear CTA (plus optional guided helper) into the official Google Form.
- Offer contextual help so users understand which answers to supply and how to prepare supporting evidence.

## Goals

- ✅ Detect existing Squads safes owned by the connected sponsor wallet (or configured admin wallet) and surface a frictionless “add attn signer” path.
- ✅ Provide a first-class Pump.fun CTO submission section, including an external link and inline helper so sponsors can confidently complete the Google Form.
- ✅ Preserve the current “create safe” flow for new users with no Squads footprint.
- ✅ Capture safe metadata in attn-api regardless of whether the safe was created via attn or pre-existed.

## Non-Goals

- ❌ Automating the Google Form submission (manual Google auth required).
- ❌ Building a general-purpose Squads management UI beyond the attn signer addition.
- ❌ Replacing existing admin-only Squads overrides; we focus on the sponsor-facing flow.

## User Journeys

1. **Net-new sponsor (no safe)**  
   - Connect wallet → Request nonce → Submit safe → Success banner → CTA to Pump.fun form.

2. **Sponsor with existing Squads safe**  
   - Connect wallet → attn detects the safe → Checklist marks “Create Squads safe” as completed → Guide to add attn signatory → CTA to Pump.fun form once attn is added.

3. **Sponsor returning after safe creation**  
   - Safe metadata loads from attn-api. Success banner shows addresses, quick links, and the Pump.fun CTA. No duplicate submission error is shown.

## Work Streams

### Backend

- [ ] Add `GET /v1/squads/safes/creator/:wallet`
  - [ ] Query persistent storage for latest safe per creator (include cluster filter inferred from request mode).
  - [ ] Return 404 when no safe exists; 200 payload should align with the existing `CreatedSafe` response.
  - [ ] Ensure the route is protected by the standard API-key + CSRF requirements (no admin flag).
- [ ] Update repository to persist “externally created” safes
  - [ ] Add method to upsert safe metadata when the frontend reports an existing safe (safe address, members, threshold).
  - [ ] Flag manual imports so admin dashboards can distinguish them.
- [ ] Consider optional Squads RPC verification
  - [ ] If available, fetch safe config from Squads API to validate that attn signer is present.
- [ ] Tests
  - [ ] Unit coverage for repository lookup/upsert.
  - [ ] Integration test for new route (happy path + 404 + unauthorized).

### Frontend – Sponsor Console

- [ ] Squads detection hook
  - [ ] On mount (live mode only), call `/api/bridge/v1/squads/safes/creator/:wallet`.
  - [ ] Update the live checklist status and gating logic based on the response.
  - [ ] Cache result in context to avoid redundant fetches during the session.
- [ ] Success banner enhancements
  - [ ] If the safe pre-existed, show “Existing safe detected” state with safe address + explorer/Squads links.
  - [ ] Gate the nonce/signature form when the safe is already ready.
- [ ] Pump.fun CTO helper card
  - [ ] Add prominent CTA button linking to `https://docs.google.com/forms/d/e/1FAIpQLScCMDx2x2ewqaWvQ4JHs-hahEscqFKsV1NPoCTCIomil88AGA/viewform`.
  - [ ] Optional: Inline accordion with tips (wallet address, proof suggestions, attn contact email).
  - [ ] Highlight prerequisites (e.g., safe detected, attn signer confirmed).
- [ ] Tours / guidance
  - [ ] Leverage existing tour infrastructure to show a short walkthrough of the Google Form fields.
  - [ ] Store a localStorage key to prevent repeat tours once acknowledged.
- [ ] Tests
  - [ ] Update unit and integration tests for the updated hook logic.
  - [ ] Playwright/Jest snapshot verifying the new CTA + helper content.

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
  - [ ] Update existing dashboards to chart the two sponsor cohorts (new vs. existing safe).

## Acceptance Criteria

- [ ] Visiting sponsor console with an existing safe does **not** prompt for nonce + signature; it shows success state plus signer instructions.
- [ ] New sponsors can still create a safe and see “Pump.fun CTO” CTA immediately.
- [ ] Pump.fun helper content references the correct form and populates relevant hints.
- [ ] Automated test suite passes (`pnpm --filter dapp-prod lint`, `pnpm test`, backend unit/integration).
- [ ] Manual regression checks on sponsor flow (create vs. detect) documented in release notes.

## Open Questions

- Should we auto-lookup the safe via Squads’ public API using the wallet, or rely on user input when importing?
- Do we want to store Google Form submission status locally (e.g., user checkboxes) even though we cannot confirm submission programmatically?
- For teams operating multiple safes, how do we let the user select the correct safe (dropdown vs. manual entry)?

> Update this document as decisions are made and boxes get checked. Once all items are complete and validated, append a short release summary.
