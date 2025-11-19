'use client';

import React from 'react';

export default function TradePage(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-dark text-text-primary">
      {/* Navigation */}
      <nav className="bg-dark-card border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-lg"></div>
              <span className="text-xl font-semibold">attn.markets</span>
              <span className="text-xs bg-secondary px-2 py-1 rounded">App</span>
            </div>
            <div className="flex items-center space-x-6">
              <a href="/" className="text-text-secondary hover:text-primary transition-colors">Dashboard</a>
              <a href="/leaderboard" className="text-text-secondary hover:text-primary transition-colors">Leaderboard</a>
              <a href="/creator" className="text-text-secondary hover:text-primary transition-colors">Creators</a>
              <a href="/deposit" className="text-text-secondary hover:text-primary transition-colors">LP</a>
              <button className="bg-primary text-dark px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors">
                Connect Wallet
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Trade YT-30d</h1>
            <p className="text-text-secondary mt-2">Trade yield tokens on secondary markets</p>
          </div>
          <a href="/" className="text-text-secondary hover:text-primary transition-colors">
            ← Back to Dashboard
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4">External Trading</h2>
            <p className="text-text-secondary mb-6">
              Trade cYT-30d tokens on decentralized exchanges.
            </p>
            <div className="space-y-3">
              <a
                href="https://raydium.io"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded-lg font-medium hover:bg-primary/20 transition-colors text-center"
              >
                Trade on Raydium →
              </a>
              <a
                href="https://jup.ag"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-secondary/10 border border-secondary/20 text-secondary px-4 py-3 rounded-lg font-medium hover:bg-secondary/20 transition-colors text-center"
              >
                Trade on Jupiter →
              </a>
            </div>
          </div>

          <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4">Token Info</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-text-secondary">Token</span>
                <span className="font-mono">YT-30d</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Current Epoch</span>
                <span>Aug 2025</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Expiry</span>
                <span className="text-warning">Aug 31, 2025</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Underlying</span>
                <span>User Revenues Yield</span>
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-gray-700">
              <div className="text-xs text-text-secondary">
                ⚠️ Trading yield tokens carries additional risks including impermanent loss and liquidity constraints.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}