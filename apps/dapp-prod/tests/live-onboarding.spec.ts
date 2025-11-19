import { test, expect } from '@playwright/test';

test.describe('Creator live onboarding', () => {
  test('surfaces Squads safe checklist when switching to Live mode', async ({ page }) => {
    await page.route('**/api/bridge/readyz', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });
    await page.route('**/api/bridge/version', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"version":"test"}',
      });
    });
    await page.route('**/api/bridge/v1/overview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_creator_vaults: 1,
          total_markets: 1,
          total_fees_collected_sol: 12.5,
          attnusd_supply: 1000,
          attnusd_nav: 100.25,
          updated_at: new Date().toISOString(),
        }),
      });
    });
    await page.route('**/api/bridge/v1/attnusd', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_supply: 1000,
          nav_sol: 100.25,
          price_per_share: 1,
          seven_day_apy: 0.12,
          last_rebalance_slot: 123,
          updated_at: new Date().toISOString(),
        }),
      });
    });
    await page.route('**/api/bridge/v1/markets', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            market: 'MARKET1',
            pump_mint: 'PumpMint1111111111111111111111111111111',
            creator_vault: 'CreatorVault1111111111111111111111111111',
            creator_authority: 'CreatorAuth111111111111111111111111111',
            sy_mint: 'SyMint11111111111111111111111111111111',
            pt_mint: 'PtMint11111111111111111111111111111111',
            yt_mint: 'YtMint11111111111111111111111111111111',
            maturity_ts: Math.floor(Date.now() / 1000) + 86400,
            pt_supply: 1000,
            yt_supply: 1000,
            implied_apy: 0.42,
            status: 'active',
            admin: 'Admin111111111111111111111111111111111',
          },
        ]),
      });
    });
    await page.route('**/api/bridge/v1/governance', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          creator_vaults: [
            {
              creator_vault: 'CreatorVault1111111111111111111111111111',
              pump_mint: 'PumpMint1111111111111111111111111111111',
              admin: 'Admin111111111111111111111111111111111',
              sol_rewards_bps: 500,
              paused: false,
              sy_mint: 'SyMint11111111111111111111111111111111',
              advance_enabled: true,
            },
          ],
          rewards_pools: [],
          stable_vault: {
            stable_vault: 'StableVault111111111111111111111111111',
            admin: 'Admin111111111111111111111111111111111',
            keeper_authority: 'Keeper111111111111111111111111111111',
            authority_seed: 'seed',
            share_mint: 'ShareMint111111111111111111111111111',
            stable_mint: 'StableMint11111111111111111111111111',
            pending_sol_lamports: 0,
            paused: false,
            last_sweep_id: 0,
            last_conversion_id: 0,
          },
        }),
      });
    });
    await page.route('**/api/bridge/v1/rewards?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pools: [] }),
      });
    });
    await page.route('**/api/bridge/v1/portfolio/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          wallet: 'demo-wallet',
          deposits: [],
          positions: [],
          total_value_usdc: 0,
          updated_at: new Date().toISOString(),
        }),
      });
    });
    await page.route('**/api/bridge/readyz', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      });
    });
    await page.route('**/api/bridge/version', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '0.0.0', git_sha: 'test', built_at_unix: 0 }),
      });
    });

    await page.goto('/creator');
    await expect(page.getByRole('heading', { name: /User Console/i, level: 1 })).toBeVisible({
      timeout: 120_000,
    });

    await page.waitForFunction(() => document.body.dataset.attnMode === 'live', null, {
      timeout: 60_000,
    });

    const liveBadge = page.getByLabel(
      'Solana devnet active. Switch your wallet to Devnet (Phantom: Settings → Change Network → Devnet. Backpack: Avatar → Network → Devnet).'
    );
    const connectButton = page.getByRole('button', { name: /Connect Wallet/i }).first();
    const gatingCallout = page.locator('text=Complete Squads setup to unlock financing');

    await expect(liveBadge).toBeVisible({ timeout: 30_000 });
    await expect(connectButton).toBeVisible();
    await expect(gatingCallout).toBeVisible();
    const networkReminder = page.locator('text=Set your wallet network to');
    await expect(networkReminder).toBeVisible();
    await page.screenshot({
      path: 'test-artifacts/live-mode.png',
      fullPage: true,
    });

    const tourHeading = page.getByRole('heading', { name: 'Start with your Squads safe' });
    await expect(tourHeading).toBeVisible();
    await page.locator('div[role="presentation"]').click({ force: true });
    await expect(tourHeading).toHaveCount(0);

    const walletModal = page.locator('.wallet-adapter-modal');
    if (await walletModal.count()) {
      const closeButton = walletModal.locator('button.wallet-adapter-modal-button-close, button.wallet-adapter-modal-close');
      if (await closeButton.count()) {
        await closeButton.first().click();
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(walletModal).toHaveCount(0);
    }

    const openSquadsLink = page.getByRole('link', { name: 'Open Squads setup' });
    await expect(openSquadsLink).toBeVisible();
    await openSquadsLink.click();
    await expect(page.getByRole('heading', { name: 'Squads Safe Onboarding' })).toBeVisible({
      timeout: 10_000,
    });
    const squadsSection = page.locator('#squads-setup');
    await expect(squadsSection).toBeVisible();
    await squadsSection.screenshot({
      path: 'test-artifacts/squads-onboarding.png',
    });
  });
});
