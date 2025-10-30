// apps/dapp/app/components/Navigation.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAppContext } from '../context/AppContext';
import type { DataMode } from '../config/runtime';

export default function Navigation(): React.JSX.Element {
  const pathname = usePathname();
  const {
    resetToDefaults,
    currentUserWallet,
    notifications,
    removeNotification,
    addNotification,
    isConnecting,
    isListing,
    isWalletConnected,
    isUserPreviewed,
    isUserListed,
    isFullyConnected,
    connectWallet,
    signAndListCreator,
    mode,
    isLive,
    healthStatus,
    switchMode,
    lastModeError,
    cluster,
    isLiveForced,
    disconnectWallet
  } = useAppContext();
  
  const [isHovering, setIsHovering] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [modeChanging, setModeChanging] = useState(false);
  const previousMode = useRef<DataMode>(mode);
  const upperCluster = cluster ? cluster.toUpperCase() : '';
  const liveBadgeLabel = upperCluster ? `LIVE — ${upperCluster}` : 'LIVE';
  const liveBannerLabel = cluster ? `Live — ${cluster}` : 'Live mode';
  const [livePulseActive, setLivePulseActive] = useState(false);
  const showPendingBadge = isLive && isUserPreviewed && !isUserListed;
  const pendingBannerMessage = 'Leaderboard preview ready — finish your Squads safe to unlock advances.';
  const autoConnectAttemptedRef = useRef(false);
  const sponsorTooltip = 'Sponsors include creators, builders, and DAOs with on-chain revenue.';

  // Ensure component is mounted before using context values to prevent hydration mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !lastModeError) return;
    addNotification({
      type: 'error',
      title: 'Live mode unavailable',
      message: lastModeError,
      duration: 5000,
    });
  }, [lastModeError, mounted, addNotification]);

  useEffect(() => {
    if (!mounted) return;
    if (mode === 'live' && healthStatus === 'healthy' && previousMode.current !== 'live') {
      addNotification({
        type: 'success',
        title: 'Live mode enabled',
        message: liveBannerLabel,
        duration: 4000,
      });
    }
    previousMode.current = mode;
  }, [mode, healthStatus, mounted, addNotification, cluster]);

  useEffect(() => {
    if (!mounted) return;
    if (mode === 'live') {
      setLivePulseActive(true);
      const timeout = window.setTimeout(() => setLivePulseActive(false), 3200);
      return () => window.clearTimeout(timeout);
    }
    setLivePulseActive(false);
  }, [mode, mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (isLiveForced && !isWalletConnected && !isConnecting && !autoConnectAttemptedRef.current) {
      autoConnectAttemptedRef.current = true;
      void connectWallet();
    }
    if (!isLiveForced) {
      autoConnectAttemptedRef.current = false;
    }
  }, [mounted, isLiveForced, isWalletConnected, isConnecting, connectWallet]);

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname?.startsWith(path)) return true;
    return false;
  };

  const handleReset = () => {
    if (confirm('⚠️ Reset all app data?\n\nThis will clear:\n• All creators and loans\n• All transaction history\n• Your wallet and deposits\n• Pool data\n\nThe page will reload with fresh demo data.')) {
      resetToDefaults();
    }
  };

  const handleDisconnectWallet = () => {
    if (isLiveForced || mode === 'live') {
      void disconnectWallet().then(() => {
        addNotification({
          type: 'success',
          title: 'Wallet disconnected',
          message: 'Reconnect when you are ready to continue.',
          duration: 2800,
        });
      });
      return;
    }

    if (confirm('Disconnect demo wallet?\n\nThis will:\n• Clear your wallet connection\n• Reset all app data\n• Clear transaction history\n• Reload with fresh demo data')) {
      resetToDefaults();
    }
  };

  const formatWalletAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleModeChange = async (target: DataMode) => {
    if ((isLiveForced && target === 'demo') || target === mode || modeChanging) return;
    setModeChanging(true);
    try {
      await switchMode(target);
    } finally {
      setModeChanging(false);
    }
  };

  const liveDisabled = healthStatus === 'checking' || modeChanging;
  const bannerMessage = mode === 'live'
    ? healthStatus === 'checking'
      ? `Checking ${cluster || 'live'} readiness…`
      : healthStatus === 'unhealthy'
      ? lastModeError || (isLiveForced ? 'Live mode degraded; staying in Live.' : 'Live mode unavailable; reverted to Demo.')
      : showPendingBadge
      ? pendingBannerMessage
      : liveBannerLabel
    : '';
  const liveBadgeClasses =
    mode === 'live'
      ? `bg-secondary/20 text-secondary border-secondary/40 ${livePulseActive ? 'animate-live-pulse' : ''}`
      : 'bg-warning/20 text-warning border-warning/30';

  const clusterTooltip =
    cluster?.toLowerCase() === 'devnet'
      ? 'Solana devnet active. Switch your wallet network to Devnet (Phantom: Settings → Change Network → Devnet. Backpack: Avatar → Network → Devnet).'
      : 'Toggle between demo data and live cluster mode.';

  const renderModeToggle = (className = '') => {
    if (isLiveForced) {
      return (
        <div
          className={`flex items-center bg-dark/40 border border-gray-700 rounded-full text-xs sm:text-sm px-3 py-1 ${className}`}
          title={clusterTooltip}
          aria-label={clusterTooltip}
        >
          <span className={`flex items-center gap-2 font-semibold ${livePulseActive ? 'animate-live-pulse' : ''}`}>
            <span className="text-secondary">Live</span>
            <span className="hidden lg:inline text-[10px] uppercase tracking-wide text-text-secondary">
              {upperCluster || cluster}
            </span>
          </span>
        </div>
      );
    }

    return (
      <div className={`flex items-center bg-dark/40 border border-gray-700 rounded-full overflow-hidden text-xs sm:text-sm ${className}`}>
        <button
          onClick={() => handleModeChange('demo')}
          disabled={mode === 'demo' || modeChanging}
          className={`px-3 py-1 transition-colors ${
            mode === 'demo'
              ? 'bg-primary text-dark font-semibold'
              : 'bg-transparent text-text-secondary hover:text-primary'
          }`}
        >
          Demo
        </button>
        <div className="w-px h-4 bg-gray-700" />
        <button
          onClick={() => handleModeChange('live')}
          disabled={liveDisabled}
          className={`px-3 py-1 transition-colors flex items-center space-x-1 ${
            mode === 'live'
              ? `bg-secondary text-dark font-semibold ${livePulseActive ? 'animate-live-pulse' : ''}`
              : 'text-text-secondary hover:text-secondary'
          } ${liveDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          title={clusterTooltip}
          aria-label={clusterTooltip}
        >
          {mode === 'live' && (healthStatus === 'checking' || modeChanging) ? (
            <div className="w-3 h-3 border-2 border-secondary/40 border-t-secondary rounded-full animate-spin"></div>
          ) : null}
          <span>Live</span>
          <span className="hidden lg:inline text-[10px] uppercase tracking-wide">
            ({upperCluster || cluster})
          </span>
        </button>
      </div>
    );
  };

  // Determine button state and appearance
  const getWalletButton = () => {
    const connectTooltip = isLiveForced
      ? 'Connect a Solana wallet set to the Devnet network to continue.'
      : 'Connect your wallet to get started.';

    if (!mounted) {
      return (
        <div className="px-3 py-1.5 rounded-lg bg-primary/50 text-dark/70 font-medium text-sm">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 border-2 border-dark/30 border-t-dark rounded-full animate-spin"></div>
            <span className="hidden sm:inline">Loading...</span>
          </div>
        </div>
      );
    }

    if (isWalletConnected) {
      return (
        <button 
          onClick={handleDisconnectWallet}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-all duration-200 ${
            isHovering 
              ? 'bg-red-600 text-white hover:bg-red-700' 
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
          title={isHovering ? 'Click to disconnect wallet' : 'Wallet connected'}
        >
          <span className="hidden sm:inline">
            {isHovering ? 'Disconnect' : formatWalletAddress(currentUserWallet)}
          </span>
          <span className="sm:hidden">
            {isHovering ? '✕' : '✓'}
          </span>
        </button>
      );
    } else {
      return (
        <button 
          onClick={connectWallet}
          disabled={isConnecting}
          className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${
            isConnecting 
              ? 'bg-primary/50 text-dark/70 cursor-not-allowed' 
              : 'bg-primary text-dark hover:bg-primary/90'
          }`}
          title={isConnecting ? 'Connecting...' : connectTooltip}
        >
          {isConnecting ? (
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 border-2 border-dark/30 border-t-dark rounded-full animate-spin"></div>
              <span className="hidden sm:inline">Connecting...</span>
            </div>
          ) : (
            <>
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </>
          )}
        </button>
      );
    }
  };

  return (
    <nav className="bg-dark-card border-b border-gray-700">
      {/* Global Notification Stack Container - Mobile Responsive */}
      <div className="fixed top-16 sm:top-20 left-2 right-2 sm:left-auto sm:right-8 z-[9999] sm:w-80">
        {mounted && notifications
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
              } px-4 sm:px-6 py-3 sm:py-4 rounded-lg shadow-xl backdrop-blur-sm`}
              style={{
                top: `${topPosition}px`,
                zIndex: 9999 - notification.position,
                opacity: Math.max(0.85, 1 - (visualIndex * 0.08)),
              }}
            >
              <div className="flex items-center space-x-2 sm:space-x-3">
                {notification.type === 'processing' ? (
                  <div className="loading-spinner loading-spinner-blue flex-shrink-0"></div>
                ) : notification.type === 'success' ? (
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"></div>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></div>
                )}
                <div className="min-w-0 flex-1">
                  <div className={`font-semibold text-sm sm:text-base ${
                    notification.type === 'success' ? 'text-green-400' :
                    notification.type === 'error' ? 'text-red-400' :
                    'text-blue-400'
                  }`}>
                    {notification.title}
                  </div>
                  <div className={`text-xs sm:text-sm opacity-90 ${
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
                    className="text-red-400 hover:text-red-300 ml-2 text-lg leading-none hover:bg-red-500/20 rounded px-1 flex-shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {mode === 'live' && (
        <div
          className={`text-center text-xs sm:text-sm py-2 border-b ${
            healthStatus === 'healthy'
              ? 'bg-secondary/10 border-secondary/30 text-secondary'
              : healthStatus === 'checking'
              ? 'bg-warning/10 border-warning/30 text-warning'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {bannerMessage}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16">
          {/* Logo */}
          <a href="/" className="flex items-center space-x-1 sm:space-x-2 hover:opacity-80 transition-opacity">
            <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-r from-primary to-secondary rounded-lg"></div>
            <span className="text-base sm:text-xl font-semibold">attn.markets</span>
            <span className="text-xs bg-secondary px-1 sm:px-2 py-0.5 sm:py-1 rounded hidden sm:inline">App</span>
            <span className={`text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded ml-1 sm:ml-2 border ${liveBadgeClasses}`}>
              {mode === 'live' ? liveBadgeLabel : 'DEMO'}
            </span>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4 lg:space-x-6">
            <a
              href="/"
              className={`transition-colors ${
                isActive('/')
                  ? 'text-primary font-semibold'
                  : 'text-text-secondary hover:text-primary'
              }`}
            >
              Dashboard
            </a>
            <a
              href="/leaderboard"
              className={`transition-colors ${
                isActive('/leaderboard')
                  ? 'text-primary font-semibold'
                  : 'text-text-secondary hover:text-primary'
              }`}
            >
              Leaderboard
            </a>
            <a
              href="/creator"
              className={`transition-colors ${
                isActive('/creator')
                  ? 'text-primary font-semibold'
                  : 'text-text-secondary hover:text-primary'
              }`}
              title={sponsorTooltip}
            >
              Sponsors
            </a>
            <a
              href="/deposit"
              className={`transition-colors ${
                isActive('/deposit')
                  ? 'text-primary font-semibold'
                  : 'text-text-secondary hover:text-primary'
              }`}
            >
              LP
            </a>

            {renderModeToggle('ml-2')}

            {getWalletButton()}

            {showPendingBadge && (
              <span className="hidden md:inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-warning">
                Pending Squads setup
              </span>
            )}

            {mode === 'demo' && (
              <button
                onClick={handleReset}
                className="bg-gray-600 text-gray-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-500 hover:text-gray-300 transition-colors"
                title="Reset all app data and reload with fresh demo data"
              >
                Reset
              </button>
            )}
          </div>

          {/* Mobile Menu Button & Wallet */}
          <div className="flex md:hidden items-center space-x-2">
            {getWalletButton()}

            {showPendingBadge && (
              <span className="inline-flex md:hidden items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
                Pending
              </span>
            )}

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-text-primary p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-gray-700">
            <div className="flex flex-col space-y-3">
              <a 
                href="/" 
                className={`px-3 py-2 transition-colors ${
                  isActive('/') 
                    ? 'text-primary font-semibold bg-primary/10 rounded' 
                    : 'text-text-secondary'
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Dashboard
              </a>
              <a 
                href="/leaderboard" 
                className={`px-3 py-2 transition-colors ${
                  isActive('/leaderboard') 
                    ? 'text-primary font-semibold bg-primary/10 rounded' 
                    : 'text-text-secondary'
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Leaderboard
              </a>
              <a 
                href="/creator" 
                className={`px-3 py-2 transition-colors ${
                  isActive('/creator') 
                    ? 'text-primary font-semibold bg-primary/10 rounded' 
                    : 'text-text-secondary'
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
                title={sponsorTooltip}
              >
                Sponsors
              </a>
              <a
                href="/deposit"
                className={`px-3 py-2 transition-colors ${
                  isActive('/deposit')
                    ? 'text-primary font-semibold bg-primary/10 rounded'
                    : 'text-text-secondary'
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                LP
              </a>
              <div className="px-3">
                {renderModeToggle('md:hidden w-full justify-between mt-1')}
              </div>
              {mode === 'demo' && (
                <button
                  onClick={handleReset}
                  className="text-left px-3 py-2 text-gray-400 hover:text-gray-300"
                >
                  Reset Data
                </button>
              )}
            </div>
          </div>
        )}
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
          width: 14px;
          height: 14px;
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
    </nav>
  );
}
