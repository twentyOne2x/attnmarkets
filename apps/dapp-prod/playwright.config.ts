import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests',
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
      NEXT_PUBLIC_API_BASE: 'https://test.attn.dev',
      NEXT_PUBLIC_DATA_MODE: 'demo',
      NEXT_PUBLIC_SQUADS_ENABLED: '1',
      NEXT_PUBLIC_PROGRAM_IDS:
        '{"devnet":{"creator_vault":"HDztZyNcij21HhF5SR6rhk9wx9qx6yViebUrVU9W6C86","splitter":"AmGu31S9SPLXj12etgXKnuVMzTNb653mRjkSqU8bgaPN","stable_vault":"98jhX2iz4cec2evPKhLwA1HriVEbUAsMBo61bQpSef5Z","rewards_vault":"6M8TEGPJhspXoYtDvY5vd9DHg7ojCPgbrqjaWoZa2dfw"}}',
    },
  },
};

export default config;
