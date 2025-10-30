'use client';

import React from 'react';

export default function RedeemPage(): React.JSX.Element {
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
            <h1 className="text-3xl font-bold">Redeem USDC</h1>
            <p className="text-text-secondary mt-2">Withdraw your deposits and claim yield</p>
          </div>
          <a href="/" className="text-text-secondary hover:text-primary transition-colors">
            ← Back to Dashboard
          </a>
        </div>

        <div className="bg-dark-card border border-gray-700 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-success text-2xl">💸</span>
          </div>
          <h2 className="text-xl font-bold mb-4">Redeem Your Position</h2>
          <p className="text-text-secondary mb-6">
            Withdrawal and yield claiming interface coming soon.
          </p>
          <button
            onClick={() => alert('Redeem functionality coming soon!\n\nThis will allow LPs to withdraw their USDC deposits and claim accumulated yield from sponsor revenues.')}
            className="bg-success text-dark px-6 py-3 rounded-xl font-semibold hover:bg-success/90 transition-colors"
          >
            Coming Soon
          </button>
        </div>
      </div>
    </div>
  );
}