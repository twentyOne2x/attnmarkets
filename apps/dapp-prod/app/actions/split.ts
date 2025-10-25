import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { program } from '@/app/lib/anchor';
import { SplitterIdl } from '@/app/idl';
import { PIDS } from '@/app/lib/programIds';
import { ensureAta, fetchMintDecimals, uiToBn } from './helpers';

const USER_POSITION_SEED = Buffer.from('user-position');
const SPLITTER_AUTHORITY_SEED = Buffer.from('splitter-authority');

interface MintPtYtParams {
  wallet: any;
  market: string;
  creatorVault: string;
  syMint: string;
  ptMint: string;
  ytMint: string;
  amountUi: string;
  decimals?: number;
}

const deriveSplitterAuthority = (creatorVault: PublicKey, programId: PublicKey): PublicKey => {
  const [authority] = PublicKey.findProgramAddressSync(
    [SPLITTER_AUTHORITY_SEED, creatorVault.toBuffer()],
    programId,
  );
  return authority;
};

const deriveUserPosition = (market: PublicKey, user: PublicKey, programId: PublicKey): PublicKey => {
  const [position] = PublicKey.findProgramAddressSync(
    [USER_POSITION_SEED, market.toBuffer(), user.toBuffer()],
    programId,
  );
  return position;
};

export async function mintPtYt(params: MintPtYtParams): Promise<string> {
  const { wallet } = params;
  if (!wallet?.publicKey) {
    throw new Error('Wallet not connected');
  }
  if (!PIDS.splitter) {
    throw new Error('Splitter program id missing');
  }
  if (!PIDS.creator_vault) {
    throw new Error('Creator vault program id missing');
  }

  const marketPk = new PublicKey(params.market);
  const creatorVaultPk = new PublicKey(params.creatorVault);
  const syMintPk = new PublicKey(params.syMint);
  const ptMintPk = new PublicKey(params.ptMint);
  const ytMintPk = new PublicKey(params.ytMint);

  const splitterProgramId = new PublicKey(PIDS.splitter);
  const prog = program(SplitterIdl as any, PIDS.splitter, wallet);
  const provider = (prog as any).provider;
  const userPk = wallet.publicKey as PublicKey;

  const mintDecimals =
    params.decimals !== undefined
      ? params.decimals
      : await fetchMintDecimals(provider, syMintPk);
  const amount = uiToBn(params.amountUi, mintDecimals);

  const userSyAta = await ensureAta(provider, userPk, syMintPk, userPk);
  const userPtAta = await ensureAta(provider, userPk, ptMintPk, userPk);
  const userYtAta = await ensureAta(provider, userPk, ytMintPk, userPk);

  const splitterAuthority = deriveSplitterAuthority(creatorVaultPk, splitterProgramId);
  const userPosition = deriveUserPosition(marketPk, userPk, splitterProgramId);

  const signature = await prog.methods
    .mintPtYt(amount)
    .accounts({
      market: marketPk,
      creatorVault: creatorVaultPk,
      splitterAuthority,
      user: userPk,
      userSyAta,
      userPtAta,
      userYtAta,
      syMint: syMintPk,
      ptMint: ptMintPk,
      ytMint: ytMintPk,
      userPosition,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      creatorVaultProgram: new PublicKey(PIDS.creator_vault),
    })
    .rpc({ commitment: 'confirmed' });

  return signature;
}
