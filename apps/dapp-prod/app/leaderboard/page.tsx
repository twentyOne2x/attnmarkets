// apps/dapp/app/leaderboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';
import Tooltip from '../components/Tooltip';
import { useAppContext } from '../context/AppContext';

export default function LeaderboardPage(): React.JSX.Element {
  const { 
    creators, 
    loading, 
    poolData,
    calculateLPAPR,
    getSortedCreators,
    currentUserWallet,
    getAvailableLiquidity,
    connectWallet,
    signAndListCreator,
    isWalletConnected,
    currentUserCreator,
    isUserPreviewed,
    isUserListed,
    isFullyConnected,
    isLive,
    cluster,
  } = useAppContext();
  
  const [filter, setFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('fees7d');
  
  const currentCreator = currentUserCreator;
  const creatorMetrics = currentCreator?.metrics;
  const hasCreatorVault = currentCreator?.hasCreatorVault ?? false;
  const isPreviewOnly = isUserPreviewed && !isUserListed;

  const filteredCreators = creators
    .filter(creator => {
      if (filter === 'active') return creator.status === 'active';
      if (filter === 'borrowing') return creator.activeLoan;
      if (filter === 'high-volume') return creator.fees7d_usd > 500;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'fees7d') return b.fees7d_usd - a.fees7d_usd;
      if (sortBy === 'beta') return b.beta_pct - a.beta_pct;
      if (sortBy === 'contribution') return b.est_beta_next30d_usd - a.est_beta_next30d_usd;
      if (sortBy === 'borrowing') {
        const aLoan = a.activeLoan?.amount || 0;
        const bLoan = b.activeLoan?.amount || 0;
        return bLoan - aLoan;
      }
      return 0;
    });

  const totalBorrowed = creators
    .filter(c => c.activeLoan)
    .reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);

  const activeBorrowers = creators.filter(c => c.activeLoan).length;
  const availableLiquidity = getAvailableLiquidity();
  const currentAPR = calculateLPAPR();

  // Calculate LP APR breakdown for detailed tooltip
  const getAPRBreakdown = () => {
    if (!poolData) return "APR breakdown not available";
    
    const activeCreators = creators.filter(c => c.activeLoan);
    if (activeCreators.length === 0) return "No active loans - showing base rate of 8.5%";
    
    const totalBorrowed = activeCreators.reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);
    const weightedBorrowerAPR = activeCreators.reduce((sum, c) => {
      const loanAmount = c.activeLoan?.amount || 0;
      const weight = loanAmount / totalBorrowed;
      const borrowerAPR = c.activeLoan?.interestRate || 65;
      return sum + (borrowerAPR * weight);
    }, 0);
    
    const utilization = totalBorrowed / poolData.tvl_usdc;
    const protocolTakeRate = 0.90;
    
    return `LP APR Calculation Breakdown:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Formula: Weighted Borrower APR × Utilization × Protocol Take Rate

📊 Current Metrics:
• Weighted Borrower APR: ${weightedBorrowerAPR.toFixed(1)}%
  (Average across ${activeCreators.length} active loans)

• Pool Utilization: ${(utilization * 100).toFixed(1)}%
  ($${totalBorrowed.toLocaleString()} borrowed / $${poolData.tvl_usdc.toLocaleString()} TVL)

• Protocol Take Rate: 90%
  (LPs receive 90% of borrowing interest, protocol keeps 10%)

💰 Final LP APR: ${currentAPR.toFixed(1)}%

📈 Active Loans Breakdown:`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark text-text-primary flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-lg mx-auto mb-4"></div>
          <p>Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark text-text-primary">
      <Navigation />

      {isLive && isPreviewOnly && (
        <div className="mx-auto mt-6 max-w-3xl px-4">
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-5 py-4 text-left text-warning">
            <div className="text-sm font-semibold uppercase tracking-wide text-warning/80">You&apos;re in the preview</div>
            <p className="mt-1 text-sm text-warning/90">
              Your wallet is pinned to the Live leaderboard with a pending Squads status. Link the safe to start posting real metrics and unlock advances.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Creator Leaderboard</h1>
            <p className="text-text-secondary mt-2">Top performing creators by earnings generation and borrowing activity</p>
          </div>
          <a href="/" className="text-text-secondary hover:text-primary transition-colors">
            ← Back to Dashboard
          </a>
        </div>

        {isLive && (
          <div className="mb-8 space-y-4">
            <div className="bg-dark-card border border-secondary/30 rounded-xl p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-secondary">Live mode checklist</h2>
                  <p className="text-sm text-text-secondary">
                    Connect your wallet, finalize the Squads safe, and sign to appear in the devnet rankings.
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary">
                  Live — {cluster}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className={`rounded-lg border ${isWalletConnected ? 'border-green-400/40 bg-green-500/10' : 'border-gray-700 bg-gray-900/60'} p-4`}>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>1. Connect wallet</span>
                    <span className={`text-xs ${isWalletConnected ? 'text-green-300' : 'text-text-secondary'}`}>
                      {isWalletConnected ? 'Connected' : 'Pending'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    Use the wallet adapter so leaderboard stats reflect your creator vault.
                  </p>
                  {!isWalletConnected && (
                    <button
                      onClick={connectWallet}
                      className="mt-3 inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-dark hover:bg-primary/90"
                    >
                      Connect wallet
                    </button>
                  )}
                </div>

                <div className={`rounded-lg border ${hasCreatorVault ? 'border-green-400/40 bg-green-500/10' : 'border-gray-700 bg-gray-900/60'} p-4`}>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>2. Link Squads safe</span>
                    <span className={`text-xs ${hasCreatorVault ? 'text-green-300' : 'text-text-secondary'}`}>
                      {hasCreatorVault ? 'Linked' : 'Pending'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    Create the 2-of-2 safe from the Creator page so vault locks co-sign with attn.
                  </p>
                  {!hasCreatorVault && (
                    <a
                      href="/sponsor#squads-setup"
                      className="mt-3 inline-flex items-center justify-center rounded-lg border border-secondary/50 px-3 py-1.5 text-sm font-medium text-secondary hover:border-secondary"
                    >
                      Open Squads setup
                    </a>
                  )}
                </div>

                <div className={`rounded-lg border ${(isFullyConnected && hasCreatorVault) ? 'border-green-400/40 bg-green-500/10' : 'border-gray-700 bg-gray-900/60'} p-4`}>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>3. Sign &amp; list</span>
                    <span className={`text-xs ${(isFullyConnected && hasCreatorVault) ? 'text-green-300' : isPreviewOnly ? 'text-warning' : 'text-text-secondary'}`}>
                      {(isFullyConnected && hasCreatorVault) ? 'Ready' : isPreviewOnly ? 'Preview saved' : 'Pending'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    {isPreviewOnly
                      ? 'Preview created — sign once your Squads safe is live to activate borrowing.'
                      : 'Authorize attn.markets to publish your vault metrics and show up on the leaderboard.'}
                  </p>
                  {creatorMetrics ? (
                    <div className="mt-3 space-y-1 rounded-md border border-secondary/20 bg-black/30 px-3 py-2 text-[11px] text-text-secondary">
                      <div className="flex justify-between">
                        <span>14d fees (est.)</span>
                        <span className="font-mono">${creatorMetrics.recent14dTotalUsd.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg. per day</span>
                        <span className="font-mono">
                          ${creatorMetrics.recent14dAverageUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between text-secondary">
                        <span>Reward points</span>
                        <span className="font-mono font-semibold">{creatorMetrics.leaderboardPoints.toLocaleString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-md bg-black/40 px-3 py-2 text-[11px] text-text-secondary">
                      Connect first to compute fee-based points.
                    </div>
                  )}
                  {(!isFullyConnected || !hasCreatorVault) && (
                    <button
                      onClick={signAndListCreator}
                      className="mt-3 inline-flex items-center justify-center rounded-lg bg-secondary/30 px-3 py-1.5 text-sm font-medium text-secondary hover:bg-secondary/20 disabled:opacity-50"
                      disabled={!isWalletConnected || (isFullyConnected && hasCreatorVault)}
                    >
                      Sign &amp; list creator
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters and Sort */}
        <div className="flex flex-wrap gap-4 mb-8">
          <div className="flex items-center space-x-2">
            <label className="text-text-secondary text-sm">Filter:</label>
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              className="bg-dark-card border border-gray-600 rounded px-3 py-1 text-sm"
            >
              <option value="all">All Creators</option>
              <option value="active">Active Only</option>
              <option value="borrowing">Currently Borrowing</option>
              <option value="high-volume">High Volume (&gt;$500/week)</option>
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <label className="text-text-secondary text-sm">Sort by:</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-dark-card border border-gray-600 rounded px-3 py-1 text-sm"
            >
              <option value="fees7d">Weekly Earnings</option>
              <option value="beta">Sharing %</option>
              <option value="contribution">LP Contribution</option>
              <option value="borrowing">Loan Amount</option>
            </select>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Total number of creators who have joined the platform and are available for lending">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Total Creators
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-2xl font-bold text-primary">{creators.length}</p>
          </div>
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Creators currently borrowing against their future earnings. These active loans generate interest for LP providers.">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Active Borrowers
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-2xl font-bold text-success">{activeBorrowers}</p>
          </div>
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Total amount currently borrowed by all creators. This reduces available liquidity and generates interest for LP providers.">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Total Borrowed
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-2xl font-bold text-secondary">
              ${totalBorrowed.toLocaleString()}
            </p>
          </div>
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Available liquidity for new creator loans. This is the pool TVL minus currently borrowed amounts.">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Available Liquidity
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-2xl font-bold text-accent">
              ${availableLiquidity.toLocaleString()}
            </p>
          </div>
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content={getAPRBreakdown()}>
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Current LP APR
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-2xl font-bold text-success">
              {currentAPR.toFixed(1)}%
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {poolData ? `${((totalBorrowed / poolData.tvl_usdc) * 100).toFixed(1)}% pool utilization` : 'Based on current utilization'}
            </p>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-dark-card border border-gray-700 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-gray-700">
            <h2 className="text-xl font-bold">Ranking</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="bg-gray-800/50">
                <tr>
                  <th className="text-left py-4 px-6 text-text-secondary font-medium">Rank</th>
                  <th className="text-left py-4 px-6 text-text-secondary font-medium">Creator</th>
                  <th className="text-left py-4 px-6 text-text-secondary font-medium">
                    <Tooltip content="Total earnings this creator generated in the last 7 days from their content/activity">
                      <span className="cursor-help flex items-center">
                        Weekly Earnings
                        <span className="ml-1 text-xs text-primary">ⓘ</span>
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-left py-4 px-6 text-text-secondary font-medium">
                    <Tooltip content="Average daily fees over the last ~14 days, derived from vault receipts.">
                      <span className="cursor-help flex items-center">
                        14d Daily Avg
                        <span className="ml-1 text-xs text-primary">ⓘ</span>
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-left py-4 px-6 text-text-secondary font-medium">
                    <Tooltip content="Leaderboard reward points derived from recent fees. Higher points unlock keeper priority.">
                      <span className="cursor-help flex items-center">
                        Reward Points
                        <span className="ml-1 text-xs text-primary">ⓘ</span>
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-left py-4 px-6 text-text-secondary font-medium">
                    <Tooltip content="Current borrowing status and loan details. Active loans generate interest for LP providers.">
                      <span className="cursor-help flex items-center">
                        Loan Status
                        <span className="ml-1 text-xs text-primary">ⓘ</span>
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-left py-4 px-6 text-text-secondary font-medium">
                    <Tooltip content="Percentage of daily earnings being used for loan repayment. Higher rates allow for larger loans but faster repayment.">
                      <span className="cursor-help flex items-center">
                        Repayment Rate
                        <span className="ml-1 text-xs text-primary">ⓘ</span>
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-left py-4 px-6 text-text-secondary font-medium">
                    <Tooltip content="Annual percentage rate for current loan. Higher utilization = higher interest rates. This generates yield for LP providers.">
                      <span className="cursor-help flex items-center">
                        Interest Rate
                        <span className="ml-1 text-xs text-primary">ⓘ</span>
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-left py-4 px-6 text-text-secondary font-medium">Status</th>
                </tr>
            </thead>
              <tbody>
                {filteredCreators.map((creator, index) => (
                  <tr 
                    key={creator.wallet} 
                    className={`border-b border-gray-700/50 hover:bg-gray-800/30 transition-colors ${
                      creator.wallet === currentUserWallet ? 'bg-primary/5 border-primary/20' : ''
                    }`}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center">
                        <span className={`text-lg font-bold ${
                          index === 0 ? 'text-yellow-400' : 
                          index === 1 ? 'text-gray-300' : 
                          index === 2 ? 'text-orange-400' : 
                          'text-text-secondary'
                        }`}>
                          #{index + 1}
                        </span>
                        {index < 3 && (
                          <span className="ml-2 text-lg">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-mono text-sm">
                        {creator.wallet.slice(0, 8)}...{creator.wallet.slice(-4)}
                        {creator.wallet === currentUserWallet && (
                          <span className="ml-2 px-2 py-1 text-xs bg-primary/20 text-primary rounded">YOU</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-primary font-semibold text-lg">
                        ${creator.fees7d_usd.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {creator.metrics ? (
                        <span className="text-text-secondary font-mono text-sm">
                          ${creator.metrics.recent14dAverageUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {creator.metrics ? (
                        <span className="font-semibold text-secondary">
                          {creator.metrics.leaderboardPoints.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {creator.activeLoan ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-secondary">
                            ${creator.activeLoan.amount.toLocaleString()}
                          </div>
                          <div className="text-xs text-text-secondary">
                            {creator.activeLoan.utilizationPct}% of max • {creator.activeLoan.daysRemaining}d left
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">No active loan</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {creator.activeLoan ? (
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          creator.activeLoan.dailyRepaymentRate === 50 ? 'bg-success/20 text-success' :
                          creator.activeLoan.dailyRepaymentRate === 75 ? 'bg-yellow-400/20 text-yellow-400' :
                          'bg-red-400/20 text-red-400'
                        }`}>
                          {creator.activeLoan.dailyRepaymentRate}%
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {creator.activeLoan ? (
                        <span className={`font-semibold ${
                          creator.activeLoan.interestRate <= 60 ? 'text-success' :
                          creator.activeLoan.interestRate <= 75 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {creator.activeLoan.interestRate.toFixed(0)}% APR
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {(() => {
                        const isPending = creator.status === 'pending_squads';
                        const isBorrowing = !!creator.activeLoan;
                        const statusLabel = isBorrowing
                          ? 'BORROWING'
                          : isPending
                          ? 'PENDING SQUADS'
                          : creator.status.toUpperCase();
                        const chipClasses = isBorrowing
                          ? 'bg-secondary/20 text-secondary'
                          : isPending
                          ? 'bg-warning/20 text-warning'
                          : creator.status === 'active'
                          ? 'bg-success/20 text-success'
                          : 'bg-gray-600/20 text-gray-400';

                        return (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${chipClasses}`}>
                            {statusLabel}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredCreators.length === 0 && (
            <div className="text-center py-12 text-text-secondary">
              <p>No creators match the current filters.</p>
            </div>
          )}
        </div>
        
        <div className="text-center text-xs text-text-secondary mt-8 opacity-60">
          * All values shown are simulated for demonstration purposes
        </div>
      </div>
      
      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes slideInFromRight {
          0% {
            opacity: 0;
            transform: translateX(100%);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .loading-spinner-green,
        .loading-spinner-red,
        .loading-spinner-blue {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .loading-spinner-green {
          border-top: 2px solid #22c55e;
          border-right: 2px solid rgba(34, 197, 94, 0.3);
        }

        .loading-spinner-red {
          border-top: 2px solid #ef4444;
          border-right: 2px solid rgba(239, 68, 68, 0.3);
        }

        .loading-spinner-blue {
          border-top: 2px solid #3b82f6;
          border-right: 2px solid rgba(59, 130, 246, 0.3);
        }

        .notification-item {
          animation: slideInFromRight 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
