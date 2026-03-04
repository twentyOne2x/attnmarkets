# Plan: Frontend Evidence Loop (attnmarkets)

Last reviewed: 2026-03-04

Outcome: Completed. Journey docs, CI artifact upload, failure evidence capture, and local evidence bundling were added. Existing upstream test import issue remains.

## Objective
Add a repeatable frontend evidence baseline for `apps/dapp-prod` so local runs and CI both retain debugging artifacts and documented journey coverage.

## Non-goals
- Expanding business logic coverage beyond existing Playwright specs.
- Refactoring application code unrelated to e2e harness/reporting.

## Constraints / non-negotiables
- Select only one repo this run.
- Keep evidence bundles under `tmp/e2e/YYYY-MM-DD/`.
- Do not commit generated evidence artifacts.
- Keep CI changes minimal and backward-compatible with current workflow.

## Step-by-step plan
1. Create issue entry and this plan file before code changes.
2. Add `docs/e2e/journeys.md` mapping 3-5 critical journeys to current specs.
3. Update Playwright config in `apps/dapp-prod` to capture trace/video/screenshot on failures and support CI-configurable output paths.
4. Add an evidence bundle runner command that writes to `tmp/e2e/YYYY-MM-DD/run-*/`.
5. Update GitHub Actions CI to upload Playwright report and test-results artifacts.
6. Update ignore rules for `tmp/`, then run verification commands.
7. Close issue loop and move plan to completed.

## Verification plan
- `pnpm --filter dapp-prod exec playwright test --list`
- `pnpm --filter dapp-prod test:e2e:evidence -- --list`
- `git diff --name-only` confirms only intended files changed

Expected artifacts:
- `tmp/e2e/<date>/run-*/summary.json`
- `tmp/e2e/<date>/run-*/command.log`

## Rollback / recovery
- Revert only touched files in this branch if CI or local scripts regress.
- Remove added workflow steps if artifact upload causes failures.

## Decision log
- 2026-03-04: Chose `attnmarkets` because it is a frontend monorepo with existing Playwright tests but missing the requested evidence-loop documentation and artifact wiring.

## Progress log
- 2026-03-04: Created issue + plan; implementation in progress.
- 2026-03-04: Added docs, Playwright config updates, CI artifact upload, and evidence runner command.
- 2026-03-04: Verification executed; evidence bundle produced under `tmp/e2e/2026-03-04/`.
