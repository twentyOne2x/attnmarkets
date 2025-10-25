import BN from 'bn.js';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  getMint,
} from '@solana/spl-token';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { program } from '@/app/lib/anchor';
import { RewardsVaultIdl } from '@/app/idl';
import { PIDS } from '@/app/lib/programIds';

const REWARDS_AUTHORITY_SEED = Buffer.from('rewards-authority');
const STAKE_POSITION_SEED = Buffer.from('stake-position');
const SOL_TREASURY_SEED = Buffer.from('sol-treasury');

const uiToBn = (input: string, decimals: number): BN => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Amount is required');
  }
  if (!/^\d*(\.\d*)?$/.test(trimmed)) {
    throw new Error('Invalid amount format');
  }
  const [rawInt, rawFrac = ''] = trimmed.split('.');
  const intPart = rawInt.replace(/^0+(?=\d)/, '') || '0';
  if (rawFrac.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places`);
  }
  const fracPart = rawFrac.padEnd(decimals, '0').slice(0, decimals);
  const digits = `${intPart}${fracPart}`;
  const bn = new BN(digits);
  if (bn.isZero()) {
    throw new Error('Stake amount must be greater than zero');
  }
  return bn;
};

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

  const mintInfo =
    decimals !== undefined
      ? { decimals }
      : await getMint(provider.connection, attnMintPk, 'confirmed');
  const amount = uiToBn(amountUi, mintInfo.decimals);

  const userAttnAta = getAssociatedTokenAddressSync(attnMintPk, stakerPk);
  const userSAttnAta = getAssociatedTokenAddressSync(sAttnMintPk, stakerPk);
  const rewardsAuthority = deriveRewardsAuthority(poolPk, programId);
  const stakePosition = deriveStakePosition(poolPk, stakerPk, programId);
  const solTreasury = deriveSolTreasury(poolPk, programId);

  const ataInstructions: TransactionInstruction[] = [];
  const userPubkey = wallet.publicKey as PublicKey;

  const maybeCreateAta = async (ata: PublicKey, mint: PublicKey) => {
    const accountInfo = await provider.connection.getAccountInfo(ata);
    if (!accountInfo) {
      ataInstructions.push(
        createAssociatedTokenAccountInstruction(userPubkey, ata, stakerPk, mint),
      );
    }
  };

  await maybeCreateAta(userAttnAta, attnMintPk);
  await maybeCreateAta(userSAttnAta, sAttnMintPk);

  if (ataInstructions.length > 0) {
    const tx = new Transaction().add(...ataInstructions);
    tx.feePayer = userPubkey;
    await provider.sendAndConfirm(tx, [], { commitment: 'confirmed' });
  }

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
