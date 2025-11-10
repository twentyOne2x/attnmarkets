# squads-safe-worker

Create a Squads multisig (safe) on Solana with the official SDK and return
`{ safe_address, tx_signature }`.

## Environment

| Variable | Description |
| --- | --- |
| `ATTN_SIGNER_BASE58` | Base58-encoded 64-byte secret key (funded, signs the create tx). |
| `SOLANA_RPC_URL` | Solana RPC endpoint, e.g. `https://api.devnet.solana.com`. |
| `CLUSTER` | `devnet` or `mainnet`. Defaults to `devnet`. |
| `PORT` | Optional HTTP port (default 8080). |
| `DRY_RUN` | Set to `1` in tests to skip chain calls and return a deterministic fake address. |

## Build & Run Locally

```bash
npm ci
npm run build
PORT=8080 DRY_RUN=1 ATTN_SIGNER_BASE58=<base58-secret> node dist/server.js
curl -X POST :8080/v1/squads/safe \
  -H 'content-type: application/json' \
  -d '{"members":["<pk1>","<pk2>"],"threshold":2,"idempotencyKey":"idem-1"}'
```

## Tests

```bash
npm test
```

## Deploy to Cloud Run

```bash
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/PROJECT/attn/squads-safe-worker:1

gcloud run deploy squads-safe-worker \
  --image us-central1-docker.pkg.dev/PROJECT/attn/squads-safe-worker:1 \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars=CLUSTER=devnet,SOLANA_RPC_URL=https://api.devnet.solana.com \
  --set-secrets=ATTN_SIGNER_BASE58=attn-signer-secret:latest
```

## HTTP Surface

- `GET /readyz` → `{"status":"ok"}`
- `POST /v1/squads/safe` → `{"status":"ready","safe_address":"...","tx_signature":"...","cluster":"devnet"}`

Configure `attn_api` to target the worker:

```bash
gcloud run services update attn-api \
  --region us-central1 \
  --update-env-vars=ATTN_API_SQUADS_MODE=http,ATTN_API_SQUADS_BASE_URL=https://<WORKER_URL>,ATTN_API_SQUADS_CREATE_PATHS=/v1/squads/safe
```

Resubmit the existing safe request (`3144a127-79da-462d-8fb9-45ba343cb53a`) after deployment.
