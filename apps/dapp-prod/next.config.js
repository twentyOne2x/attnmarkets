/** @type {import('next').NextConfig} */
const env = {
  NEXT_PUBLIC_PROGRAM_IDS:
    process.env.NEXT_PUBLIC_PROGRAM_IDS ??
    JSON.stringify({
      devnet: {
        stable_vault: '98jhX2iz4cec2evPKhLwA1HriVEbUAsMBo61bQpSef5Z',
        splitter: 'DusRTfShkXozaatx71Qv413RNEXqPNZS8hg9BnBeAQQE',
        rewards_vault: 'RwdsVaULTxQg7vKQmsG9tPo8mWxryQac1hZ2RKSBv2C',
        creator_vault: 'HPjEgPTb7rrBks1oFrscBdJ7TCZ7bARzCT93X9azCK4b',
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
