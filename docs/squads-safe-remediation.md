# Squads Safe Creation Remediation Plan

## Context
- Sponsor UI shows request `3144a127-79da-462d-8fb9-45ba343cb53a` stuck in **failed** with `mode: local`, `attempts: 3`, `safe_address: Pending`, and no `status_url`.
- Automatic retries keep looping every 5 minutes (next window `+5m`) but never recover because the upstream service is unreachable in `local` mode.
- Onboarding banner announces an existing safe, preventing new submission while still blocking the tour.
- Developers have spent days attempting to use the live flow, indicating the mocks & non-cached path are insufficient.
- Recent sponsor console logs pulled from `prod.attn.markets` show repeated 404s on `/api/bridge/v1/portfolio/:wallet`, base58 validation warnings for the Solana program IDs, and a `Failed to create Squads safe ... (duplicate_request)` error, confirming that the frontend is pinned to a stale request idempotency key even in production mode.

## Observed Symptoms (prod.attn.markets sponsor page)
- Wallet restoration succeeds (`mode=live`) but the API bridge returns `404` for the sponsor portfolio, so the UI keeps toggling between “no wallet connected” and a legacy cached creator object.
- Every attempt to create a Squads safe returns HTTP `400` with `duplicate_request`, matching a backend record already marked `mode: local` without a `status_url`. The UI surfaces the error toast yet the onboarding banner still claims a safe exists.
- Base58 check warnings for `creator_vault`, `splitter`, `rewards_vault`, and `stable_vault` imply the production build is missing the mainnet program IDs when `DataModeProvider` hydrates, which keeps the portfolio hydration path from instantiating real vault clients.
- Automatic retry logs (`🚀 STARTING DATA INITIALIZATION` every ~5 minutes) confirm the timer never clears, so both the sponsor page and backend logs will show bursts of identical polling activity.
- Screenshots attached to the remediation doc should be captured from prod to avoid confusing live telemetry with local mocks; note the browser console watermark and `prod.attn.markets` hostname when documenting regressions.

## Latest Log Investigation (2025-11-05)
- **Vercel bridge logs (`vercel logs prod.attn.markets --json`):** Every sponsor visit triggers `GET /api/bridge/readyz` followed by `GET /api/bridge/v1/portfolio/ehNPT…`; the edge middleware reports `status=200`, but serverless logs show the upstream Cloud Run request returning HTTP `404` with body `{"error":"not_found","resource":"portfolio"}`. Conclusion: the bridge layer is just proxying the backend 404, no masking or cache issue.
- **Cloud Run request logs:** The same window records multiple `GET /v1/portfolio/ehNPT…` entries with `status=404` (remote IP `52.55.124.84`, Vercel runtime). The sponsor attempt issues two `POST /v1/squads/safes/nonce` calls (201) before the critical `POST /v1/squads/safes` 400 at `2025-11-05T02:48:06Z` (trace `27dad117c07d31589459ad898d4dd24b`). This aligns with the frontend's `duplicate_request` toast.
- **Bridge API snapshot:** `curl https://prod.attn.markets/api/bridge/v1/squads/safes/creator/ehNPT…?cluster=devnet` returns the stuck record (`status":"failed","mode":"local","attempt_count":3,"next_retry_at":"2025-11-04T03:01:11Z"`). Because the row never left `mode=local`, idempotency enforcement keeps rejecting fresh submissions and the portfolio document was never created, causing the persistent 404s.
- No other Cloud Run errors surfaced in the past six hours besides the recurring migration warning (“migration 6 was previously applied but has been modified”), so remediation should focus on flipping this request into `mode=http` and ensuring the portfolio ingest runs successfully.
- **Upstream discovery:** Squads' production API for relayer/safe operations is served from `https://orca-app-eq7y4.ondigitalocean.app`. The REST surface hangs off the `/multisig/*` namespace (for example `GET /multisig/safe` and `GET /relayer/get_relayer/<address>`). We can now point `ATTN_API_SQUADS_BASE_URL` at this host and override the creation endpoint via the new `ATTN_API_SQUADS_CREATE_PATH` environment variable once the exact route is confirmed with Squads.

## Follow-up Log Investigation (2025-11-06)
- **500s during new safe creation:** POST `/v1/squads/safes` continues to fail. Cloud Run trace `2acf1cf2debceabfdef6b64f05656347` at `2025-11-06T01:21:51Z` shows the handler panicking because Postgres reports `constraint "squads_safe_requests_uniqueness_idx" for table "squads_safe_requests" does not exist`. That index is created in migration `006_squads_safe_requests.sql`; it looks to have been dropped or never applied in the production database, so every insert that relies on `ON CONFLICT ON CONSTRAINT squads_safe_requests_uniqueness_idx` now bubbles a 500 to the user. **Action:** re-run migration 006 (or manually recreate the index) on the prod Postgres instance before retrying.
- **Resubmit still hitting Squads 404:** The manual resubmit we fired at `2025-11-05T22:23:07Z` (`trace 4842d0d28a3446b884d110d5d42a0cdf`) was forwarded to `https://orca-app-eq7y4.ondigitalocean.app` and the upstream returned an HTML `404 Not Found`. The API translated this into a `502` for the caller. This confirms the new `/multisig/...` path wiring still needs the exact endpoint from Squads before we can flip the stuck request to `mode=http`.

### Detailed Walkthrough
Streaming `vercel logs prod.attn.markets --json` while hitting the sponsor API shows every bridge request running a `/api/bridge/readyz` health probe first, then the wallet lookup `GET /api/bridge/v1/portfolio/ehNPTG1BUYU8jxn5TxhSmjrVt826ipHZChMkfkYNc8D`. The edge middleware logs the call as `status=200`, but the paired serverless log records the upstream call to Cloud Run failing with `404` and payload `{"error":"not_found","id":"…","resource":"portfolio"}` (timestamp ≈ `2025-11-05T03:15Z`). So the 404 the browser reports is coming straight from the attn API; the bridge layer is not masking anything.

Cloud Run request logs for `attn-api` over the same window confirm repeated `GET /v1/portfolio/...` responses with `status=404` (remote IP `52.55.124.84`, the Vercel runtime) as well as the failing creation attempt: `POST /v1/squads/safes` returned `400` at `2025-11-05T02:48:06Z` (trace `27dad117c07d31589459ad898d4dd24b`). That 400 follows two successful nonce issuances (201s) and lands before the UI calls `/v1/squads/safes/creator`, which matches the duplicate-request flow surfaced in the console.

Hitting the public bridge endpoint directly (`curl https://prod.attn.markets/api/bridge/v1/squads/safes/creator/ehNPT…?cluster=devnet`) returns the stuck record: `"status":"failed","mode":"local","attempt_count":3,"next_retry_at":"2025-11-04T03:01:11.804Z"`. Because the row never exited `mode=local`, every fresh submission from the UI reuses the old idempotency key and the backend rejects it with `duplicate_request`, while the portfolio document was never written—hence the permanent 404 loop.

Aside from the Squads failure, Cloud Run stdout is clean except for recurring migration warnings (“migration 6 was previously applied but has been modified”). No other upstream errors surfaced in the last six hours, so the safe-creation failure and missing portfolio record remain the only anomalies in the pulled logs.

### Immediate Actions
1. Flip or restart the offending request (`3144a127-79da-462d-8fb9-45ba343cb53a`) so it runs in `mode=http` with a fresh idempotency key; once it succeeds the portfolio endpoint should return 200 and the UI will clear.
2. After remediation, rerun the sponsor flow and stream `vercel logs prod.attn.markets --json` again to confirm that `/api/bridge/v1/portfolio/...` returns 200 and the Squads `POST` comes back 201/202.
3. Add an alert on the Cloud Run side for repeated 400 `duplicate_request` responses so the stuck state surfaces before sponsors encounter it.

### Code Changes (2025-11-05)
- `protocol/crates/attn_api/src/squads.rs#create_pending` now performs an `ON CONFLICT` update for `(creator_wallet, attn_wallet, cluster)` collisions when the stored status is `failed`, `submitted`, or `pending`. The update resets status → `pending`, clears stale response/status fields, swaps in the new nonce/signature/payload/idempotency key, and bumps `attempt_count`.
- `create_squads_safe` logs duplicate-driven retries and returns `200 OK` (instead of `201`) when an existing record is replayed. The pending record is reused rather than inserting a new row, so sponsors no longer see `duplicate_request`—the backend immediately replays the request against the live Squads client.

### Code Changes (2025-11-06)
- `create_pending` and `upsert_imported_safe` no longer rely on the `squads_safe_requests_uniqueness_idx` Postgres index. Both routines now run inside a transaction, `SELECT ... FOR UPDATE` the existing row by wallet+cluster, and issue an `UPDATE` if a record is present. This keeps the flow working even when the index is missing, while still preferring the newer data. (We should still recreate the unique index for correctness and performance, but the API no longer throws a 500 if it disappears.)

## Goals
1. Allow sponsor onboarding to recover from a failed `local` record by re-submitting with an active Squads client (`mode: http`) using real API credentials.
2. Provide deterministic Playwright coverage that simulates the whole flow from signature → submission → ready status.
3. Prevent the UI from blocking on stale `local` records (failed / missing `status_url`).

## Root Issues
- **Legacy records:** The repository contains `mode: local` rows created before Squads integration decisions were finalised; these never map to a live status URL.
- **No override tooling:** Users must hit backend endpoints via SQL or Postman to clear the record; UI has `Reset form` but the API call still targets the stale idempotency key, reproducing the failure.
- **Test harness gap:** Playwright mocks stop at pending; there is no fixture covering `status_url` polling or success path.
- **Missing env bridging:** The onboarding script assumes the API base is reachable and credentials present, but upstream values were rotated after the initial failure.
- **Duplicate request guard:** Squads API keeps returning `duplicate_request` for the same `client_reference_id`, so neither auto-retry nor manual submission can move forward until the backend flips the record out of `local` mode or issues a fresh idempotency key.

## Telemetry & Operational Checklist
- **Google Cloud (Cloud Run / Firestore):** `gcloud logging read 'resource.type="cloud_run_revision" AND httpRequest.requestUrl: "/v1/squads/safes"' --freshness=2h --limit=50 --project=$ATTN_PROJECT` to confirm the backend rejects requests with `duplicate_request` and see the originating wallet/idempotency key.
- **Google Cloud Task / Scheduler:** `gcloud tasks leases pull` (if retries run via Cloud Tasks) to verify the 5-minute interval and confirm the job is not succeeding.
- **Vercel Edge / Next logs:** `VERCEL_ORG_ID/PROJECT_ID` with `vercel logs attn-markets --token $VERCEL_ANALYTICS_TOKEN --since 2h --filter "bridge/v1/squads"` to correlate frontend submissions to backend failures.
- **Manual API replay:** `http --auth :$ATTN_BRIDGE_TOKEN POST https://prod.attn.markets/api/bridge/v1/squads/safes/{request_id}/restart mode=http force=true` once the restart endpoint exists; capture response payload + status for the runbook.
- **Data audit:** Query Firestore / Postgres for `mode = 'local' AND status_url IS NULL` to pre-emptively identify other stuck sponsors before they block production onboarding.

## Remediation Tasks
### 1. Backend cleanup / tooling
- [x] Automatically reuse existing failed/pending records on duplicate sponsor submissions by resetting the Squads request in-place and replaying it against the live client (attn_api#create_squads_safe / `create_pending` on conflict).
- [ ] Add an admin endpoint `/v1/squads/safes/{request_id}/restart` that resets mode → http, clears `status_url`, and replays the submission.
- [ ] Alternatively, provide a CLI script (`sqlx`) to mark legacy `local` records as `failed` with `error_code=manual_cleanup`, so the UI offers a “Resubmit” CTA.
- [ ] Ensure the backend logs (Cloud Run) state why the previous submission failed (missing Squads base URL, network error, etc.).

### 2. UI experience
- [ ] Detect `mode: local` + `status_url=null` and offer:
  - “Resubmit using attn API” button → triggers backend restart endpoint with `mode=http`.
  - Clear warning that local mock cannot complete and instructs to switch to live credentials.
- [ ] Update success banner to differentiate **imported** vs **Retry successful** cases so users know a real request was sent.
- [ ] Introduce toast/log message when automatic retries are exhausted (`attempt_count >= STALLED_MAX_AUTO_ATTEMPTS`).

### 3. Playwright specs
- [ ] Extend `mock-api-server.js` to expose `/__complete` that flips a pending request to `ready` with a `status_url` → 200.
- [ ] Write an end-to-end spec:
  1. Connect wallet (seed localStorage).
  2. Request nonce → sign → submit.
 3. Poll status (mock returns `submitted` → `ready`).
 4. Assert safe card shows address and tour is dismissed.
- [ ] Add negative spec covering local-mode restart: mock returns `mode: local`, user triggers “Resubmit with attn API”, expect success.

### 4. Docs & runbooks
- [ ] Document exact backend steps to restart a failed safe (SQL or API).
- [ ] Update sponsor onboarding guide to emphasise: use Live mode on devnet, ensure API credentials are refreshed, and how to recover from failure.
- [ ] Link to the new Playwright spec to demonstrate expected behaviour.
- [ ] Add a runbook note (Cloud Run + Vercel) reminding engineers to capture both the 404 portfolio logs and the `POST /v1/squads/safes` trace ID when triaging future duplicate failures.

## Test Plan & Expected Outcomes
- **Backend**
  - Add a regression test in `protocol/crates/attn_api` that seeds a `mode=local` row, calls the restart endpoint, and asserts the row switches to `mode=http`, `status_url` is cleared, `attempts` reset, and the Squads client is invoked once. Expected outcome: test passes and logs confirm a 201/202 response from Squads in CI.
  - Extend the Squads service unit tests to cover `duplicate_request` responses, ensuring we emit a structured error (`conflict`) and the retry scheduler marks the attempt as `needs_manual_intervention` after `STALLED_MAX_AUTO_ATTEMPTS`. Expected outcome: test demonstrates retries stop after the threshold.
  - Wire an integration test around the Google Cloud scheduler/queue adapter (if present) so a stuck job transitions to `dead-letter` after restart. Expected outcome: the queue no longer replays the same request indefinitely.
- **Frontend**
  - Create a Playwright happy-path spec (`tests/sponsor-safe-flow.spec.ts`) that signs, submits, polls to `ready`, and verifies the sponsor banner displays the minted safe address plus clears the onboarding tour. Expected outcome: spec passes locally and in CI with live-mock toggled.
  - Add a Playwright regression spec that mocks a `mode=local` response, triggers the new “Resubmit using attn API” CTA, and confirms the UI reflects the restarted request (status pill switches to `In progress`, toast announces "Using live Squads client"). Expected outcome: spec fails on current main but passes post-remediation.
  - Add a unit test around `DataModeProvider` (React Testing Library) to ensure missing mainnet program IDs produce an actionable warning banner instead of silent base58 skips. Expected outcome: test asserts the warning renders and the provider falls back to mock data without flooding console.
- **Manual acceptance**
  - With production credentials, walk through sponsor onboarding on `prod.attn.markets`: ensure Cloud Run logs show a successful `POST /v1/squads/safes` 201, Vercel logs show a single submission per wallet, and the UI renders the safe card with `status_url` reachable.
  - Verify that previously stuck wallets (including `ehNPTG1BUYU8jxn5TxhSmjrVt826ipHZChMkfkYNc8D`) now see the safe as `ready` and do not trigger any `duplicate_request` or 404 console spam.

## Open Questions
- Do we still need `mode: local` in production? If not, plan a migration script to flip all records to `http`.
- Where should admin-only actions live (UI vs dedicated internal tool)?
- Should we surface retry errors to the sponsor (e.g., show backend stack trace snippet)?

## Definition of Done
- A fresh sponsor request on devnet successfully creates a Squads safe end-to-end with the current API credentials.
- Legacy `local` records can be converted or dismissed without manual DB edits.
- Playwright suite covers “happy path” and “legacy restart” flows, green in CI.
- Documentation updated so future sponsors (and developers) can recover without manual backend intervention.
