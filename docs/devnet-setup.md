# Devnet Setup Checklist

This guide captures the steps taken while wiring the autosweeper + financing stack on
Solana devnet. It is meant to be followed end-to-end whenever we refresh program
deployments or roll new vaults.

## 1. Build and Deploy Programs

```
./scripts/deploy-devnet.sh creator_vault
./scripts/deploy-devnet.sh rewards_vault
./scripts/deploy-devnet.sh splitter
```

> `rewards_vault` and `splitter` require ~3.1 SOL each for the upgradeable buffer. If
> the wallet drops below that threshold, top it up via the devnet faucet or an
> auxiliary funding wallet before redeploying.
> If Anchor errors while recreating the IDL account (already in use), re-run the
> deploy with `anchor deploy --program-name rewards_vault --no-idl`.

## 2. Mint Test Assets

Create the placeholder SPL mints used by the devnet flow:

```
spl-token create-token                   # pump mint (9 decimals)
spl-token create-token --decimals 6      # quote mint
spl-token create-token --decimals 6      # attnUSD mint

spl-token create-account <mint>
spl-token mint <mint> 1000
```

Record the three mint addresses. For the current session we minted:

- Pump mint: `DY2GMRmtQqCBTQFNCfeYZJFLRt9usVJNmZViTx2djW49`
- Quote mint: `H6h8Dheeg2gVSHsEroCcT8zy4EFh2yuvy8ihUXzxn1CJ`
- attnUSD mint: `8sU4UNFCr4bVN79XDfKZuZGMUhSj6CvyCBQMETwkdzEv`

## 3. Initialize the Creator Vault

```
cargo run -p attn_cli -- --url https://api.devnet.solana.com \
  creator initialize \
  --pump-creator <pump_creator_pda_or_wallet> \
  --pump-mint DY2GMRmtQqCBTQFNCfeYZJFLRt9usVJNmZViTx2djW49 \
  --quote-mint H6h8Dheeg2gVSHsEroCcT8zy4EFh2yuvy8ihUXzxn1CJ \
  --splitter-program AmGu31S9SPLXj12etgXKnuVMzTNb653mRjkSqU8bgaPN
```

The command prints the new PDAs. Current vault deployment:

- Creator vault: `F59VzNTJzwLHhEAMXdgcFSG7BAomEE9v2HthgERryV3G`
- Fee vault: `HN41nBgLMX1muHNXczTwLmCkRfK6YdqpZ2aCFYBAdkgp`
- SY mint: `5rSnbBhCLZ7kcEEsYhuwLy9tL2G9EErbkEy7KwV8ahYZ`

## 4. Rewards Vault Bootstrap (after redeploy)

Once `rewards_vault` is upgraded (3.0 SOL buffer funded), initialise the SOL staking
pool:

```
cargo run -p attn_cli -- --url https://api.devnet.solana.com \
  rewards initialize \
  --creator-vault F59VzNTJzwLHhEAMXdgcFSG7BAomEE9v2HthgERryV3G \
  --attn-mint 8sU4UNFCr4bVN79XDfKZuZGMUhSj6CvyCBQMETwkdzEv \
  --reward-bps 100 \
  --allowed-funder <funding_wallet>

cargo run -p attn_cli -- --url https://api.devnet.solana.com \
  rewards derive --creator-vault F59VzNTJzwLHhEAMXdgcFSG7BAomEE9v2HthgERryV3G
```

The derive helper confirms PDAs for the rewards pool, authority, sAttn mint, attnUSD
vault, and SOL treasury. These values are needed for downstream wiring (keeper,
frontend configuration, alerts).

## 5. Wrap / Split Smoke Test

```
cargo run -p attn_cli -- --url https://api.devnet.solana.com \
  wrap --pump-mint DY2GMRmtQqCBTQFNCfeYZJFLRt9usVJNmZViTx2djW49 --amount 100
```

After a splitter market is in place, the following exercises the PT/YT mint and
stakes attnUSD into the rewards pool:

```
cargo run -p attn_cli -- --url https://api.devnet.solana.com split --market <market_pubkey> --amount 100
cargo run -p attn_cli -- --url https://api.devnet.solana.com rewards stake --creator-vault F59VzNTJzwLHhEAMXdgcFSG7BAomEE9v2HthgERryV3G --attn-mint 8sU4UNFCr4bVN79XDfKZuZGMUhSj6CvyCBQMETwkdzEv --amount 100
cargo run -p attn_cli -- --url https://api.devnet.solana.com rewards fund --creator-vault F59VzNTJzwLHhEAMXdgcFSG7BAomEE9v2HthgERryV3G --amount 500000000 --operation-id 1
cargo run -p attn_cli -- --url https://api.devnet.solana.com rewards claim --creator-vault F59VzNTJzwLHhEAMXdgcFSG7BAomEE9v2HthgERryV3G
```

## 6. Funding Notes

- The official faucet (`https://api.devnet.solana.com` or https://faucet.solana.com)
  allows **2 requests per 8 hours per wallet**. Keep an auxiliary keypair handy if we
  need to shuttle SOL into the deployer quickly.
- If the faucet quota is exhausted, browser-driven services (QuickNode, Ankr, Helius)
  can top up the deployer—complete their CAPTCHA flow with
  `J4PNQ4BgbM5pJs8gkvfoDufaKQe8QdWZ9afTJLAGPZns` as the address.
- Closing unused token accounts and demo mints returns rent (~0.002 SOL each). That’s
  helpful for cleanup but not a substitute for buffer funding.

Document any new program IDs, mints, or vault PDAs here as the devnet environment
evolves.
