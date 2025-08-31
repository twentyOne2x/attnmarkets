// apps/dapp/app/components/Navigation.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAppContext } from '../context/AppContext';

export default function Navigation(): React.JSX.Element {
  const pathname = usePathname();
  const { 
    resetToDefaults, 
    currentUserWallet, 
    notifications,
    removeNotification,
    isConnecting,
    isListing,
    isWalletConnected,
    isUserListed,
    isFullyConnected,
    connectWallet,
    signAndListCreator
  } = useAppContext();
  
  const [isHovering, setIsHovering] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted before using context values to prevent hydration mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (confirm('Disconnect wallet?\n\nThis will:\n• Clear your wallet connection\n• Reset all app data\n• Clear transaction history\n• Reload with fresh demo data\n\nThis is the same as clicking Reset.')) {
      console.log('🔑 Wallet disconnected - resetting app');
      resetToDefaults();
    }
  };

  const formatWalletAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-4)}`;
  };

  // Determine button state and appearance
  const getWalletButton = () => {
    // Don't render anything until mounted to prevent hydration issues
    if (!mounted) {
      return (
        <div className="px-4 py-2 rounded-lg bg-primary/50 text-dark/70 font-medium">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-dark/30 border-t-dark rounded-full animate-spin"></div>
            <span>Loading...</span>
          </div>
        </div>
      );
    }

    if (isWalletConnected) {
      // State 2: Connected - show address with disconnect on hover
      return (
        <button 
          onClick={handleDisconnectWallet}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
            isHovering 
              ? 'bg-red-600 text-white hover:bg-red-700' 
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
          title={isHovering ? 'Click to disconnect wallet' : 'Wallet connected'}
        >
          {isHovering ? 'Disconnect Wallet' : formatWalletAddress(currentUserWallet)}
        </button>
      );
    } else {
      // State 1: Not connected - show connect wallet button
      return (
        <button 
          onClick={connectWallet}
          disabled={isConnecting}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            isConnecting 
              ? 'bg-primary/50 text-dark/70 cursor-not-allowed' 
              : 'bg-primary text-dark hover:bg-primary/90'
          }`}
          title={isConnecting ? 'Connecting...' : 'Connect your wallet to get started'}
        >
          {isConnecting ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-dark/30 border-t-dark rounded-full animate-spin"></div>
              <span>Connecting...</span>
            </div>
          ) : (
            'Connect Wallet'
          )}
        </button>
      );
    }
  };

  return (
    <nav className="bg-dark-card border-b border-gray-700">
      {/* Global Notification Stack Container */}
      <div className="fixed top-20 right-8 z-[9999] w-80">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <a href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-lg"></div>
            <span className="text-xl font-semibold">attn.market</span>
            <span className="text-xs bg-secondary px-2 py-1 rounded">App</span>
            <span className="text-xs bg-warning/20 text-warning border border-warning/30 px-2 py-1 rounded ml-2">DEMO</span>
          </a>
          <div className="flex items-center space-x-6">
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
            >
              Creators
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
            
            {/* Dynamic Wallet Button */}
            {getWalletButton()}
            
            <button 
              onClick={handleReset}
              className="bg-gray-600 text-gray-400 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-500 hover:text-gray-300 transition-colors"
              title="Reset all app data and reload with fresh demo data"
            >
              Reset
            </button>
          </div>
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
    </nav>
  );
}