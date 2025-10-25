import { createTransferCheckedInstruction } from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import { provider as getProvider } from '@/app/lib/anchor';
import { ensureAta, fetchMintDecimals, getAssociatedTokenAddressSync, uiToBn } from './helpers';

interface RfqSettlement {
  lpWallet: string;
}

export interface BuybackYtTrade {
  quoteId: string;
  priceUsdc: number | string;
  sizeYt: number | string;
  route: 'rfq' | 'amm';
  side: 'buyback';
  settlement: RfqSettlement;
}

export interface BuybackYtParams {
  wallet: any;
  trade: BuybackYtTrade;
  market: {
    pumpMint: string;
  };
  decimals?: number;
}

export async function buybackYt(params: BuybackYtParams): Promise<string> {
  const { wallet, trade } = params;
  if (!wallet?.publicKey) {
    throw new Error('Wallet not connected');
  }
  if (trade.route !== 'rfq') {
    throw new Error(`Unsupported buyback route: ${trade.route}`);
  }

  const provider = getProvider(wallet);
  const userPk = wallet.publicKey as PublicKey;
  const pumpMintPk = new PublicKey(params.market.pumpMint);
  const decimals =
    params.decimals !== undefined
      ? params.decimals
      : await fetchMintDecimals(provider, pumpMintPk);
  const amount = uiToBn(trade.priceUsdc.toString(), decimals);

  const userUsdcAta = await ensureAta(provider, userPk, pumpMintPk, userPk);
  const lpWalletPk = new PublicKey(trade.settlement.lpWallet);
  const lpUsdcAta = getAssociatedTokenAddressSync(pumpMintPk, lpWalletPk);

  const transferIx = createTransferCheckedInstruction(
    userUsdcAta,
    pumpMintPk,
    lpUsdcAta,
    userPk,
    amount,
    decimals,
  );

  const tx = new Transaction().add(transferIx);
  tx.feePayer = userPk;

  const signature = await provider.sendAndConfirm(tx, [], { commitment: 'confirmed' });
  return signature;
}
