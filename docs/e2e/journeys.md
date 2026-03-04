# Dapp E2E Journeys

Critical user journeys mapped to Playwright coverage in `apps/dapp-prod/tests/`.

| Journey | Priority | Playwright file | Status |
| --- | --- | --- | --- |
| Wallet connects and app shell renders | P0 | `apps/dapp-prod/tests/live-wallet.spec.ts` | Implemented |
| Onboarding flow reaches actionable state | P0 | `apps/dapp-prod/tests/live-onboarding.spec.ts` | Implemented |
| Sponsor/Squads detection path responds correctly | P1 | `apps/dapp-prod/tests/sponsor-squads-detection.spec.ts` | Implemented |
| Bridge proxy fallback behavior | P2 | `apps/dapp-prod/tests/bridge-proxy.spec.ts` | Implemented (ignored in default config) |

Notes:
- Default Playwright runs ignore `bridge-proxy.spec.ts` (`testIgnore`) to keep baseline runs stable.
- Evidence bundles for local runs are written under `tmp/e2e/YYYY-MM-DD/run-*/`.
