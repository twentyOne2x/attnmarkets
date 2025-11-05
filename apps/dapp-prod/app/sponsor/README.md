# Sponsor Safe Detection

This directory houses the sponsor dashboard experience, including the Squads safe onboarding flow and its supporting utilities.

## Storage keys

Tour dismissal state is persisted per wallet and cluster using keys built by `buildLiveTourStorageKey()`.
The shape is `attn.liveSponsorTour::<cluster>::<wallet>`. Migrating from the legacy singleton key happens automatically when the onboarding component mounts with a known wallet. Always derive keys through the helper to avoid drift.

## Detection lifecycle

`SquadsSafeOnboarding` requests Squads status and calls `onSafeDetected` exactly once per `request_id` unless the backend reports a terminal failure. Detection also completes when cached metadata or a manual test signal loads. The component emits a single breadcrumb (sampled at 10%) so regressions can be debugged without flooding the console.

## Test hooks

`safeDetectionEmitter.ts` exposes `emitSafeDetected`/`subscribeToSafeDetection` for Playwright scenarios. These hooks are active only when `NEXT_PUBLIC_ATTN_TEST=1`, preventing accidental broadcasts in production.

## SSR guardrails

All direct DOM access and storage usage is wrapped in `typeof window !== 'undefined'` checks so the pages can render during SSR without errors.
