import { expect, test } from '@playwright/test';

const walletUnderTest = process.env.NEXT_PUBLIC_WALLET_UNDER_TEST;
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '';
const shouldRun = Boolean(
  walletUnderTest &&
  apiBase &&
  /https?:\/\//i.test(apiBase) &&
  !/localhost|127\.0\.0\.1/i.test(apiBase)
);

test.describe('Live Squads safe regression', () => {
  test.skip(!shouldRun, 'Live API environment variables not configured');

  test('loads Squads safe status for configured wallet', async ({ page }) => {
    await page.goto('/sponsor');

    const safeForm = page.getByTestId('sponsor-safe-form');
    await safeForm.waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {});

    if (await safeForm.isVisible()) {
      const walletInput = safeForm.getByPlaceholder('Enter the wallet that will own the safe');
      await walletInput.fill(walletUnderTest as string);
      await walletInput.blur();
    }

    const statusValue = page.getByTestId('safe-status-value');
    await expect(statusValue).toHaveText(/ready|submitted|pending|failed/i, {
      timeout: 180_000,
    });

    const statusText = (await statusValue.innerText()).toLowerCase();
    if (statusText === 'ready') {
      await expect(page.getByTestId('safe-address-value')).not.toHaveText(/pending/i);
    }
  });
});
