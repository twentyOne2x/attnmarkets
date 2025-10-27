import { PublicKey } from '@solana/web3.js';
import { program } from '@/app/lib/anchor';
import { SplitterIdl } from '@/app/idl';
import { PIDS } from '@/app/lib/programIds';

interface CloseMarketParams {
  wallet: any;
  market: string;
  creatorVault: string;
  ptMint: string;
  ytMint: string;
  creatorAuthority: string;
  admin: string;
}

export async function closeMarket(params: CloseMarketParams): Promise<string> {
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

  const signer = wallet.publicKey.toBase58();
  if (signer !== params.creatorAuthority || signer !== params.admin) {
    throw new Error('Closing a market requires the same wallet to control both creator authority and admin. Coordinate off-app multi-signature flows if roles differ.');
  }

  const prog = program(SplitterIdl as any, PIDS.splitter, wallet);
  const signature = await prog.methods
    .closeMarket()
    .accounts({
      creatorAuthority: wallet.publicKey,
      admin: wallet.publicKey,
      creatorVault: new PublicKey(params.creatorVault),
      market: new PublicKey(params.market),
      ptMint: new PublicKey(params.ptMint),
      ytMint: new PublicKey(params.ytMint),
    })
    .rpc({ commitment: 'confirmed' });

  return signature;
}
