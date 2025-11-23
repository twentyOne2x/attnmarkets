// apps/dapp/app/page.tsx
'use client';

import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import Navigation from './components/Navigation';
import Tooltip from './components/Tooltip';
import { useAppContext } from './context/AppContext';

interface DashboardData {
  totalTVL: number;
  totalCreators: number;
  activeCreators: number;
  weeklyVolume: number;
  projectedAPR: number;
  nextEpochEnd: string;
  availableFunding: number;
  creatorBorrowRate: number;
  utilization: number;
  totalBorrowed: number;
}

export default function Dashboard(): React.JSX.Element {
  const { 
    poolData, 
    creators, 
    userPosition, 
    currentUserWallet,
    loading, 
    calculateLPAPR,
    calculateCreatorBorrowingRate,
    getAvailableLiquidity,
    getSortedCreators
  } = useAppContext();

  // Use consistent sorting from AppContext
  const sortedCreators = getSortedCreators();

  // Calculate dashboard data using centralized borrowing calculations
  const dashboardData: DashboardData | null = (poolData && creators.length > 0) ? {
    totalTVL: poolData.tvl_usdc,
    totalCreators: creators.length,
    activeCreators: creators.filter(c => c.status === 'active' || c.activeLoan).length,
    weeklyVolume: creators.reduce((sum, c) => sum + c.fees7d_usd, 0),
    projectedAPR: calculateLPAPR(),
    nextEpochEnd: poolData.epoch_end,
    availableFunding: getAvailableLiquidity(),
    creatorBorrowRate: calculateCreatorBorrowingRate(),
    totalBorrowed: creators.filter(c => c.activeLoan).reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0),
    utilization: poolData.tvl_usdc > 0 ? (creators.filter(c => c.activeLoan).reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0) / poolData.tvl_usdc) * 100 : 0
  } : null;

  // Debug logging to see what's happening
  console.log('🎯 Dashboard Data Check:', {
    hasPoolData: !!poolData,
    creatorsCount: creators.length,
    creatorsWithLoans: creators.filter(c => c.activeLoan).length,
    dashboardDataExists: !!dashboardData,
    lpAPR: dashboardData?.projectedAPR || 'Not calculated',
    utilization: dashboardData?.utilization.toFixed(1) + '%' || 'Not calculated'
  });

  // Get top 3 creators for preview using consistent sorting from AppContext
  const topCreators = sortedCreators.slice(0, 3);

  // Find current user in creators list
  const currentUserCreator = creators.find(c => c.wallet === currentUserWallet);

  // Calculate LP APR breakdown for tooltip
  const getAPRBreakdown = () => {
    if (!dashboardData) return "APR breakdown not available";
    
    const activeCreators = creators.filter(c => c.activeLoan);
    if (activeCreators.length === 0) return "No active revenue positions – showing base rate.";
    
    const totalBorrowed = activeCreators.reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);
    const weightedBorrowerAPR = activeCreators.reduce((sum, c) => {
      const loanAmount = c.activeLoan?.amount || 0;
      const weight = loanAmount / totalBorrowed;
      const borrowerAPR = c.activeLoan?.interestRate || 65;
      return sum + (borrowerAPR * weight);
    }, 0);
    
    const utilization = dashboardData.utilization / 100;
    const protocolTakeRate = 0.90;
    
    return `LP APR = Weighted Borrower APR × Utilization × Protocol Take Rate

LP APR = ${weightedBorrowerAPR.toFixed(1)}% × ${(utilization * 100).toFixed(1)}% × 90% = ${dashboardData.projectedAPR.toFixed(1)}%

Pool utilization: ${dashboardData.utilization.toFixed(1)}%
Total borrowed: $${dashboardData.totalBorrowed.toLocaleString()}
Pool TVL: $${dashboardData.totalTVL.toLocaleString()}
Active borrowers: ${activeCreators.length}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark text-text-primary flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-lg mx-auto mb-4"></div>
          <p>Loading revenue dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark text-text-primary flex flex-col">
      <Navigation />

      <div className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Total liquidity currently available to back revenue advances and credit lines.">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Available Liquidity
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-3xl font-bold text-primary">
              ${dashboardData ? (dashboardData.availableFunding / 1000).toFixed(0) : '250'}K
            </p>
            <p className="text-xs text-success mt-1">Ready to fund revenue-backed positions</p>
          </div>

          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Indicative APR for projects and creators borrowing against their onchain revenues.">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Borrower APR
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-3xl font-bold text-secondary">
              {dashboardData ? dashboardData.creatorBorrowRate.toFixed(1) : '70'}%
            </p>
            <p className="text-xs text-text-secondary mt-1">APR for revenue advances and credit lines</p>
          </div>

          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content={getAPRBreakdown()}>
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                LP APR
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-3xl font-bold text-success">
              {dashboardData ? dashboardData.projectedAPR.toFixed(1) : '0'}%
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {dashboardData ? `${dashboardData.utilization.toFixed(1)}% utilization of revenue pool` : 'From revenue-backed positions'}
            </p>
          </div>

          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Percentage of the revenue pool currently locked in open advances and credit lines. Higher utilisation generally increases LP returns, within risk limits.">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Pool Utilisation
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-3xl font-bold text-accent">
              {dashboardData ? dashboardData.utilization.toFixed(1) : '0'}%
            </p>
            <p className="text-xs text-text-secondary mt-1">
              ${dashboardData ? (dashboardData.totalBorrowed / 1000).toFixed(0) : '0'}K of ${dashboardData ? (dashboardData.totalTVL / 1000).toFixed(0) : '250'}K
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Project / Creator side */}
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6 flex flex-col">
            <h2 className="text-xl font-bold mb-4">Revenue Account & Advances</h2>
            <p className="text-text-secondary mb-6">
              Route protocol or creator earnings into a revenue account and fund work directly from income instead of selling your own token.
            </p>

            <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-4 mb-6 flex-grow">
              <h3 className="text-secondary font-semibold mb-2">How it works</h3>
              <ul className="space-y-1 text-sm">
                <li>• <strong>Set up a revenue account:</strong> Point your protocol revenues or creator rewards into attn with no upfront commitment.</li>
                <li>• <strong>See your credit limit:</strong> attn estimates how much financing your recent revenues can support.</li>
                <li>• <strong>Draw when needed:</strong> Open an advance or a revolving line in one transaction.</li>
                <li>• <strong>Repay from income:</strong> While a position is open, an agreed share of revenues auto-repays it first.</li>
                <li>• <strong>No token dilution:</strong> No emissions or OTC deals; you keep governance and supply.</li>
              </ul>
            </div>

            {/* Current User Status Display */}
            {currentUserCreator && (
              <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                <h3 className="font-semibold mb-2">Your Revenue Account</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className={`font-mono ${
                      currentUserCreator.activeLoan ? 'text-secondary' : 'text-primary'
                    }`}>
                      {currentUserCreator.activeLoan ? 'BORROWING' : 'LISTED'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Revenues (last 7d):</span>
                    <span className="font-mono text-success">${currentUserCreator.fees7d_usd.toLocaleString()}</span>
                  </div>
                  {currentUserCreator.activeLoan && (
                    <>
                      <div className="flex justify-between">
                        <span>Open advance:</span>
                        <span className="font-mono text-secondary">${currentUserCreator.activeLoan.amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Effective APR:</span>
                        <span className="font-mono text-yellow-400">{currentUserCreator.activeLoan.interestRate.toFixed(0)}% APR</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <a 
                href="/user" 
                className="block w-full bg-secondary text-white py-3 rounded-xl font-semibold text-center hover:bg-secondary/90 transition-colors"
              >
                {currentUserCreator 
                  ? (currentUserCreator.activeLoan ? 'Manage Revenue Position' : 'Request Advance Quote')
                  : 'Request Advance Quote'
                }
              </a>
              <a 
                href="/leaderboard" 
                className="block w-full bg-gray-700 text-text-primary py-3 rounded-xl font-semibold text-center hover:bg-gray-600 transition-colors"
              >
                {currentUserCreator ? 'View my revenue ranking' : 'List my revenue account'}
              </a>
            </div>
          </div>

          {/* LP Section */}
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6 flex flex-col">
            <h2 className="text-xl font-bold mb-4">Liquidity Providers & attnUSD</h2>
            <p className="text-text-secondary mb-6">
              Deposit stablecoins to back revenue accounts and earn revenue-backed yield similar to holding attnUSD.
            </p>

            <div className="bg-success/10 border border-success/20 rounded-lg p-4 mb-6 flex-grow">
              <h3 className="text-success font-semibold mb-2">How it works</h3>
              <ul className="space-y-1 text-sm">
                <li>• <strong>Provide stablecoins:</strong> Fund the pool that backs advances and credit lines for apps, DAOs, creators, and networks.</li>
                <li>• <strong>Earn revenue-backed yield:</strong> Yield comes from interest and fees on those positions, minus losses and costs.</li>
                <li>• <strong>Current indicative APR:</strong> {dashboardData ? dashboardData.projectedAPR.toFixed(1) : '0'}% based on active utilisation.</li>
                <li>• <strong>Redeem on demand:</strong> Enter and exit subject to pool liquidity; this demo treats funds as liquid.</li>
              </ul>
            </div>

            {/* LP Position Display */}
            {userPosition.deposited_usdc > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                <h3 className="font-semibold mb-2">Your Position in the Revenue Pool</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Deposited principal:</span>
                    <span className="font-mono text-primary">${userPosition.deposited_usdc.toLocaleString()} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. monthly yield (simulated):</span>
                    <span className="font-mono text-success">${userPosition.estimated_yield.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current revenue-backed APR:</span>
                    <span className="font-mono text-success">{dashboardData ? dashboardData.projectedAPR.toFixed(1) : '0'}%</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <a 
                href="/deposit" 
                className="block w-full bg-primary text-dark py-3 rounded-xl font-semibold text-center hover:bg-primary/90 transition-colors"
              >
                {userPosition.deposited_usdc > 0 ? 'Manage LP position' : 'Deposit to revenue pool'}
              </a>
              <a 
                href="/leaderboard" 
                className="block w-full bg-gray-700 text-text-primary py-3 rounded-xl font-semibold text-center hover:bg-gray-600 transition-colors"
              >
                View revenue performance
              </a>
            </div>
          </div>
        </div>

        <div className="bg-dark-card border border-gray-700 rounded-xl p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Top Revenue Accounts This Week</h2>
            <a 
              href="/leaderboard" 
              className="text-primary hover:text-primary/80 text-sm font-medium"
            >
              View full leaderboard →
            </a>
          </div>

          <div className="space-y-4">
            {topCreators.map((creator, index) => (
              <div 
                key={creator.wallet}
                className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg"
              >
                <div className="flex items-center space-x-4">
                  <span className={`text-lg font-bold ${
                    index === 0 ? 'text-yellow-400' : 
                    index === 1 ? 'text-gray-300' : 
                    'text-orange-400'
                  }`}>
                    #{index + 1}
                  </span>
                  <div>
                    <div className="font-mono text-sm">
                      {creator.wallet.slice(0, 8)}...{creator.wallet.slice(-4)}
                      {creator.wallet === currentUserWallet && (
                        <span className="ml-2 px-2 py-1 text-xs bg-primary/20 text-primary rounded">YOU</span>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {creator.activeLoan
                        ? `Open advance: $${creator.activeLoan.amount.toLocaleString()} at ${creator.activeLoan.interestRate.toFixed(0)}% APR`
                        : 'Listed (no active advance)'
                      }
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-primary">
                    ${creator.fees7d_usd.toLocaleString()}
                  </div>
                  <div className="text-xs text-text-secondary">7d revenues</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center text-xs text-text-secondary opacity-60">
          * All values shown are simulated for demonstration purposes
        </div>
      </div>
      <footer className="border-t border-gray-800 bg-dark-card/40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-[11px] text-text-secondary">
          <span>attn.markets – banking the internet of revenue</span>
          <div className="flex items-center gap-3">
            <a
              href="https://x.com/attndotmarkets"
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary transition-colors"
            >
              Twitter/X
            </a>
            <a
              href="https://docs.attn.markets"
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary transition-colors"
            >
              Docs
            </a>
            <a
              href="https://t.me/twentyOne2x"
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary transition-colors"
            >
              Telegram
            </a>
            <a
              href="https://github.com/twentyOne2x/attnmarket"
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
      <Analytics />
    </div>
  );
}
