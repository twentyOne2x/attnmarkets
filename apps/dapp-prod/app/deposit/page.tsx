// apps/dapp/app/deposit/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import Navigation from '../components/Navigation';
import Tooltip from '../components/Tooltip';
import { useAppContext } from '../context/AppContext';
import { useETag } from '../hooks/useETag';
import type { RewardPosition } from '../lib/data-providers';
import { stakeAttnUSD } from '../actions/stakeAttnUsd';

interface Notification {
  id: string;
  type: 'processing' | 'success' | 'error';
  title: string;
  message: string;
  persistent?: boolean;
  duration?: number;
  position: number;
}

interface RewardsListResponse {
  pools: RewardPosition[];
  next_cursor?: string;
}

interface PortfolioResponse {
  wallet: string;
  updated_at: string;
  [key: string]: unknown;
}

export default function DepositPage(): React.JSX.Element {
  const {
    poolData,
    userData,
    userPosition,
    setUserPosition,
    loading,
    calculateLPAPR,
    calculateMonthlyYield,
    depositToPool,
    withdrawFromPool,
    getAvailableLiquidity,
    creators,
    currentUserWallet,
    setCurrentUserWallet,
    getLPHistoryForWallet,
    mode,
    isLive,
    cluster,
    switchMode,
    healthStatus,
    writeEnabled,
    governancePaused,
    isWalletConnected,
    walletNetwork,
  } = useAppContext();

  const [amount, setAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [enablingLive, setEnablingLive] = useState(false);
  
  // Connection states
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  
  // Toast states
  const [showDepositToast, setShowDepositToast] = useState<boolean>(false);
  const [showWithdrawToast, setShowWithdrawToast] = useState<boolean>(false);
  
  // Notification system
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationCounter, setNotificationCounter] = useState<number>(0);
  const canTransact = writeEnabled;
  const walletAdapter = useWallet();
  const [stakeAmount, setStakeAmount] = useState<string>('1');
  const [stakeSubmitting, setStakeSubmitting] = useState(false);
  const [rewardsRefresh, setRewardsRefresh] = useState(0);
  const [portfolioRefresh, setPortfolioRefresh] = useState(0);

  const { data: rewardsData } = useETag<RewardsListResponse>('/v1/rewards?limit=5', {
    enabled: mode === 'live',
    deps: [mode, rewardsRefresh],
    ttlMs: 30_000,
    maxRetries: 2,
  });
  const activePool = rewardsData?.pools?.[0];
  const poolPaused = activePool?.paused ?? false;
  const poolAccountsReady = Boolean(activePool?.attnMint && activePool?.sAttnMint && activePool?.attnVault);
  const networkMismatch = Boolean(
    walletNetwork &&
      walletNetwork !== 'devnet' &&
      walletNetwork !== WalletAdapterNetwork.Devnet,
  );

  const portfolioPath = currentUserWallet
    ? `/v1/portfolio/${currentUserWallet}`
    : '/v1/portfolio/placeholder';
  useETag<PortfolioResponse>(portfolioPath, {
    enabled: mode === 'live' && !!currentUserWallet,
    deps: [mode, currentUserWallet, portfolioRefresh],
    ttlMs: 15_000,
    maxRetries: 2,
  });

  const guardReason = () => {
    if (!isLive) return 'Live mode required';
    if (cluster !== 'devnet') return 'Switch network to devnet to continue';
    if (!isWalletConnected) return 'Connect wallet to perform write actions';
    if (governancePaused) return 'Writes disabled: governance pause active';
    if (networkMismatch) return 'Wallet network mismatch: switch wallet to devnet';
    return 'Writes unavailable';
  };

  const stakeGuardReason = () => {
    if (!writeEnabled) return guardReason();
    if (!walletAdapter.publicKey) return 'Connect wallet to perform write actions';
    if (!activePool) return 'No rewards pool available';
    if (poolPaused) return 'Rewards pool paused';
    if (!poolAccountsReady) return 'Rewards pool configuration incomplete';
    if (networkMismatch) return 'Wallet network mismatch: switch wallet to devnet';
    return '';
  };

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

  const handleEnableLive = async () => {
    setEnablingLive(true);
    try {
      await switchMode('live');
    } finally {
      setEnablingLive(false);
    }
  };

  // Connect wallet function
  const handleConnectWallet = async () => {
    setIsConnecting(true);
    
    try {
      console.log('🔑 Connecting wallet...');
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
          message: 'Ready to deposit and start earning yield.',
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

  // Set default amount based on active tab and user position
  useEffect(() => {
    if (activeTab === 'deposit') {
      setAmount('5000');
    } else {
      // For withdraw, start with empty or suggested amount
      setAmount(userPosition.deposited_usdc > 0 ? Math.min(1000, userPosition.deposited_usdc).toString() : '');
    }
  }, [activeTab, userPosition.deposited_usdc]);

  // Format currency helper
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('en-US');
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove all non-digits (except decimal points)
    const value = e.target.value.replace(/[^\d.]/g, '');
    setAmount(value);
  };

  const handleDeposit = async () => {
    if (!canTransact) {
      return;
    }
    const depositAmount = parseFloat(amount) || 0;
    if (depositAmount <= 0) {
      return;
    }

    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Use the new depositToPool function which handles both user position and pool TVL
    // LP history is automatically added inside depositToPool
    depositToPool(depositAmount);
    
    setShowDepositToast(true);
    setTimeout(() => setShowDepositToast(false), 1500);
    
    setAmount('5000');
    setIsProcessing(false);
  };

  const handleWithdraw = async () => {
    if (!canTransact) {
      return;
    }
    const withdrawAmount = parseFloat(amount) || 0;
    if (withdrawAmount <= 0 || withdrawAmount > userPosition.deposited_usdc) {
      return;
    }

    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Use the new withdrawFromPool function which handles both user position and pool TVL
    // LP history is automatically added inside withdrawFromPool
    withdrawFromPool(withdrawAmount);
    
    setShowWithdrawToast(true);
    setTimeout(() => setShowWithdrawToast(false), 1500);
    
    // Reset amount after withdrawal
    const remainingBalance = userPosition.deposited_usdc - withdrawAmount;
    setAmount(remainingBalance > 0 ? Math.min(1000, remainingBalance).toString() : '');
    setIsProcessing(false);
  };

  const handleAction = () => {
    if (activeTab === 'deposit') {
      handleDeposit();
    } else {
      handleWithdraw();
    }
  };

  const handleStake = async () => {
    const reason = stakeGuardReason();
    if (reason) {
      addNotification({
        type: 'error',
        title: 'Stake unavailable',
        message: reason,
        duration: 3000,
      });
      return;
    }

    if (!activePool || !walletAdapter.publicKey || !poolAccountsReady) {
      addNotification({
        type: 'error',
        title: 'Stake unavailable',
        message: 'Rewards pool metadata missing.',
        duration: 3000,
      });
      return;
    }

    try {
      setStakeSubmitting(true);
      await stakeAttnUSD(
        walletAdapter,
        {
          pool: activePool.pool,
          staker: walletAdapter.publicKey.toBase58(),
          attnMint: activePool.attnMint!,
          attnVault: activePool.attnVault!,
          sAttnMint: activePool.sAttnMint!,
        },
        stakeAmount,
      );

      addNotification({
        type: 'success',
        title: 'Stake submitted',
        message: `Staked ${stakeAmount} attnUSD into rewards vault.`,
        duration: 4000,
      });

      setStakeAmount('1');
      setRewardsRefresh((value) => value + 1);
      if (currentUserWallet) {
        setPortfolioRefresh((value) => value + 1);
      }
    } catch (error) {
      console.error('Stake failed', error);
      addNotification({
        type: 'error',
        title: 'Stake failed',
        message: (error as Error).message ?? 'Failed to stake attnUSD',
        duration: 5000,
      });
    } finally {
      setStakeSubmitting(false);
    }
  };

  const currentAPR = calculateLPAPR();
  const projectedMonthlyEarnings = amount ? 
    calculateMonthlyYield(parseFloat(amount) || 0).toFixed(2) : '0';

  const projectedYearlyEarnings = amount ? 
    ((parseFloat(amount) || 0) * (currentAPR / 100)).toFixed(2) : '0';

  const stakeButtonDisabled =
    !writeEnabled ||
    stakeSubmitting ||
    !walletAdapter.publicKey ||
    !activePool ||
    poolPaused ||
    !poolAccountsReady ||
    Number(stakeAmount) <= 0 ||
    networkMismatch;

  const availableLiquidity = getAvailableLiquidity();
  const totalBorrowed = creators
    .filter(c => c.activeLoan)
    .reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);

  // Get user's LP history from context
  const userLPHistory = getLPHistoryForWallet(currentUserWallet || '');

  // Helper function to format LP history type
  const formatLPHistoryType = (type: string) => {
    switch (type) {
      case 'deposit': return 'Deposit';
      case 'withdrawal': return 'Withdrawal';
      default: return type;
    }
  };

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
    
    return `LP APR Calculation:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Formula: Weighted Borrower APR × Utilization × Protocol Take Rate

• Weighted Borrower APR: ${weightedBorrowerAPR.toFixed(1)}%
  (Average rate across ${activeCreators.length} active loans)

• Pool Utilization: ${(utilization * 100).toFixed(1)}%
  ($${totalBorrowed.toLocaleString()} borrowed / $${poolData.tvl_usdc.toLocaleString()} TVL)

• Protocol Take Rate: 90%
  (LPs receive 90% of borrowing interest)

Final LP APR: ${currentAPR.toFixed(1)}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Higher utilization = higher LP returns`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark text-text-primary flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-lg mx-auto mb-4"></div>
          <p>Loading interface...</p>
        </div>
      </div>
    );
  }

  if (!canTransact) {
    return (
      <div className="min-h-screen bg-dark text-text-primary">
        <Navigation />
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="bg-dark-card border border-gray-700 rounded-xl p-8 text-center space-y-4">
            <h1 className="text-2xl font-semibold">Action unavailable</h1>
            <p className="text-text-secondary">
              {guardReason()}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {!isLive && (
                <button
                  onClick={handleEnableLive}
                  disabled={enablingLive || healthStatus === 'checking'}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    enablingLive || healthStatus === 'checking'
                      ? 'bg-secondary/30 text-secondary/60 cursor-not-allowed'
                      : 'bg-secondary/20 text-secondary hover:bg-secondary/30'
                  }`}
                >
                  {enablingLive || healthStatus === 'checking' ? 'Checking readiness…' : 'Enable Live (devnet)'}
                </button>
              )}
              {!isWalletConnected && (
                <button
                  onClick={handleConnectWallet}
                  disabled={isConnecting}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isConnecting
                      ? 'bg-primary/30 text-primary/60 cursor-not-allowed'
                      : 'bg-primary/20 text-primary hover:bg-primary/30'
                  }`}
                >
                  {isConnecting ? 'Connecting…' : 'Connect Wallet'}
                </button>
              )}
              <div className="text-sm text-text-secondary">
                Current mode: <span className="font-semibold uppercase">{mode}</span>
              </div>
            </div>
            {healthStatus === 'unhealthy' && (
              <p className="text-red-400 text-sm">
                Live mode is unavailable right now. Try again soon or continue exploring the demo.
              </p>
            )}
            {governancePaused && (
              <p className="text-yellow-400 text-sm">
                Governance pause is active. Write actions are temporarily disabled until the pause is lifted.
              </p>
            )}
          </div>
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

      {/* Toast Notifications */}
      {showDepositToast && (
        <div className="fixed top-20 right-8 z-[9999] bg-primary/20 border border-primary/30 text-primary px-6 py-4 rounded-lg shadow-xl animate-fade-in-out">
          <div className="flex items-center space-x-2">
            <div>
              <div className="font-semibold">Deposit Successful!</div>
              <div className="text-sm opacity-90">
                ${parseFloat(amount || '0').toLocaleString()} USDC added to yield pool. 
                Earning {currentAPR.toFixed(1)}% APR from creator activity.
              </div>
            </div>
          </div>
        </div>
      )}

      {showWithdrawToast && (
        <div className="fixed top-20 right-8 z-[9999] bg-secondary/20 border border-secondary/30 text-secondary px-6 py-4 rounded-lg shadow-xl animate-fade-in-out">
          <div className="flex items-center space-x-2">
            <div>
              <div className="font-semibold">Withdrawal Complete!</div>
              <div className="text-sm opacity-90">
                ${parseFloat(amount || '0').toLocaleString()} USDC withdrawn. 
                Remaining: ${Math.max(0, userPosition.deposited_usdc - parseFloat(amount || '0')).toLocaleString()} USDC.
              </div>
            </div>
          </div>
        </div>
      )}

      <Navigation />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Yield Pool</h1>
            <p className="text-text-secondary mt-2">Earn yield from creator earnings and borrowing interest</p>
          </div>
          <a href="/" className="text-text-secondary hover:text-primary transition-colors">
            ← Back to Dashboard
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Main Form */}
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            {/* Tab Switcher */}
            <div className="flex bg-gray-800 rounded-lg p-1 mb-6">
              <button
                onClick={() => setActiveTab('deposit')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'deposit'
                    ? 'bg-primary text-dark'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Deposit
              </button>
              <button
                onClick={() => setActiveTab('withdraw')}
                disabled={!currentUserWallet}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeTab === 'withdraw'
                    ? 'bg-secondary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Withdraw
              </button>
            </div>

            <h2 className="text-xl font-bold mb-6">
              {activeTab === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Amount (USDC)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-text-secondary font-mono">$</span>
                  <input
                    type="text"
                    value={amount ? formatCurrency(parseFloat(amount) || 0) : ''}
                    onChange={handleAmountChange}
                    disabled={!currentUserWallet}
                    placeholder={activeTab === 'deposit' ? '5,000' : '1,000'}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-8 pr-16 py-3 text-lg font-mono focus:border-primary focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {activeTab === 'withdraw' && userPosition.deposited_usdc > 0 && currentUserWallet && (
                    <button
                      onClick={() => setAmount(userPosition.deposited_usdc.toString())}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-primary text-sm hover:text-primary/80"
                    >
                      MAX
                    </button>
                  )}
                </div>
                {!currentUserWallet && (
                  <div className="text-xs text-text-secondary mt-1">
                    Connect wallet to {activeTab === 'deposit' ? 'deposit and earn yield' : 'withdraw funds'}
                  </div>
                )}
              </div>

              {/* Current Position */}
              {userPosition.deposited_usdc > 0 && currentUserWallet && (
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Your Current Position</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Deposited:</span>
                      <span className="font-mono">${userPosition.deposited_usdc.toLocaleString()} USDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Est. Monthly Yield:</span>
                      <span className="font-mono text-success">${userPosition.estimated_yield.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current APR:</span>
                      <span className="font-mono text-success">{currentAPR.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* APR Display with Enhanced Tooltip */}
              <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <Tooltip content={getAPRBreakdown()}>
                    <span className="text-text-secondary cursor-help flex items-center">
                      Current LP APR
                      <span className="ml-1 text-xs text-primary">ⓘ</span>
                    </span>
                  </Tooltip>
                  <span className="text-success text-xl font-bold">
                    {currentAPR.toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-text-secondary">
                  From creator trading fees and borrowing interest • {((totalBorrowed / (poolData?.tvl_usdc || 1)) * 100).toFixed(1)}% pool utilization
                </div>
              </div>

              {/* Projected Earnings */}
              {activeTab === 'deposit' && amount && parseFloat(amount) > 0 && currentUserWallet && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <h3 className="text-primary font-semibold mb-2">Projected Earnings</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Monthly:</span>
                      <span className="font-mono">${projectedMonthlyEarnings} USDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Yearly:</span>
                      <span className="font-mono">${projectedYearlyEarnings} USDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span>APR:</span>
                      <span className="font-mono text-success">{currentAPR.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Withdrawal Impact */}
              {activeTab === 'withdraw' && amount && parseFloat(amount) > 0 && parseFloat(amount) <= userPosition.deposited_usdc && currentUserWallet && (
                <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-4">
                  <h3 className="text-secondary font-semibold mb-2">After Withdrawal</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Remaining:</span>
                      <span className="font-mono">${(userPosition.deposited_usdc - parseFloat(amount)).toLocaleString()} USDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span>New Monthly Yield:</span>
                      <span className="font-mono">${calculateMonthlyYield(userPosition.deposited_usdc - parseFloat(amount)).toFixed(2)} USDC</span>
                    </div>
                  </div>
                </div>
              )}

              {!currentUserWallet ? (
                <button
                  onClick={handleConnectWallet}
                  disabled={isConnecting}
                  className="w-full py-3 rounded-xl font-semibold text-lg transition-colors bg-primary text-dark hover:bg-primary/90 disabled:opacity-50"
                >
                  {isConnecting ? 'Connecting...' : 'Connect Wallet to Start'}
                </button>
              ) : (
                <button
                  onClick={handleAction}
                  disabled={
                    !amount || 
                    parseFloat(amount) <= 0 || 
                    isProcessing ||
                    (activeTab === 'withdraw' && parseFloat(amount) > userPosition.deposited_usdc)
                  }
                  className={`w-full py-3 rounded-xl font-semibold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    activeTab === 'deposit'
                      ? 'bg-primary text-dark hover:bg-primary/90'
                      : 'bg-secondary text-white hover:bg-secondary/90'
                  }`}
                >
                  {isProcessing ? 'Processing...' : 
                   activeTab === 'deposit' ? `Deposit ${formatCurrency(parseFloat(amount) || 0)} USDC` : `Withdraw ${formatCurrency(parseFloat(amount) || 0)} USDC`}
                </button>
              )}

              {activeTab === 'withdraw' && parseFloat(amount) > userPosition.deposited_usdc && currentUserWallet && (
                <div className="text-red-400 text-sm text-center">
                  Insufficient deposited balance
                </div>
              )}
            </div>
          </div>

          {/* Info Panel */}
          <div className="space-y-6">
            {/* Pool Stats */}
            <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Pool Statistics</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total Pool Size</span>
                  <span className="font-mono">${poolData ? (poolData.tvl_usdc / 1000).toFixed(0) : '250'}K</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Available Liquidity</span>
                  <span className="font-mono text-primary">
                    ${(availableLiquidity / 1000).toFixed(0)}K
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total Borrowed</span>
                  <span className="font-mono text-secondary">
                    ${(totalBorrowed / 1000).toFixed(0)}K
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Pool Utilization</span>
                  <span className="font-mono text-accent">
                    {poolData ? ((totalBorrowed / poolData.tvl_usdc) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Active Borrowers</span>
                  <span className="font-mono text-accent">
                    {creators.filter(c => c.activeLoan).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <Tooltip content={getAPRBreakdown()}>
                    <span className="text-text-secondary cursor-help flex items-center">
                      Current LP APR
                      <span className="ml-1 text-xs text-primary">ⓘ</span>
                    </span>
                  </Tooltip>
                  <span className="text-success font-mono">{currentAPR.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Rewards Vault Staking */}
            <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold">Stake attnUSD</h3>
                  <p className="text-sm text-text-secondary">
                    Stake your attnUSD to earn SOL rewards from the rewards vault.
                  </p>
                </div>
                <div className="text-xs text-text-secondary uppercase tracking-wide">
                  {activePool ? `Pool ${activePool.pool.slice(0, 6)}…` : 'No pool detected'}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">Amount (attnUSD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={stakeAmount}
                    onChange={(event) => setStakeAmount(event.target.value)}
                    disabled={!writeEnabled || stakeSubmitting}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <button
                    onClick={handleStake}
                    disabled={stakeButtonDisabled}
                    className={`px-4 py-2 rounded-lg font-semibold transition-colors w-full sm:w-auto ${
                      stakeButtonDisabled
                        ? 'bg-primary/10 text-primary/40 cursor-not-allowed'
                        : 'bg-primary text-dark hover:bg-primary/90'
                    }`}
                  >
                    {stakeSubmitting ? 'Submitting…' : 'Stake attnUSD'}
                  </button>

                  <div className="text-xs text-text-secondary flex items-center gap-2">
                    {stakeSubmitting && <div className="loading-spinner-blue" />} 
                    <span>
                      Rewards accrue automatically; unstake anytime while Live mode is enabled.
                    </span>
                  </div>
                </div>

                {stakeButtonDisabled && stakeGuardReason() && (
                  <div className="text-xs text-red-400">
                    {stakeGuardReason()}
                  </div>
                )}
              </div>
            </div>

            {/* LP Position History */}
            <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">LP Position History</h3>
              {!currentUserWallet ? (
                <div className="text-center py-6 text-text-secondary">
                  <div className="font-medium">Connect wallet first</div>
                  <div className="text-sm">Your transaction history will appear here after connecting</div>
                </div>
              ) : userLPHistory.length === 0 ? (
                <div className="text-center py-6 text-text-secondary">
                  <div className="font-medium">No position history</div>
                  <div className="text-sm">Your deposits and withdrawals will appear here</div>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {userLPHistory.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-gray-700/20 rounded border border-gray-600/30 text-sm">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{formatLPHistoryType(item.type)}</span>
                          <span className={`font-medium ${
                            item.type === 'deposit' ? 'text-success' : 'text-red-400'
                          }`}>
                            {item.type === 'deposit' ? '+' : '-'}${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-text-secondary mt-1">
                          <span>{item.date}</span>
                          <span className="text-success uppercase">
                            {item.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
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

        @keyframes fade-in-out {
          0% { opacity: 0; transform: translateX(100%); }
          10% { opacity: 1; transform: translateX(0); }
          90% { opacity: 1; transform: translateX(0); }
          100% { opacity: 0; transform: translateX(100%); }
        }
        
        .animate-fade-in-out {
          animation: fade-in-out 4s ease-in-out forwards;
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
