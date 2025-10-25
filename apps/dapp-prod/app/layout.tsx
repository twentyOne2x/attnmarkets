// apps/dapp/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppProvider } from './context/AppContext';
import { DataModeProvider } from './context/DataModeContext';
import GovernanceBanner from './components/GovernanceBanner';
import WalletProviders from './components/WalletProviders';
import AppFooter from './components/AppFooter';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'attn.markets App - Creator Earnings to Liquidity',
  description: 'Lock creator earnings, mint liquidity, earn uncorrelated yields on Solana',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
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
