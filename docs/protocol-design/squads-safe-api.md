# Squads Safe Onboarding API

This document describes the authenticated endpoints that power creator onboarding for Squads 2-of-2 safes, the required configuration, and the operational runbook for responding to failures.

## Authentication and security

- **API keys & CSRF** – All POST/GET requests must include an `X-API-Key` header whose value matches an id configured in `ATTN_API_KEYS`, plus the `X-ATTN-Client` header (default `attn-dapp`). Requests lacking either header return `403 auth_failed`.
- **KMS-backed signatures** – When `ATTN_KMS_SIGNER_KEY` (and optionally `ATTN_KMS_PAYER_KEY`) are configured the backend signs Squads transactions using Google Cloud KMS Ed25519 keys. Missing keys fall back to requester-supplied signatures only.
- **Admin keys** – Keys listed in `ATTN_API_ADMIN_KEYS` (comma-separated key IDs) receive elevated privileges for list/resubmit/override routes. Non-admin keys receive `403 admin_required` on those endpoints.
- **Wallet allowlist** – Optional `ATTN_API_WALLET_ALLOWLIST` (comma-separated, case-insensitive) constrains which creator wallets may request nonces or submit creation calls.
- **IP allowlist** – Optional `ATTN_API_IP_ALLOWLIST` enforces source IPs for all authenticated calls.
- **Owner signature** – Creating a safe requires a nonce signed by the creator wallet. Governance linkage requires fresh signatures from both the creator and attn wallets on the message `attn:squads:govern:<request_id>:<creator_vault>`.

## Rate limiting & idempotency

- Default limits: 30 requests/minute per IP and 10 requests/minute per wallet (`ATTN_API_RATE_LIMIT_*`).
- Nonces expire after `ATTN_API_NONCE_TTL_SECS` (default 300s) and are single-use.
- The `Idempotency-Key` header de-duplicates safe creation; repeated requests return the original response.

## REST endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/v1/squads/safes/nonce` | Issue a signed nonce for a creator wallet. |
| `POST` | `/v1/squads/safes` | Create a safe (requires nonce + creator signature). |
| `GET` | `/v1/squads/safes/:id` | Fetch stored status by request UUID. |
| `GET` | `/v1/squads/safes` | List requests (admin only, supports `status`, `creator_wallet`, `cluster`, `limit`). |
| `POST` | `/v1/squads/safes/:id/resubmit` | Retry a failed/submitted request (admin, `force` flag bypasses backoff). |
| `POST` | `/v1/squads/safes/:id/status` | Manually override status/safe metadata (admin). |
| `POST` | `/v1/squads/safes/:id/governance` | Attach a CreatorVault to a ready safe (requires creator + attn signatures). |
| `GET` | `/metrics` | Prometheus exposition of API and Squads metrics. |

All write endpoints return structured errors with `code` fields suitable for client handling (`creator_wallet_invalid`, `rate_limited`, `squads_create_failed`, etc.).

## Persistence & governance metadata

Safe requests persist in Postgres (`squads_safe_requests`) with:

- Attempt counters, timestamps, and `next_retry_at` for automated/manual backoff.
- Stored `creator_vault`, governance signatures, and `governance_linked_at` when the linkage succeeds.
- Request metadata (members, payload, idempotency key, requester API key & IP) for audit trails.
- Status reconciliation fields (`status_url`, `status_last_checked_at`, `status_last_response_hash`, `status_sync_error`) that
  feed the background poller described below.

`/v1/squads/safes/:id/governance` is idempotent, submitting the same CreatorVault + signatures updates the record in place.

### Status synchronization

- The API records any status webhook URL returned by Squads and stores the raw payload hash for change detection.
- A background worker polls due requests (`status='submitted'`, `next_retry_at <= now()`), promoting them to `ready` when
  Squads reports success, or rescheduling polling with exponential backoff when still pending.
- Failures to fetch the status URL populate `status_sync_error` and are surfaced in the admin UI; manual overrides remain
  available via `/v1/squads/safes/:id/status`.
- Readiness checks call `verify_safe_account` against the configured RPC endpoint to ensure the new multisig exists on-chain
  before marking a request `ready`.

## Metrics

Exported Prometheus metrics (served at `/metrics`):

- `squads_safe_requests_total{event,cluster}` – counters for `attempt`, `success`, `submitted`, and `failure` outcomes.
- `squads_safe_request_latency_seconds{cluster,outcome}` – histogram for end-to-end creation latency.
- `squads_safe_nonce_requests_total{result}` – nonce issuance counter.
- `squads_status_sync_total{result,cluster,reason}` – counters for status polling outcomes (`ready`, `pending`, `failed`,
  `error`).
- `squads_status_sync_latency_seconds{cluster,result}` – histogram covering end-to-end poll durations.

Alert on `squads_safe_requests_total{event="failure"}` spikes, on `squads_status_sync_total{result="error"}` exceeding a
baseline threshold, or on missing scrapes from `/metrics`. The UI readiness indicator also pings `/readyz` every 30 seconds
to highlight outages to operators.

### Example PromQL alerts

- `sum(rate(squads_safe_requests_total{event="failure"}[5m])) > 0` – signal if any create requests fail within a 5 minute
  window.
- `sum(rate(squads_status_sync_total{result="error"}[10m])) > 3` – alert when status polling repeatedly fails (indicates
  upstream or networking issues).

## Frontend configuration

The dapp reads the following public environment variables:

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_API_BASE` | Base URL for the authenticated API. |
| `NEXT_PUBLIC_ATTN_API_KEY` | API key to place in `X-API-Key`. |
| `NEXT_PUBLIC_CSRF_TOKEN` | Value for `X-ATTN-Client` header. |
| `NEXT_PUBLIC_SQUADS_ATTN_MEMBER` | Default attn co-signer address surfaced in the UI. |
| `NEXT_PUBLIC_SQUADS_ADMIN_MODE` | Set to `true`/`1` to expose admin tooling in the UI. |
| `NEXT_PUBLIC_SQUADS_ENABLED` | Feature flag for the creator onboarding UI (defaults to disabled). |

## Runbook & failure modes

1. **Nonce issuance failures (`rate_limited`, `wallet_not_allowed`)** – verify allowlist configuration and recent request volume; adjust rate limit environment variables if legitimate traffic exceeds defaults.
2. **Safe creation upstream errors (`squads_create_failed`)** – inspect metrics for failure spikes, fetch raw response from the UI, and retry via admin tools once the upstream resolves. The automatic backoff defaults to 120s.
3. **Manual overrides** – use `/v1/squads/safes/:id/status` to recover orphaned requests (e.g., safe created on Squads but webhook lost). Provide safe address + explorer URL and document the override in the optional note field.
4. **Governance linkage issues** – confirm both signatures match the displayed message. The admin UI can re-attempt linkage once signatures are corrected.
5. **Metrics/observability** – ensure Prometheus scrapes `/metrics`. Alert on sudden increases in `event="failure"` counts or missing scrapes.

## Environment summary

| Variable | Purpose |
| --- | --- |
| `ATTN_API_KEYS` | Comma-separated `id:key` pairs for API authentication. |
| `ATTN_API_ADMIN_KEYS` | Comma-separated API key IDs granted admin privileges. |
| `ATTN_API_CSRF_TOKEN` | Expected CSRF header value (default `attn-dapp`). |
| `ATTN_API_IP_ALLOWLIST` | Optional comma-separated IP allowlist. |
| `ATTN_API_WALLET_ALLOWLIST` | Optional comma-separated wallet allowlist. |
| `ATTN_API_RATE_LIMIT_PER_IP` / `_PER_WALLET` / `_WINDOW_SECS` | Rate limiting knobs. |
| `ATTN_API_NONCE_TTL_SECS` | Expiration for issued nonces (60–3600s). |
| `ATTN_API_SQUADS_BASE_URL` | `local` for demo mode or HTTPS endpoint for the Squads service. |
| `ATTN_API_SQUADS_ALLOW_INVALID_TLS` | When `true`, skip TLS certificate verification for the Squads HTTP client (useful for testing against staging endpoints). |
| `ATTN_API_SQUADS_API_KEY` / `_API_KEYS` | Primary + rotating bearer tokens for Squads HTTP calls. |
| `ATTN_API_SQUADS_DEFAULT_MEMBER` / `_CLUSTER` / `_THRESHOLD` / `_SAFE_PREFIX` | Default attn signer, cluster, threshold, and safe name prefix. |
| `ATTN_API_SQUADS_PAYER` | Optional payer wallet recorded alongside requests. |
| `ATTN_API_SQUADS_RPC_URL` / `_RPC_STRICT` | RPC endpoint used for wallet/safe sanity checks (strict mode fails creation when accounts are missing). |
| `ATTN_API_SQUADS_CONFIG_DIGEST` | Expected SHA-256 digest of the Squads config; mismatches fail startup to catch drift. |
| `ATTN_ENABLE_SQUADS` | Master toggle for the Squads integration (defaults to `0`). |
| `ATTN_ENABLE_SQUADS_STATUS_SYNC` / `ATTN_API_SQUADS_STATUS_SYNC_ENABLED` | Enable the background status poller when explicitly set to `true`. |
| `ATTN_KMS_SIGNER_KEY` | Cloud KMS resource path for the attn signer (ed25519) used for backend signatures. |
| `ATTN_KMS_PAYER_KEY` | Optional Cloud KMS resource path for the usered fee payer signer. |

## Curl quickstart

Issue a nonce and create a safe (replace placeholders with real values):

```bash
curl -X POST "${API_BASE}/v1/squads/safes/nonce" \
  -H "X-API-Key: ${API_KEY}" \
  -H "X-ATTN-Client: ${CSRF_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"creator_wallet":"<CREATOR_WALLET>"}'

curl -X POST "${API_BASE}/v1/squads/safes" \
  -H "X-API-Key: ${API_KEY}" \
  -H "X-ATTN-Client: ${CSRF_TOKEN}" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{
        "creator_wallet":"<CREATOR_WALLET>",
        "attn_wallet":"<ATTN_WALLET>",
        "cluster":"mainnet-beta",
        "nonce":"<NONCE>",
        "creator_signature":"<BASE58_SIGNATURE>"
      }'

curl -H "X-API-Key: ${API_KEY}" -H "X-ATTN-Client: ${CSRF_TOKEN}" \
  "${API_BASE}/v1/squads/safes/<REQUEST_ID>"
```

## SLOs

- **Availability:** 99.5% of nonce and create requests succeed (non-`5xx`) over a rolling 30-day window.
- **Status propagation:** 99% of submitted safes reach `ready` within 10 minutes when Squads reports success.
- **Readiness checks:** `/readyz` must respond `200` within 250 ms; the UI surfaces the current state via the readiness badge.
