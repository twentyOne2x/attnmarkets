// apps/dapp/app/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppProvider } from './context/AppContext';
import { DataModeProvider } from './context/DataModeContext';
import GovernanceBanner from './components/GovernanceBanner';
import WalletProviders from './components/WalletProviders';
import AppFooter from './components/AppFooter';

export const metadata: Metadata = {
  title: 'attn.markets App - Creator Earnings to Liquidity',
  description: 'Lock creator earnings, mint liquidity, earn uncorrelated yields on Solana',
  icons: {
    icon: [
      { url: '/favicon.ico', rel: 'icon', type: 'image/x-icon' },
      { url: '/favicon.svg', rel: 'icon', type: 'image/svg+xml' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/favicon.svg' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <DataModeProvider>
          <WalletProviders>
            <AppProvider>
              <GovernanceBanner />
              <div className="min-h-screen flex flex-col">
                <div className="flex-1">{children}</div>
                <AppFooter />
              </div>
            </AppProvider>
          </WalletProviders>
        </DataModeProvider>
      </body>
    </html>
  );
}
