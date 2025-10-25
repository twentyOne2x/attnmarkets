# attn Advance (15-Day Yield Sale)

The advance feature lets a creator convert the next 15 days of yield token (YT) cash flow into upfront USDC while keeping ownership of their principal token (PT). There is **no debt**: the user simply sells newly minted YT to the protocol LP and can buy it back any time before maturity.

## Flow Overview

1. **Mint PT/YT:** Splitter burns Standardized Yield (SY) and mints matched PT and YT for the target market.
2. **Quote:** Backend returns RFQ quotes via `GET /v1/markets/:market/yt-quote?size=<SY>&maturity=<ts>&side=sell|buyback` with weak ETags.
3. **Sell YT (Advance):** RFQ trade persists quote metadata and caps. Frontend transfers the quoted YT amount to the LP ATA and receives USDC in the same transaction.
4. **Buyback (Optional):** A reverse RFQ quotes the YT required to close the position; user transfers USDC to the LP ATA and regains YT exposure.
5. **Maturity:** Any remaining YT held by external buyers settles into that period’s fees; creators keep PT for principal redemption.

## API Surface

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/markets/:id/yt-quote` | GET | Returns cached RFQ quotes with weak ETags; supports `side=sell` (advance) and `side=buyback`. |
| `/v1/rfq/yt-sell` | POST | Consumes a sell quote, records wallet/epoch caps, responds with settlement instructions and cap snapshot. |
| `/v1/rfq/yt-buyback` | POST | Consumes a buyback quote; decrements wallet/epoch usage accordingly. |
| `/v1/governance` | GET | Includes `advance_enabled` per market via creator governance. |

All reads retain the existing cache headers: `Cache-Control: private, max-age=0, must-revalidate` and weak ETags. Writes hard-fail unless the server is running in `devnet` cluster mode.

## Caps & Security

- **Wallet cap:** `ATTN_API_ADVANCE_MAX_PER_WALLET_USDC` (default 5k) enforced per `{wallet, market, maturity}` epoch.
- **Epoch cap:** `ATTN_API_ADVANCE_MAX_PER_EPOCH_USDC` (default 100k) shared across wallets.
- **Allowlist:** `ATTN_API_DEVNET_ALLOWLIST` restricts RFQ execution to approved wallets on devnet.
- Quotes expire after `ATTN_API_QUOTE_TTL_SECS` (default 30s); consumed quotes cannot be replayed.

## Frontend Experience

- New `/markets/[market]` route shows implied rate, time to maturity, and gated CTAs based on Live mode, devnet cluster, wallet status, governance pause, and `advance_enabled` flag.
- Advance panel fetches a quote, mints PT/YT, and sells YT via the new actions (`mintPtYt`, `sellYt`).
- Buyback panel mirrors the flow for early repayment using `buybackYt`.
- Demo mode synthesises quotes & trades so designers can preview the UX without a backend.

## Copy & Disclaimers

- CTA: **“Get 15-day advance”**
- Subtext: *“We sell your next 15 days of yield. No loan. Buy back anytime.”*
- Tooltip: *“Mints PT/YT and sells YT for upfront USDC. Early ‘repay’ = buy YT back. At maturity buyers keep that period’s yield.”*
- Footer disclaimer now reads: **“This is a sale of future yield, not a loan.”**

## Cypress Coverage

Add `cypress/e2e/advance.cy.ts` to:
- Toggle Live/devnet mode (stub `/readyz`, `/version`).
- Intercept quote fetch with fixture data.
- Assert 304 path for cached quotes.
- Complete a tiny advance & buyback loop while verifying portfolio refresh calls.

## Environment Variables

```
ATTN_API_CLUSTER=devnet
ATTN_API_ADVANCE_MAX_PER_WALLET_USDC=5000
ATTN_API_ADVANCE_MAX_PER_EPOCH_USDC=100000
ATTN_API_QUOTE_TTL_SECS=30
ATTN_API_DEVNET_ALLOWLIST=<comma-separated wallet list>
ATTN_API_RFQ_LP_WALLET=<LP wallet pubkey>
```

Keep this document updated as the RFQ backend transitions to the AMM-based pricing path or when additional guardrails (e.g. rate limits, signature capture) are introduced.
