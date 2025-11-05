import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { PlaywrightTestConfig } from '@playwright/test';

loadEnv({ path: path.resolve(__dirname, '.env.playwright') });
loadEnv({ path: path.resolve(__dirname, '.env') });
loadEnv();

const config: PlaywrightTestConfig = {
  testDir: './tests',
  testIgnore: ['bridge-proxy.spec.ts'],
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
  },
  webServer: {
    command: 'node scripts/start-playwright-server.js',
    port: 3100,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      USE_MOCK_API: process.env.USE_MOCK_API === '0' ? '0' : '1',
      NEXT_PUBLIC_API_BASE:
        process.env.USE_MOCK_API === '0'
          ? process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:3999'
          : 'http://127.0.0.1:3999',
      NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE ?? 'live',
      NEXT_PUBLIC_SQUADS_ENABLED: process.env.NEXT_PUBLIC_SQUADS_ENABLED ?? 'true',
      NEXT_PUBLIC_ATTN_API_KEY:
        process.env.NEXT_PUBLIC_ATTN_API_KEY ?? 'playwright-key',
      NEXT_PUBLIC_CSRF_TOKEN:
        process.env.NEXT_PUBLIC_CSRF_TOKEN ?? 'playwright-client',
      NEXT_PUBLIC_PROGRAM_IDS:
        process.env.NEXT_PUBLIC_PROGRAM_IDS ??
        '{"devnet":{"creator_vault":"HDztZyNcij21HhF5SR6rhk9wx9qx6yViebUrVU9W6C86","splitter":"AmGu31S9SPLXj12etgXKnuVMzTNb653mRjkSqU8bgaPN","rewards_vault":"6M8TEGPJhspXoYtDvY5vd9DHg7ojCPgbrqjaWoZa2dfw","stable_vault":"98jhX2iz4cec2evPKhLwA1HriVEbUAsMBo61bQpSef5Z"}}',
      NEXT_PUBLIC_SQUADS_ATTN_MEMBER:
        process.env.NEXT_PUBLIC_SQUADS_ATTN_MEMBER ??
        'BVQHZaUHBTWk2mfUFsaHdbBhe5EkxNz8nP7or1sHmmYQ',
      NEXT_PUBLIC_ALLOW_LOCAL_API_BASE:
        process.env.NEXT_PUBLIC_ALLOW_LOCAL_API_BASE ?? '1',
      NEXT_PUBLIC_CLUSTER: process.env.NEXT_PUBLIC_CLUSTER ?? 'devnet',
      NEXT_PUBLIC_ATTN_TEST: process.env.NEXT_PUBLIC_ATTN_TEST ?? '1',
    },
  },
};

export default config;
