# Issues

## 2026-03-04 - Frontend evidence loop baseline for dapp-prod e2e

PLANNER
- Type: Feature
- Status: Completed (with existing test import blocker)
- Spec check: Solvable with existing `apps/dapp-prod` Playwright tests and CI pipeline.
- Context + suspected cause: Playwright runs exist, but failure evidence capture/reporting and journey-to-test documentation were not standardized at repo level.
- Fix intent: Add documented journeys, deterministic evidence outputs, CI artifact upload, and local evidence bundling under `tmp/e2e/YYYY-MM-DD/`.
- Acceptance criteria:
  - `docs/e2e/journeys.md` exists with 3-5 critical journeys mapped to Playwright specs.
  - Playwright config captures `trace`, `video`, and `screenshot` on failures.
  - GitHub Actions runs Playwright and uploads HTML report + test-result artifacts.
  - A local command writes an evidence bundle under `tmp/e2e/YYYY-MM-DD/run-*/`.
  - `tmp/` is ignored by git.
- Complexity: medium
- Plan: `docs/plans/active/2026-03-04-frontend-evidence-loop.md`
- Executor prompt: Update `apps/dapp-prod` Playwright + scripts, add docs/CI wiring, run lightweight verification (`playwright test --list`), and collect proof artifacts.

Checklist
- [x] Report captured
- [x] Context added
- [x] Fix applied
- [x] Tests run
- [ ] Visual/screenshot verification (not provided)

EXECUTOR
- Implement changes and collect command evidence.

VERIFIER
- Proof summary:
  - `docs/e2e/journeys.md` created with 4 critical journeys mapped to Playwright specs.
  - Playwright config now retains failure evidence (`trace`, `video`, `screenshot`) and supports CI-controlled report/output paths.
  - CI now uploads `apps/dapp-prod/playwright-report` and `apps/dapp-prod/test-results` artifacts.
  - Local evidence command writes under `tmp/e2e/YYYY-MM-DD/run-*/` and produced bundle:
    - `tmp/e2e/2026-03-04/run-2026-03-04T17-04-16-900Z/summary.json`
    - `tmp/e2e/2026-03-04/run-2026-03-04T17-04-16-900Z/command.log`
- Verification result: PASS for this automation scope.
- Residual risk: existing Playwright import error in `apps/dapp-prod/tests/sponsor-squads-detection.spec.ts` (`../app/user/constants`) keeps current test listing failing.
