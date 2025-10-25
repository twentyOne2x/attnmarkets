'use client';

import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

const DEFAULT_RPC_ENDPOINT = 'https://api.devnet.solana.com';

interface WalletProvidersProps {
  children: React.ReactNode;
}

export const WalletProviders: React.FC<WalletProvidersProps> = ({ children }) => {
  const endpoint = useMemo(() => {
    if (typeof window !== 'undefined' && (window as any).heliusRpc) {
      return (window as any).heliusRpc as string;
    }
    return DEFAULT_RPC_ENDPOINT;
  }, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new BackpackWalletAdapter(),
      new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: 'confirmed' }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default WalletProviders;
