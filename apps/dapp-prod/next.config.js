/** @type {import('next').NextConfig} */
const defaultApiBase =
  process.env.NEXT_PUBLIC_DEFAULT_API_BASE ??
  'https://attn-api-406386298457.us-central1.run.app';

const env = {
  NEXT_PUBLIC_PROGRAM_IDS:
    process.env.NEXT_PUBLIC_PROGRAM_IDS ??
    JSON.stringify({
      devnet: {
        stable_vault: '98jhX2iz4cec2evPKhLwA1HriVEbUAsMBo61bQpSef5Z',
        splitter: 'AmGu31S9SPLXj12etgXKnuVMzTNb653mRjkSqU8bgaPN',
        rewards_vault: '6M8TEGPJhspXoYtDvY5vd9DHg7ojCPgbrqjaWoZa2dfw',
        creator_vault: 'HDztZyNcij21HhF5SR6rhk9wx9qx6yViebUrVU9W6C86',
      },
    }),
  NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE ?? 'live',
  NEXT_PUBLIC_DEFAULT_API_BASE: defaultApiBase,
};

env.NEXT_PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? defaultApiBase;

const nextConfig = {
  experimental: {
    externalDir: true,
  },
  env,
};

module.exports = nextConfig
