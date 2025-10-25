import { AnchorProvider, Program, Idl, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';

const DEFAULT_RPC = 'https://api.devnet.solana.com';

export const toBN = (value: string | number | bigint): BN => new BN(value.toString());

export function provider(wallet: any, endpoint?: string): AnchorProvider {
  const rpcEndpoint = endpoint ?? (typeof window !== 'undefined' ? (window as any).heliusRpc : undefined) ?? DEFAULT_RPC;
  const connection = new Connection(rpcEndpoint, 'confirmed');
  return new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
}

export function program<T extends Idl>(idl: T, programId: string, wallet: any): Program<T> {
  const pubkey = new PublicKey(programId);
  const anchorProvider = provider(wallet);
  return new Program<T>(idl, pubkey, anchorProvider);
}

export type { Program, AnchorProvider } from '@coral-xyz/anchor';
export { PublicKey } from '@solana/web3.js';
