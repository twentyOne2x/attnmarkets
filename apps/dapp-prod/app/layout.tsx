// apps/dapp/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppProvider } from './context/AppContext';
import { DataModeProvider } from './context/DataModeContext';

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
          <AppProvider>
            {children}
          </AppProvider>
        </DataModeProvider>
      </body>
    </html>
  );
}