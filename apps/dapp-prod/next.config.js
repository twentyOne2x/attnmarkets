/** @type {import('next').NextConfig} */
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
};

if (process.env.NEXT_PUBLIC_API_BASE) {
  env.NEXT_PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_BASE;
} else if (process.env.NODE_ENV !== 'production') {
  env.NEXT_PUBLIC_API_BASE = 'http://localhost:8080';
}

const nextConfig = {
  experimental: {
    externalDir: true,
  },
  env,
};

module.exports = nextConfig
