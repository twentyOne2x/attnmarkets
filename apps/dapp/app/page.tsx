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
    if (activeCreators.length === 0) return "No active loans - showing base rate";
    
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
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark text-text-primary">
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Total funding available for creators to borrow against their future earnings">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Available Funding
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-3xl font-bold text-primary">
              ${dashboardData ? (dashboardData.availableFunding / 1000).toFixed(0) : '250'}K
            </p>
            <p className="text-xs text-success mt-1">Ready to borrow</p>
          </div>

          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Interest rate for creators borrowing against their future earnings">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Creator Borrowing Rate
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-3xl font-bold text-secondary">
              {dashboardData ? dashboardData.creatorBorrowRate.toFixed(1) : '70'}%
            </p>
            <p className="text-xs text-text-secondary mt-1">APR for borrowers</p>
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
              {dashboardData ? `${dashboardData.utilization.toFixed(1)}% utilization` : 'From creator activity'}
            </p>
          </div>

          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Percentage of the pool currently being borrowed by creators. Higher utilization increases LP returns.">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Pool Utilization
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

        {/* REMOVED: Pool Utilization Section - moved to top cards */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Creator Section - NOW ON LEFT */}
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6 flex flex-col">
            <h2 className="text-xl font-bold mb-4">Creator Portal</h2>
            <p className="text-text-secondary mb-6">
              Unlock cash, keep your upside
            </p>

            <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-4 mb-6 flex-grow">
              <h3 className="text-secondary font-semibold mb-2">How It Works</h3>
              <ul className="space-y-1 text-sm">
                <li>• <strong>List for free:</strong> Get on leaderboard with 0% commitment</li>
                <li>• <strong>Get instant quotes:</strong> See your funding potential immediately</li>
                <li>• <strong>Only pay when borrowing:</strong> Earnings auto-repay while advance is active</li>
                <li>• <strong>Keep full control:</strong> No equity given up, adjust repayment % each epoch</li>
              </ul>
            </div>

            {/* Current User Status Display */}
            {currentUserCreator && (
              <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                <h3 className="font-semibold mb-2">Your Creator Status</h3>
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
                    <span>Weekly Earnings:</span>
                    <span className="font-mono text-success">${currentUserCreator.fees7d_usd.toLocaleString()}</span>
                  </div>
                  {currentUserCreator.activeLoan && (
                    <>
                      <div className="flex justify-between">
                        <span>Active Loan:</span>
                        <span className="font-mono text-secondary">${currentUserCreator.activeLoan.amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Interest Rate:</span>
                        <span className="font-mono text-yellow-400">{currentUserCreator.activeLoan.interestRate.toFixed(0)}% APR</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <a 
                href="/creator" 
                className="block w-full bg-secondary text-white py-3 rounded-xl font-semibold text-center hover:bg-secondary/90 transition-colors"
              >
                {currentUserCreator 
                  ? (currentUserCreator.activeLoan ? 'Manage Loan' : 'Get Advance Quote')
                  : 'Get Advance Quote'
                }
              </a>
              <a 
                href="/leaderboard" 
                className="block w-full bg-gray-700 text-text-primary py-3 rounded-xl font-semibold text-center hover:bg-gray-600 transition-colors"
              >
                {currentUserCreator ? 'View My Ranking' : 'List Me on Leaderboard'}
              </a>
            </div>
          </div>

          {/* LP Section - NOW ON RIGHT with Position Display */}
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6 flex flex-col">
            <h2 className="text-xl font-bold mb-4">Liquidity Provider</h2>
            <p className="text-text-secondary mb-6">
              Earn yield from creator earnings and borrowing interest
            </p>

            <div className="bg-success/10 border border-success/20 rounded-lg p-4 mb-6 flex-grow">
              <h3 className="text-success font-semibold mb-2">How It Works</h3>
              <ul className="space-y-1 text-sm">
                <li>• <strong>Deposit USDC:</strong> Fund the liquidity pool for creator advances</li>
                <li>• <strong>Earn from two sources:</strong> Creator trading fees + borrowing interest</li>
                <li>• <strong>Current APR:</strong> {dashboardData ? dashboardData.projectedAPR.toFixed(1) : '0'}% based on active borrowing</li>
                <li>• <strong>Withdraw anytime:</strong> Your funds remain liquid and accessible</li>
              </ul>
            </div>

            {/* LP Position Display */}
            {userPosition.deposited_usdc > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                <h3 className="font-semibold mb-2">Your LP Position</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Deposited:</span>
                    <span className="font-mono text-primary">${userPosition.deposited_usdc.toLocaleString()} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. Monthly Yield:</span>
                    <span className="font-mono text-success">${userPosition.estimated_yield.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current APR:</span>
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
                {userPosition.deposited_usdc > 0 ? 'Manage Position' : 'Deposit & Earn'}
              </a>
              <a 
                href="/leaderboard" 
                className="block w-full bg-gray-700 text-text-primary py-3 rounded-xl font-semibold text-center hover:bg-gray-600 transition-colors"
              >
                View Creator Performance
              </a>
            </div>
          </div>
        </div>

        <div className="bg-dark-card border border-gray-700 rounded-xl p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Top Earning Creators This Week</h2>
            <a 
              href="/leaderboard" 
              className="text-primary hover:text-primary/80 text-sm font-medium"
            >
              View All →
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
                        ? `Active loan: $${creator.activeLoan.amount.toLocaleString()} at ${creator.activeLoan.interestRate.toFixed(0)}% APR`
                        : 'Listed (no active loan)'
                      }
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-primary">
                    ${creator.fees7d_usd.toLocaleString()}
                  </div>
                  <div className="text-xs text-text-secondary">7d earnings</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center text-xs text-text-secondary opacity-60">
          * All values shown are simulated for demonstration purposes
        </div>
      </div>
      <Analytics />
    </div>
  );
}