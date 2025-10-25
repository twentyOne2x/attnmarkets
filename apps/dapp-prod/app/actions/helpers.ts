import BN from 'bn.js';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey, Transaction } from '@solana/web3.js';

const DECIMAL_REGEX = /^\d*(\.\d*)?$/;
const mintDecimalsCache = new Map<string, number>();

interface UiToBnOptions {
  allowZero?: boolean;
}

export const uiToBn = (input: string | number, decimals: number, options?: UiToBnOptions): BN => {
  const { allowZero = false } = options ?? {};
  const raw = typeof input === 'number' ? input.toString() : input;
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Amount is required');
  }
  if (!DECIMAL_REGEX.test(trimmed)) {
    throw new Error('Invalid amount format');
  }
  const [intPartRaw, fracPartRaw = ''] = trimmed.split('.');
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '') || '0';
  if (fracPartRaw.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places`);
  }
  const fracPart = fracPartRaw.padEnd(decimals, '0').slice(0, decimals);
  const digits = `${intPart}${fracPart}`;
  const bn = new BN(digits);
  if (bn.isZero() && !allowZero) {
    throw new Error('Amount must be greater than zero');
  }
  return bn;
};

export async function ensureAta(
  provider: AnchorProvider,
  owner: PublicKey,
  mint: PublicKey,
  payer?: PublicKey,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const accountInfo = await provider.connection.getAccountInfo(ata);
  if (!accountInfo) {
    const payerPk = payer ?? (provider.wallet?.publicKey as PublicKey | undefined);
    if (!payerPk) {
      throw new Error('Wallet not connected');
    }
    const ix = createAssociatedTokenAccountInstruction(payerPk, ata, owner, mint, TOKEN_PROGRAM_ID);
    const tx = new Transaction().add(ix);
    tx.feePayer = payerPk;
    await provider.sendAndConfirm(tx, [], { commitment: 'confirmed' });
  }
  return ata;
}

export async function fetchMintDecimals(provider: AnchorProvider, mint: PublicKey): Promise<number> {
  const cacheKey = mint.toBase58();
  if (mintDecimalsCache.has(cacheKey)) {
    return mintDecimalsCache.get(cacheKey)!;
  }
  const mintInfo = await getMint(provider.connection, mint, 'confirmed');
  mintDecimalsCache.set(cacheKey, mintInfo.decimals);
  return mintInfo.decimals;
}

export { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync };
