import { test, expect, Page, APIRequestContext } from '@playwright/test';

const STORAGE_KEY = 'attn-market-app-state';
const TOUR_KEY = 'attn.liveSponsorTour';
const EXISTING_WALLET = 'ehNPTG1BUYU8jxn5TxhSmjrVt826ipHZChMkfkYNc8D';
const SAFE_REQUEST_ID = 'req-existing-safe-123';
const MOCK_API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:3999';
const SAFE_STORAGE_PREFIX = 'attn.squads.safe';

type TestNonce = {
  nonce: string;
  expires_at: string;
  ttl_seconds: number;
};

const buildSafeResponse = (wallet: string) => ({
  request_id: SAFE_REQUEST_ID,
  status: 'ready',
  safe_address: 'Safe111111111111111111111111111111111111111',
  transaction_url: 'https://explorer.solana.com/address/Safe111111111111111111111111111111111111111?cluster=devnet',
  status_url: 'https://attn.dev/status/' + SAFE_REQUEST_ID,
  cluster: 'devnet',
  threshold: 2,
  members: [wallet, 'Attn111111111111111111111111111111111111111'],
  creator_wallet: wallet,
  attn_wallet: 'Attn111111111111111111111111111111111111111',
  mode: 'http',
  raw_response: {},
  idempotency_key: 'imported-idempotency-key',
  attempt_count: 1,
  last_attempt_at: new Date().toISOString(),
  next_retry_at: null,
  status_last_checked_at: new Date().toISOString(),
  status_sync_error: null,
  status_last_response_hash: null,
  creator_vault: 'CreatorVault1111111111111111111111111111111',
  governance_linked_at: new Date().toISOString(),
  import_source: 'playwright-test',
  import_metadata: null,
  imported_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const prepareWalletState = async (page: Page, wallet: string) => {
  await page.addInitScript(
    ([walletKey, value, tourKey]) => {
      window.localStorage.setItem(walletKey, JSON.stringify({ currentUserWallet: value }));
      window.localStorage.setItem(tourKey, 'pending');
    },
    [STORAGE_KEY, wallet, TOUR_KEY]
  );
};

const seedSafeCache = async (page: Page, wallet: string, record: ReturnType<typeof buildSafeResponse>) => {
  const key = `${SAFE_STORAGE_PREFIX}.devnet.${wallet}`;
  await page.addInitScript(
    ([storageKey, safeRecord]) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ record: safeRecord, stored_at: Date.now() }));
    },
    [key, record]
  );
};

const resetMockApi = async (request: APIRequestContext) => {
  await request.post(`${MOCK_API_BASE}/__reset`);
};

const configureMockApi = async (
  request: APIRequestContext,
  config: { wallet: string; creatorSequence?: string[]; safe?: unknown }
) => {
  await request.post(`${MOCK_API_BASE}/__config`, { data: config });
};

test.describe('Sponsor Squads detection', () => {
  test.beforeEach(async ({ request }) => {
    await resetMockApi(request);
  });

  test('restores cached safe metadata on load without hitting the API', async ({ page, request }) => {
    const safePayload = buildSafeResponse(EXISTING_WALLET);
    await seedSafeCache(page, EXISTING_WALLET, safePayload);
    await prepareWalletState(page, EXISTING_WALLET);

    await page.route('**/api/bridge/v1/squads/safes/creator/**', async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
    });

    await page.goto('/sponsor');
    await expect(page.getByRole('heading', { name: 'Squads Safe Onboarding' })).toBeVisible();
    await expect(page.getByText('Existing Squads safe found')).toBeVisible();
    await expect(page.getByText(safePayload.safe_address!)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit safe request to attn' })).toHaveCount(0);
  });

  test('auto-loads existing safe for stored wallet', async ({ page, request }) => {
    const safePayload = buildSafeResponse(EXISTING_WALLET);
    await configureMockApi(request, {
      wallet: EXISTING_WALLET,
      creatorSequence: ['ready'],
      safe: safePayload,
    });

    await prepareWalletState(page, EXISTING_WALLET);

    await page.goto('/sponsor');
    const onboardingHeading = page.getByRole('heading', { name: 'Squads Safe Onboarding' });
    await onboardingHeading.waitFor({ state: 'visible' });

    await expect(page.getByText('Existing Squads safe found')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pump.fun CTO submission' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit safe request to attn' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open Pump.fun form' })).toBeVisible();
    await expect(page.getByText(safePayload.safe_address!)).toBeVisible();
  });

  test('updates sign message when attn:test:set-nonce fires', async ({ page }) => {
    await page.route('**/api/bridge/v1/squads/safes', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(pendingSafe),
      });
    });

    await prepareWalletState(page, EXISTING_WALLET);
    await page.goto('/sponsor');
    await expect(page.getByRole('heading', { name: 'Squads Safe Onboarding' })).toBeVisible();

    const firstNonce: TestNonce = {
      nonce: 'nonce-111',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      ttl_seconds: 600,
    };
    await page.evaluate((detail) => {
      window.dispatchEvent(new CustomEvent('attn:test:set-nonce', { detail }));
    }, firstNonce);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __attnLastNonce?: TestNonce }).__attnLastNonce?.nonce ?? null))
      .toBe('nonce-111');

    const secondNonce: TestNonce = {
      nonce: 'nonce-222',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      ttl_seconds: 600,
    };
    await page.evaluate((detail) => {
      window.dispatchEvent(new CustomEvent('attn:test:set-nonce', { detail }));
    }, secondNonce);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __attnLastNonce?: TestNonce }).__attnLastNonce?.nonce ?? null))
      .toBe('nonce-222');
  });

  test('duplicate event surfaces existing safe and clears signature', async ({ page }) => {
    await prepareWalletState(page, EXISTING_WALLET);
    await page.goto('/sponsor');
    await expect(page.getByRole('heading', { name: 'Squads Safe Onboarding' })).toBeVisible();

    const nonceDetail: TestNonce = {
      nonce: 'nonce-abc',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      ttl_seconds: 600,
    };
    await page.evaluate((detail) => {
      window.dispatchEvent(new CustomEvent('attn:test:set-nonce', { detail }));
    }, nonceDetail);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __attnLastNonce?: TestNonce }).__attnLastNonce?.nonce ?? null))
      .toBe('nonce-abc');

    const signatureValue = '1111111111111111111111111111111111111111111111111111111111111111';
    await page.evaluate((value) => {
      const input = document.querySelector('[data-testid="manual-signature-input"]') as HTMLInputElement | null;
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, signatureValue);

    const safePayload = buildSafeResponse(EXISTING_WALLET);
    await page.evaluate((payload) => {
      window.dispatchEvent(new CustomEvent('attn:test:set-result', { detail: { record: payload, type: 'existing' } }));
    }, safePayload);

    await expect(page.getByText('Existing Squads safe found')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit safe request to attn' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Pump.fun CTO submission' })).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __attnSquadsDebug?: { hasNonce?: boolean } }).__attnSquadsDebug?.hasNonce ?? null)
      )
      .toBe(true);
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), TOUR_KEY))
      .toBe('seen');
    await expect(page.getByText(safePayload.safe_address!)).toBeVisible();
  });

  test('recovers gracefully when backend returns nonce_invalid', async ({ page, request }) => {
    const safePayload = buildSafeResponse(EXISTING_WALLET);
    await configureMockApi(request, {
      wallet: EXISTING_WALLET,
      creatorSequence: ['not_found'],
      safe: safePayload,
    });

    await prepareWalletState(page, EXISTING_WALLET);

    await page.route('**/api/bridge/v1/squads/safes/nonce', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          nonce: `nonce-${Date.now()}`,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
          ttl_seconds: 600,
        }),
      });
    });

    let postCount = 0;
    await page.route('**/api/bridge/v1/squads/safes', async (route) => {
      postCount += 1;
      if (postCount === 1) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'nonce is expired or has already been used (nonce_invalid)' }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(safePayload),
      });
    });

    await page.goto('/sponsor');
    await expect(page.getByRole('heading', { name: 'Squads Safe Onboarding' })).toBeVisible();

    const initialNonce: TestNonce = {
      nonce: 'nonce-initial',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      ttl_seconds: 600,
    };
    await page.evaluate((detail) => {
      window.dispatchEvent(new CustomEvent('attn:test:set-nonce', { detail }));
    }, initialNonce);

    const signatureValue = '1111111111111111111111111111111111111111111111111111111111111111';
    const signatureInput = page.getByTestId('manual-signature-input');
    await signatureInput.fill(signatureValue);
    await expect(signatureInput).toHaveValue(signatureValue);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __attnSquadsDebug?: { hasNonce?: boolean } }).__attnSquadsDebug?.hasNonce ?? null
        )
      )
      .toBe(true);

    await page.getByRole('button', { name: 'Submit safe request to attn' }).click();

    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __attnSquadsDebug?: { hasNonce?: boolean } }).__attnSquadsDebug?.hasNonce ?? null)
      )
      .toBe(true);

    const errorBanner = page.getByText(/Nonce expired or already used/i);
    await expect(errorBanner).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __attnSquadsDebug?: { hasNonce?: boolean } }).__attnSquadsDebug?.hasNonce ?? null
        )
      )
      .toBe(true);

    await signatureInput.fill(signatureValue);
    await expect(signatureInput).toHaveValue(signatureValue);

    await page.getByRole('button', { name: 'Submit safe request to attn' }).click();

    await page.evaluate((payload) => {
      window.dispatchEvent(
        new CustomEvent('attn:test:set-result', {
          detail: { record: payload, type: 'existing' },
        })
      );
    }, safePayload);

    await expect(page.getByText('Existing Squads safe found')).toBeVisible();
  });

  test('throttles rapid submissions and surfaces cooldown messaging', async ({ page, request }) => {
    const pendingSafe = {
      ...buildSafeResponse(EXISTING_WALLET),
      status: 'queued',
      safe_address: null,
    };
    await configureMockApi(request, {
      wallet: EXISTING_WALLET,
      creatorSequence: ['not_found'],
      safe: pendingSafe,
    });

    let requestTriggered = false;
    await page.route('**/api/bridge/v1/squads/safes', async (route) => {
      requestTriggered = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(pendingSafe),
      });
    });

    await prepareWalletState(page, EXISTING_WALLET);
    await page.goto('/sponsor');
    await expect(page.getByRole('heading', { name: 'Squads Safe Onboarding' })).toBeVisible();

    const nonceDetail: TestNonce = {
      nonce: 'nonce-cooldown',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      ttl_seconds: 600,
    };
    await page.evaluate((detail) => {
      window.dispatchEvent(new CustomEvent('attn:test:set-nonce', { detail }));
    }, nonceDetail);

    const signatureValue = '1111111111111111111111111111111111111111111111111111111111111111';
    const signatureInput = page.getByTestId('manual-signature-input');
    await signatureInput.fill(signatureValue);

    const submitButton = page.getByRole('button', { name: 'Submit safe request to attn' });

    await expect(signatureInput).toHaveValue(signatureValue);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __attnSquadsDebug?: { hasNonce?: boolean } }).__attnSquadsDebug?.hasNonce ?? null
        )
      )
      .toBe(true);

    await expect(submitButton).toBeEnabled();
    await submitButton.click();
    await expect.poll(() => requestTriggered).toBe(true);
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toHaveText('Cooling down…');
    await expect(page.getByText(/Hold tight—we're refreshing your Squads request state/i)).toBeVisible();

    await page.evaluate(() => {
      const form = document.querySelector('[data-testid="sponsor-safe-form"]') as HTMLFormElement | null;
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });
});
