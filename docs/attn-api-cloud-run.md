# attn_api Cloud Run Deployment

This guide packages the `attn_api` Axum server into a container and ships it to Google Cloud Run. The service is CPU-light and IO-bound, so Cloud Run's scale-to-zero model keeps costs low while still giving you HTTPS, automatic scaling, and IAM front-doors.

## 1. Prerequisites

- Google Cloud project with the Cloud Run, Artifact Registry, and Cloud Build APIs enabled.
- `gcloud` CLI authenticated against the project.
- Postgres instance reachable from Cloud Run (Cloud SQL, Neon, etc.).
- Collected API configuration values (see _Environment_ below).

Set common variables up front:

```bash
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export REPO="attn-api"
export IMAGE="us-docker.pkg.dev/${PROJECT_ID}/${REPO}/attn-api:$(git rev-parse --short HEAD)"
```

Create an Artifact Registry repository once per project (skip if it already exists):

```bash
gcloud artifacts repositories create "${REPO}" \
  --repository-format=docker \
  --location="${REGION}"
```

## 2. Build the container image

The repository now ships with a multi-stage Dockerfile at `protocol/crates/attn_api/Dockerfile`. Build and push the image with Cloud Build:

```bash
gcloud builds submit . \
  --tag "${IMAGE}" \
  --project "${PROJECT_ID}" \
  --timeout=30m
```

## 3. Environment Configuration

The binary reads its configuration from environment variables. The most important values in production are:

| Variable | Description |
| --- | --- |
| `ATTN_API_BIND_ADDR` | Optional. When unset the service binds to `0.0.0.0:${PORT}` (Cloud Run default: 8080). |
| `ATTN_API_DATA_MODE` | `postgres` for production (default) or `mock`. |
| `ATTN_API_DATABASE_URL` | Postgres connection string (required for `postgres` mode). |
| `ATTN_API_MAX_CONNECTIONS` | Optional pool cap (default: 8). |
| `ATTN_API_CLUSTER` | `devnet`, `mainnet`, etc. |
| `ATTN_API_KEYS` | Comma-separated API keys (at least one required). |
| `ATTN_API_CSRF_TOKEN` | Token shared with the frontend for bridge requests. |
| `ATTN_API_RATE_LIMIT_*` | Rate-limit controls (`PER_IP`, `PER_WALLET`, `WINDOW_SECS`). |
| `ATTN_API_SQUADS_*` | All Squads integration settings (base URL, API keys, signer wallet, cluster, threshold, RPC endpoint, optional payer, config digest). |

Store secrets in Secret Manager where possible and mount them via `--set-secrets` to avoid plaintext.

## 4. Deploy to Cloud Run

Deploy the service and wire in configuration (replace placeholders with your project’s secrets and URLs):

```bash
gcloud run deploy attn-api \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=4 \
  --concurrency=80 \
  --cpu=0.5 \
  --memory=512Mi \
  --set-env-vars "ATTN_API_DATA_MODE=postgres" \
  --set-env-vars "ATTN_API_CLUSTER=devnet" \
  --set-env-vars "ATTN_API_LIVE_ORIGIN=https://attn.markets" \
  --set-secrets "ATTN_API_DATABASE_URL=attn-api-db-url:latest" \
  --set-secrets "ATTN_API_KEYS=attn-api-keys:latest" \
  --set-secrets "ATTN_API_CSRF_TOKEN=attn-api-csrf:latest" \
  --set-secrets "ATTN_API_SQUADS_API_KEYS=attn-api-squads-api-keys:latest" \
  --set-secrets "ATTN_API_SQUADS_RPC_URL=attn-api-rpc-url:latest"
```

Attach any remaining environment variables using `--set-env-vars` or `--set-secrets` as needed (e.g. `ATTN_API_SQUADS_DEFAULT_MEMBER`, `ATTN_API_RFQ_LP_WALLET`, `ATTN_API_DEVNET_ALLOWLIST`).

### Database connectivity

If you use Cloud SQL, add the connector flag during deployment:

```bash
  --add-cloudsql-instances "${PROJECT_ID}:${REGION}:attn-api-postgres" \
  --set-env-vars "ATTN_API_DATABASE_URL=postgres://user:pass@localhost:5432/db"
```

The SQL proxy listens on `localhost`, so keep the host portion in the URL set to `localhost`.

### Post-deployment verification

1. Visit the Cloud Run URL (or your custom domain) and check `/readyz`.
2. Tail logs: `gcloud run services logs tail attn-api --project "${PROJECT_ID}" --region "${REGION}"`.
3. Confirm the Next.js production app points `NEXT_PUBLIC_API_BASE` at the Cloud Run HTTPS endpoint.

## 5. Local container testing (optional)

You can run the container locally to validate configuration:

```bash
docker build -f protocol/crates/attn_api/Dockerfile -t attn-api:local .
docker run --rm -it \
  -p 8080:8080 \
  -e ATTN_API_DATA_MODE=mock \
  attn-api:local
```

Switch to `postgres` mode by passing real env vars (e.g. `-e ATTN_API_DATABASE_URL=...`).

---

Once the service is live, point the production frontend’s `NEXT_PUBLIC_API_BASE` at the Cloud Run URL so that the `/api/bridge/*` proxy in Vercel forwards traffic to the new backend.
