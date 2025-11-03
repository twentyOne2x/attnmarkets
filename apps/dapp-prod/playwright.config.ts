import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests',
  testIgnore: ['bridge-proxy.spec.ts'],
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
  },
  webServer: {
    command: 'pnpm --filter dapp-prod start --hostname 127.0.0.1 --port 3100',
    port: 3100,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:3999',
      NEXT_PUBLIC_DATA_MODE: 'live',
      NEXT_PUBLIC_SQUADS_ENABLED: '1',
      NEXT_PUBLIC_ATTN_API_KEY: 'playwright-key',
      NEXT_PUBLIC_CSRF_TOKEN: 'playwright-client',
      NEXT_PUBLIC_PROGRAM_IDS:
        '{"devnet":{"creator_vault":"FtxLUmapXBT49yd5HUHS3hLp6foGBqgmR9ptxtK9dQcN","splitter":"abyjw2sS6VbdWXN74Xxk2haCQCeQsAfmzefLWCXuiG41","stable_vault":"CsUN3UqbrE8CFRG6dctmKu1F7ZJ6hNzqdK2JKJwgKi4W","rewards_vault":"W5dWeZQqTGG6w7xQEhoDueKPQPGpgRkUF468CEY2k1cr"}}',
      NEXT_PUBLIC_ALLOW_LOCAL_API_BASE: '1',
    },
  },
};

export default config;
