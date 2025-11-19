// apps/dapp/app/leaderboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';
import Tooltip from '../components/Tooltip';
import { useAppContext } from '../context/AppContext';

interface Notification {
  id: string;
  type: 'processing' | 'success' | 'error';
  title: string;
  message: string;
  persistent?: boolean;
  duration?: number;
  position: number;
}

export default function LeaderboardPage(): React.JSX.Element {
  const { 
    creators, 
    loading, 
    poolData,
    calculateLPAPR,
    getSortedCreators,
    currentUserWallet,
    setCurrentUserWallet,
    getAvailableLiquidity,
    addCreatorToList
  } = useAppContext();
  
  const [filter, setFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('fees7d');
  
  // Connection states
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isListing, setIsListing] = useState<boolean>(false);
  
  // Notification system
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationCounter, setNotificationCounter] = useState<number>(0);

  // Check if user is listed
  const currentCreator = creators.find(c => c.wallet === currentUserWallet);
  const isListed = !!currentCreator;

  // Notification management functions
  const addNotification = (notification: Omit<Notification, 'id' | 'position'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification = { 
      ...notification, 
      id,
      position: notificationCounter
    };
    
    setNotifications(prev => [...prev, newNotification]);
    setNotificationCounter(prev => prev + 1);
    
    if (!notification.persistent || notification.duration) {
      const duration = notification.duration || (notification.type === 'processing' ? 1000 : 4000);
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
    
    return id;
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Step 1: Connect wallet only
  const handleConnectWallet = async () => {
    setIsConnecting(true);
    
    try {
      console.log('🔑 Step 1: Connecting wallet...');
      addNotification({
        type: 'processing',
        title: 'Connecting Wallet',
        message: 'Generating wallet address...',
        duration: 1000
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!currentUserWallet) {
        const deterministicWallet = '0x1234567890abcdef1234567890abcdef12345678';
        setCurrentUserWallet(deterministicWallet);
        console.log('🔑 Wallet connected:', deterministicWallet);
        
        addNotification({
          type: 'success',
          title: 'Wallet Connected!',
          message: 'Ready to sign message and list yourself.',
          duration: 2000
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      addNotification({
        type: 'error',
        title: 'Connection Failed',
        message: 'Failed to connect wallet'
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // Step 2: Sign message and list creator
  const handleSignAndList = async () => {
    setIsListing(true);
    
    try {
      addNotification({
        type: 'processing',
        title: 'Sign Message',
        message: 'Please sign the message in your wallet...',
        persistent: true,
        duration: 1500
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      addNotification({
        type: 'processing',
        title: 'Processing Signature',
        message: 'Verifying signature and listing creator...',
        persistent: true,
        duration: 1000
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('📝 Step 2: Signing message and listing creator...');
      
      const existingCreator = creators.find(c => c.wallet === currentUserWallet);
      if (!existingCreator) {
        const newCreator = {
          wallet: currentUserWallet,
          fees7d_usd: 10000, // Default earnings
          beta_pct: 0.15,
          alpha_pct: 0.70,
          gamma_pct: 0.15,
          status: 'listed',
          est_beta_next30d_usd: 10000 * 4.3
        };
        console.log('Adding new creator to leaderboard:', newCreator);
        addCreatorToList(newCreator);
      }
      
      addNotification({
        type: 'success',
        title: 'Successfully Listed!',
        message: 'Message signed and added to leaderboard. You can now borrow up to 2 weeks of earnings.'
      });
    } catch (error) {
      console.error('Error signing and listing:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to sign message or list creator'
      });
    } finally {
      setIsListing(false);
    }
  };

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
      {/* Fixed Notification Stack Container */}
      <div className="fixed top-20 right-8 z-[9999] w-80">
        {notifications
          .sort((a, b) => a.position - b.position)
          .map((notification, visualIndex) => {
          const topPosition = visualIndex * 110;
          
          return (
            <div
              key={notification.id}
              className={`notification-item absolute w-full transition-all duration-300 ease-out border ${
                notification.type === 'success' 
                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : notification.type === 'error'
                  ? 'bg-red-500/20 border-red-500/40 text-red-400'
                  : 'bg-blue-500/20 border-blue-500/40 text-blue-400'
              } px-6 py-4 rounded-lg shadow-xl backdrop-blur-sm`}
              style={{
                top: `${topPosition}px`,
                zIndex: 9999 - notification.position,
                opacity: Math.max(0.85, 1 - (visualIndex * 0.08)),
              }}
            >
              <div className="flex items-center space-x-3">
                {notification.type === 'processing' ? (
                  <div className="loading-spinner loading-spinner-blue"></div>
                ) : notification.type === 'success' ? (
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-red-400"></div>
                )}
                <div className="min-w-0 flex-1">
                  <div className={`font-semibold ${
                    notification.type === 'success' ? 'text-green-400' :
                    notification.type === 'error' ? 'text-red-400' :
                    'text-blue-400'
                  }`}>
                    {notification.title}
                  </div>
                  <div className={`text-sm opacity-90 ${
                    notification.type === 'success' ? 'text-green-300' :
                    notification.type === 'error' ? 'text-red-300' :
                    'text-blue-300'
                  }`}>
                    {notification.message}
                  </div>
                </div>
                {notification.type === 'error' && (
                  <button 
                    onClick={() => removeNotification(notification.id)}
                    className="text-red-400 hover:text-red-300 ml-2 text-lg leading-none hover:bg-red-500/20 rounded px-1"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Navigation />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Sponsor Leaderboard</h1>
            <p className="text-text-secondary mt-2">Top performing users by earnings generation and borrowing activity</p>
          </div>
          <a href="/" className="text-text-secondary hover:text-primary transition-colors">
            ← Back to Dashboard
          </a>
        </div>

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
            <Tooltip content="Total number of users who have joined the platform and are available for lending">
              <h3 className="text-sm text-text-secondary mb-2 cursor-help flex items-center">
                Total Users
                <span className="ml-1 text-xs text-primary">ⓘ</span>
              </h3>
            </Tooltip>
            <p className="text-2xl font-bold text-primary">{creators.length}</p>
          </div>
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <Tooltip content="Users currently borrowing against their future earnings. These active loans generate interest for LP providers.">
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
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        creator.activeLoan 
                          ? 'bg-secondary/20 text-secondary' 
                          : creator.status === 'active'
                          ? 'bg-success/20 text-success' 
                          : 'bg-gray-600/20 text-gray-400'
                      }`}>
                        {creator.activeLoan ? 'BORROWING' : creator.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredCreators.length === 0 && (
            <div className="text-center py-12 text-text-secondary">
              <p>No users match the current filters.</p>
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