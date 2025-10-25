import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { program } from '@/app/lib/anchor';
import { RewardsVaultIdl } from '@/app/idl';
import { PIDS } from '@/app/lib/programIds';
import { ensureAta, fetchMintDecimals, uiToBn } from './helpers';

const REWARDS_AUTHORITY_SEED = Buffer.from('rewards-authority');
const STAKE_POSITION_SEED = Buffer.from('stake-position');
const SOL_TREASURY_SEED = Buffer.from('sol-treasury');

const deriveRewardsAuthority = (pool: PublicKey, programId: PublicKey): PublicKey => {
  const [authority] = PublicKey.findProgramAddressSync(
    [REWARDS_AUTHORITY_SEED, pool.toBuffer()],
    programId,
  );
  return authority;
};

const deriveStakePosition = (pool: PublicKey, staker: PublicKey, programId: PublicKey): PublicKey => {
  const [stakePosition] = PublicKey.findProgramAddressSync(
    [STAKE_POSITION_SEED, pool.toBuffer(), staker.toBuffer()],
    programId,
  );
  return stakePosition;
};

const deriveSolTreasury = (pool: PublicKey, programId: PublicKey): PublicKey => {
  const [treasury] = PublicKey.findProgramAddressSync(
    [SOL_TREASURY_SEED, pool.toBuffer()],
    programId,
  );
  return treasury;
};

export async function stakeAttnUSD(
  wallet: any,
  accounts: {
    pool: string;
    staker: string;
    attnMint: string;
    attnVault: string;
    sAttnMint: string;
  },
  amountUi: string,
  decimals?: number,
) {
  if (!PIDS.rewards_vault) {
    throw new Error('Rewards vault program id missing');
  }
  if (!wallet?.publicKey) {
    throw new Error('Wallet not connected');
  }

  const poolPk = new PublicKey(accounts.pool);
  const stakerPk = new PublicKey(accounts.staker);
  const attnMintPk = new PublicKey(accounts.attnMint);
  const attnVaultPk = new PublicKey(accounts.attnVault);
  const sAttnMintPk = new PublicKey(accounts.sAttnMint);
  const programId = new PublicKey(PIDS.rewards_vault);

  const prog = program(RewardsVaultIdl as any, PIDS.rewards_vault, wallet);
  const provider = (prog as any).provider;

  const mintDecimals =
    decimals !== undefined ? decimals : await fetchMintDecimals(provider, attnMintPk);
  const amount = uiToBn(amountUi, mintDecimals);

  const userPubkey = wallet.publicKey as PublicKey;
  const userAttnAta = await ensureAta(provider, stakerPk, attnMintPk, userPubkey);
  const userSAttnAta = await ensureAta(provider, stakerPk, sAttnMintPk, userPubkey);
  const rewardsAuthority = deriveRewardsAuthority(poolPk, programId);
  const stakePosition = deriveStakePosition(poolPk, stakerPk, programId);
  const solTreasury = deriveSolTreasury(poolPk, programId);

  await prog.methods
    .stakeAttnusd(amount)
    .accounts({
      rewardsPool: poolPk,
      rewardsAuthority,
      staker: stakerPk,
      userAttnAta,
      userSAttnAta,
      attnVault: attnVaultPk,
      attnMint: attnMintPk,
      sAttnMint: sAttnMintPk,
      stakePosition,
      solTreasury,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}
