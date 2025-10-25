import { createTransferCheckedInstruction } from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import { provider as getProvider } from '@/app/lib/anchor';
import { ensureAta, fetchMintDecimals, getAssociatedTokenAddressSync, uiToBn } from './helpers';

interface RfqSettlement {
  lpWallet: string;
}

export interface SellYtTrade {
  quoteId: string;
  sizeYt: number | string;
  route: 'rfq' | 'amm';
  side: 'sell';
  settlement: RfqSettlement;
}

export interface SellYtParams {
  wallet: any;
  trade: SellYtTrade;
  market: {
    ytMint: string;
  };
  decimals?: number;
}

export async function sellYt(params: SellYtParams): Promise<string> {
  const { wallet, trade } = params;
  if (!wallet?.publicKey) {
    throw new Error('Wallet not connected');
  }
  if (trade.route !== 'rfq') {
    throw new Error(`Unsupported sell route: ${trade.route}`);
  }
  const provider = getProvider(wallet);
  const userPk = wallet.publicKey as PublicKey;
  const ytMintPk = new PublicKey(params.market.ytMint);
  const decimals =
    params.decimals !== undefined ? params.decimals : await fetchMintDecimals(provider, ytMintPk);
  const amount = uiToBn(trade.sizeYt.toString(), decimals);
  const amountBigInt = BigInt(amount.toString());

  const userYtAta = await ensureAta(provider, userPk, ytMintPk, userPk);
  const lpWalletPk = new PublicKey(trade.settlement.lpWallet);
  const lpYtAta = getAssociatedTokenAddressSync(ytMintPk, lpWalletPk);

  const transferIx = createTransferCheckedInstruction(
    userYtAta,
    ytMintPk,
    lpYtAta,
    userPk,
    amountBigInt,
    decimals,
  );

  const tx = new Transaction().add(transferIx);
  tx.feePayer = userPk;

  const signature = await provider.sendAndConfirm(tx, [], { commitment: 'confirmed' });
  return signature;
}
