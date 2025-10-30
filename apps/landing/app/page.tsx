'use client';

import React, { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';

export default function Home(): React.JSX.Element {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<string>('hero');
  const [nextSection, setNextSection] = useState<string>('');
  const [openFAQs, setOpenFAQs] = useState<Set<string>>(new Set());
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  
  // Rotating words animation
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [hasStoppedRotating, setHasStoppedRotating] = useState(false);
  const rotatingWords = ['builder', 'DAO', 'creator'];

  useEffect(() => {
    setIsVisible(true);

    // Scroll spy functionality
    const handleScroll = () => {
      const sections = ['hero', 'problem', 'solution', 'benefits', 'faq'];
      const scrollPosition = window.scrollY + 200;

      let detectedNextSection = '';
      for (let i = 0; i < sections.length; i++) {
        const currentSectionId = sections[i];
        const nextSectionId = sections[i + 1];
        const currentElement = document.getElementById(currentSectionId);
        const nextElement = nextSectionId ? document.getElementById(nextSectionId) : null;

        if (currentElement) {
          const currentOffsetTop = currentElement.offsetTop;
          const currentOffsetBottom = currentOffsetTop + currentElement.offsetHeight;

          if (scrollPosition >= currentOffsetTop && scrollPosition < currentOffsetBottom) {
            setActiveSection(currentSectionId);
            
            if (nextElement && nextSectionId) {
              const progressInSection = (scrollPosition - currentOffsetTop) / (currentOffsetBottom - currentOffsetTop);
              if (progressInSection > 0.7) {
                detectedNextSection = nextSectionId;
              }
            }
            break;
          }
        }
      }
      setNextSection(detectedNextSection);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Rotating words effect - stops after 5 rotations on 'creator'
  useEffect(() => {
    // With builder/DAO/creator ordering (index 0/1/2), five rotations plus a final step
    // leaves us on index 17, which resolves to 'creator' (final focus state).
    const finalIndex = rotatingWords.length * 5 + (rotatingWords.length - 1); // 17 for 3-word list
    
    if (!hasStoppedRotating) {
      const interval = setInterval(() => {
        setCurrentWordIndex((prevIndex) => {
          const nextIndex = prevIndex + 1;
          
          if (nextIndex >= finalIndex) {
            setHasStoppedRotating(true);
            clearInterval(interval);
            return finalIndex; // Stay at the last 'creator' entry
          }
          
          return nextIndex;
        });
      }, 1500); // 1.5 seconds per word

      return () => clearInterval(interval);
    }
  }, [hasStoppedRotating]);

  const showComingSoon = (feature: string) => {
    setToastMessage(`${feature} coming soon!`);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const toggleFAQ = (faqId: string) => {
    const newOpenFAQs = new Set(openFAQs);
    if (newOpenFAQs.has(faqId)) {
      newOpenFAQs.delete(faqId);
    } else {
      newOpenFAQs.add(faqId);
    }
    setOpenFAQs(newOpenFAQs);
  };

  const tableOfContents = [
    { id: 'hero', label: 'Overview' },
    { id: 'problem', label: 'The Problem' },
    { id: 'solution', label: 'Our Solution' },
    { id: 'benefits', label: 'Why It Matters' },
    { id: 'faq', label: 'FAQ' }
  ];

  return (
    <main className="bg-dark text-text-primary min-h-screen">
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-20 right-8 z-50 bg-warning/20 border border-warning/30 text-warning px-4 py-3 rounded-lg shadow-xl animate-fade-in-out">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Table of Contents */}
      <div className="fixed right-8 top-1/2 transform -translate-y-1/2 z-40 hidden xl:block">
        <div className="bg-dark-card/80 backdrop-blur-md border border-gray-700 rounded-xl p-4">
          <div className="space-y-2">
            {tableOfContents.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`block w-full text-left px-3 py-2 rounded-lg transition-all duration-300 ${
                  activeSection === item.id
                    ? 'bg-primary text-dark font-bold text-base transform scale-100'
                    : nextSection === item.id
                    ? 'text-primary hover:text-primary hover:bg-gray-800/50 text-base font-medium transform scale-105'
                    : 'text-text-secondary hover:text-primary hover:bg-gray-800/50 text-sm transform scale-95'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-dark/80 backdrop-blur-md border-b border-gray-800 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-lg"></div>
              <span className="text-xl font-semibold">attn.markets</span>
              <span className="text-xs bg-warning/20 text-warning border border-warning/30 px-2 py-1 rounded ml-2">DEMO</span>
            </div>
            <div className="flex items-center space-x-6">
              <button 
                onClick={() => showComingSoon('Documentation')}
                className="text-text-secondary hover:text-primary transition-colors hidden sm:inline"
              >
                Docs
              </button>
              <a href="https://app.attn.markets" className="bg-primary text-dark px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors">
                Launch App
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="hero" className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="text-lg text-text-secondary mb-4">Solana's bridge from earnings to funding</div>
          
          <h1 className={`text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold mb-8 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`} style={{ overflow: 'hidden' }}>
                    <span className="gradient-text block mb-4">Get instant funding</span>
                    <div className="text-2xl sm:text-5xl lg:text-6xl xl:text-7xl text-white inline-flex items-center justify-center" style={{ overflow: 'hidden' }}>
                      <span>backed by your</span>
                      <div className="word-wheel-container mx-3 sm:mx-6">
                        <div 
                          className="word-wheel-inner" 
                          style={{ 
                            transform: `translateY(-${currentWordIndex * 1}em)` 
                          }}
                        >
                          {/* Create array for 5 rotations plus landing on 'creator' */}
                          {(() => {
                            const displayArray = [];
                            // Need enough words to cover 5 full rotations plus landing on creator
                            // Add a few extra for visual continuity (18 items for 3-word list)
                            const totalWords = rotatingWords.length * 6;
                            
                            for (let i = 0; i < totalWords; i++) {
                              displayArray.push(rotatingWords[i % rotatingWords.length]);
                            }
                            
                            return displayArray.map((word, index) => {
                              const distance = Math.abs(index - currentWordIndex);
                              const isActive = index === currentWordIndex;
                              const isAdjacent = distance === 1;
                              
                              return (
                                <div
                                  key={`${word}-${index}`}
                                  className={`wheel-word ${
                                    isActive ? 'active' : 
                                    isAdjacent ? 'adjacent' : ''
                                  }`}
                                  style={{ overflow: 'hidden' }}
                                >
                                  {word}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                      <span>earnings</span>
                    </div>
            </h1>
          
          <p className="text-lg sm:text-xl text-text-secondary mb-12 max-w-3xl mx-auto">
            Access capital when you need it. No upfront commitments, no token dilution. Only pay back when you borrow.
          </p>
          
          {/* Sponsor vs LP Blocks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16 max-w-5xl mx-auto">
            {/* Sponsor Block */}
            <div className="bg-dark-card border border-primary/20 rounded-2xl p-6 sm:p-8">
              <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-primary text-2xl">🚀</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-4 text-primary">For Sponsors (Builders, DAOs, Creators)</h3>
              <p className="text-base sm:text-lg font-medium mb-6">Unlock cash, keep your upside</p>
              <p className="text-text-secondary mb-8 text-sm sm:text-base">
                Get a funding limit instantly. Only when you borrow do earnings auto-repay. No upfront commitment required for builders, DAOs, or creators.
              </p>
              <div className="space-y-3 mb-8">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">Get advance quote (no obligation)</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">List on leaderboard for free</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">Only pay back when you borrow</span>
                </div>
              </div>
              <a href="https://app.attn.markets" className="bg-primary text-dark px-6 py-3 rounded-xl font-semibold hover:bg-primary/90 transition-all block">
                Get Advance Quote
              </a>
            </div>

            {/* LP Block */}
            <div className="bg-dark-card border border-secondary/20 rounded-2xl p-6 sm:p-8">
              <div className="w-16 h-16 bg-secondary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-secondary text-2xl">💰</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-4 text-secondary">For LPs</h3>
              <p className="text-base sm:text-lg font-medium mb-6">Yield paid first from sponsor earnings</p>
              <p className="text-text-secondary mb-8 text-sm sm:text-base">
                Earn returns uncorrelated to crypto markets. First-priority claims on active sponsor repayments across builders, DAOs, and creators.
              </p>
              <div className="space-y-3 mb-8">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-secondary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">Priority pool deposits</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-secondary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">Uncorrelated yield source</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-secondary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">DeFi composable lending position</span>
                </div>
              </div>
              <a href="https://app.attn.markets/deposit" className="bg-secondary text-white px-6 py-3 rounded-xl font-semibold hover:bg-secondary/90 transition-all block">
                Deposit to Priority Pool
              </a>
            </div>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto mb-16">
            <div className="bg-dark-card border border-gray-700 rounded-xl p-3 sm:p-4 card-hover">
              <div className="text-lg sm:text-xl font-mono font-semibold text-primary mb-1">$100K</div>
              <div className="text-xs sm:text-sm text-text-secondary">Available Funding</div>
            </div>
            <div className="bg-dark-card border border-gray-700 rounded-xl p-3 sm:p-4 card-hover">
              <div className="text-lg sm:text-xl font-mono font-semibold text-secondary mb-1">$250K</div>
              <div className="text-xs sm:text-sm text-text-secondary">Pool TVL</div>
            </div>
            <div className="bg-dark-card border border-gray-700 rounded-xl p-3 sm:p-4 card-hover">
              <div className="text-lg sm:text-xl font-mono font-semibold text-accent mb-1">89.2%</div>
              <div className="text-xs sm:text-sm text-text-secondary">Borrowing Rate (Builders, DAOs, Creators)</div>
            </div>
            <div className="bg-dark-card border border-gray-700 rounded-xl p-3 sm:p-4 card-hover">
              <div className="text-lg sm:text-xl font-mono font-semibold text-success mb-1">48.2%</div>
              <div className="text-xs sm:text-sm text-text-secondary">LP Lending Rate</div>
              <div className="text-xs text-text-secondary mt-1">60.0% utilization</div>
            </div>
          </div>

          {/* Demo Notice */}
          <div className="max-w-2xl mx-auto">
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 sm:p-6">
              <h3 className="text-warning font-semibold mb-2">⚠️ Demo Platform</h3>
              <p className="text-xs sm:text-sm text-text-secondary">
                This is a demonstration platform. All values and transactions are simulated. No real funds are involved.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-dark-card/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">How It Works</h2>
          <p className="text-lg sm:text-xl text-text-secondary text-center mb-16 max-w-3xl mx-auto">
            Simple, sponsor-friendly flow for builders, DAOs, and creators, no upfront commitments
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mb-16">
            <div className="bg-dark-card border border-primary/20 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <div className="text-2xl font-bold text-primary">1</div>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4">Connect & Get Your Limit</h3>
              <p className="text-text-secondary mb-4 text-sm sm:text-base">
                We estimate what you can unlock based on your earnings history. No obligation, completely free.
              </p>
              <div className="bg-gray-800/30 rounded-lg p-3 text-xs sm:text-sm">
                List on leaderboard → Get visibility → Instant quote
              </div>
            </div>
            
            <div className="bg-dark-card border border-secondary/20 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 bg-secondary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <div className="text-2xl font-bold text-secondary">2</div>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4">Open an Advance (Optional)</h3>
              <p className="text-text-secondary mb-4 text-sm sm:text-base">
                When you need funding, pick a repayment percentage and activate your advance. Only then do earnings flow to repayment.
              </p>
              <div className="bg-gray-800/30 rounded-lg p-3 text-xs sm:text-sm">
                Choose repayment % → Get instant funding
              </div>
            </div>
            
            <div className="bg-dark-card border border-accent/20 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 bg-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <div className="text-2xl font-bold text-accent">3</div>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4">Auto-Repay While Active</h3>
              <p className="text-text-secondary mb-4 text-sm sm:text-base">
                Your chosen percentage automatically services the advance. Stop anytime after the epoch ends.
              </p>
              <div className="bg-gray-800/30 rounded-lg p-3 text-xs sm:text-sm">
                Earnings stream → Auto-repay → Keep the rest
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section id="problem" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">The Funding Gap</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-12">
            <div className="bg-dark-card border border-red-500/20 rounded-xl p-6 sm:p-8">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-red-400 text-2xl">⚡</span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4 text-red-400">Builders, DAOs, and Creators need cash before earnings hit</h3>
              <p className="text-text-secondary text-sm sm:text-base">
                Growth opportunities don't wait for monthly payments. Equipment, team expansion, viral moment investments - timing matters for sponsor success across builders, DAOs, and creators.
              </p>
            </div>
            <div className="bg-dark-card border border-red-500/20 rounded-xl p-6 sm:p-8">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-red-400 text-2xl">🏦</span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4 text-red-400">Banks don't get onchain income</h3>
              <p className="text-text-secondary text-sm sm:text-base">
                Traditional finance requires extensive paperwork, credit checks, and collateral. They don't understand irregular onchain revenues or future potential.
              </p>
            </div>
          </div>
          <div className="text-center">
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-6 sm:p-8 inline-block max-w-lg">
              <h3 className="text-lg sm:text-xl font-semibold mb-4 text-primary">We bridge both sides</h3>
              <p className="text-text-secondary text-sm sm:text-base">
                LPs want uncorrelated yield. Builders, DAOs, and creators need flexible funding. We connect those earnings to internet capital markets without the traditional banking overhead.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section id="solution" className="py-20 px-4 sm:px-6 lg:px-8 bg-dark-card/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Our Solution</h2>
          <p className="text-lg sm:text-xl text-text-secondary text-center mb-16 max-w-3xl mx-auto">
            No forced commitments. Sponsors (builders, DAOs, creators) list first, borrow only when needed. While borrowed, chosen earnings percentage auto-repays.
          </p>
          
          <div className="space-y-8 sm:space-y-12">
            {/* For Sponsors */}
            <div className="bg-dark-card border border-primary/20 rounded-2xl p-6 sm:p-8">
              <h3 className="text-xl sm:text-2xl font-semibold mb-6 text-primary text-center">For Sponsors (Builders, DAOs, Creators): No Lock, Just Options</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-primary">📝</span>
                  </div>
                  <h4 className="font-semibold mb-2">List for Free</h4>
                  <p className="text-text-secondary text-sm sm:text-base">Get on the leaderboard with 0% commitment. Pure marketing value, no obligation.</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-primary">💡</span>
                  </div>
                  <h4 className="font-semibold mb-2">Get Instant Quotes</h4>
                  <p className="text-text-secondary text-sm sm:text-base">See your funding potential immediately. Know your options before committing.</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-primary">🎯</span>
                  </div>
                  <h4 className="font-semibold mb-2">Activate When Ready</h4>
                  <p className="text-text-secondary text-sm sm:text-base">Only when you click "Open Advance" do earnings start flowing to repayment.</p>
                </div>
              </div>
            </div>

            {/* For LPs */}
            <div className="bg-dark-card border border-secondary/20 rounded-2xl p-6 sm:p-8">
              <h3 className="text-xl sm:text-2xl font-semibold mb-6 text-secondary text-center">For LPs: First-Priority Claims</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-secondary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-secondary">🏆</span>
                  </div>
                  <h4 className="font-semibold mb-2">Priority Pool</h4>
                  <p className="text-text-secondary text-sm sm:text-base">First-in-line on all active sponsor repayments across builders, DAOs, and creators. Your deposits get priority claims.</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-secondary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-secondary">📊</span>
                  </div>
                  <h4 className="font-semibold mb-2">Uncorrelated Returns</h4>
                  <p className="text-text-secondary text-sm sm:text-base">Earn from sponsor economics, not crypto or money market movements.</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-secondary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-secondary">🔄</span>
                  </div>
                  <h4 className="font-semibold mb-2">Flexible Strategies</h4>
                  <p className="text-text-secondary text-sm sm:text-base">Carry trades, curve plays, and collateral usage with cYT tokens across DeFi.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">Why This Works</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12">
          {/* Sponsor Benefits */}
            <div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-6 text-primary">Sponsor Advantages</h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-primary text-sm">🚫</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">No Upfront Commitments</h4>
                    <p className="text-text-secondary text-sm sm:text-base">Join the platform, get visibility, and access quotes without any earnings obligations. Pay only when you borrow.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-primary text-sm">👑</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Keep 100% Ownership</h4>
                    <p className="text-text-secondary text-sm sm:text-base">No equity dilution, no audience ownership transfer. You maintain complete control over your brand and content.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-primary text-sm">🎛️</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Full Control</h4>
                    <p className="text-text-secondary text-sm sm:text-base">Adjust repayment percentages each epoch. Stop participating anytime after your current period ends.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* LP Benefits */}
            <div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-6 text-secondary">LP Advantages</h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-secondary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-secondary text-sm">🎯</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">True Diversification</h4>
                    <p className="text-text-secondary text-sm sm:text-base">Returns based on sponsor economy growth, completely separate from crypto and traditional markets.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-secondary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-secondary text-sm">🛡️</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Priority Claims</h4>
                    <p className="text-text-secondary text-sm sm:text-base">First-in-line for all active sponsor repayments. Built-in risk management through diversified sponsor pools.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-secondary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-secondary text-sm">🔧</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">DeFi Integration</h4>
                    <p className="text-text-secondary text-sm sm:text-base">Use cYT tokens across Solana DeFi for carry trades, collateral, and yield strategies.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 bg-dark-card/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">Frequently Asked Questions</h2>
          
          {/* Sponsor FAQs */}
          <div className="mb-12">
            <h3 className="text-xl sm:text-2xl font-semibold mb-8 text-primary">For Sponsors</h3>
            <div className="space-y-4">
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('creator-1')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">Do I have to pledge earnings to join?</h4>
                  <svg 
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${openFAQs.has('creator-1') ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFAQs.has('creator-1') && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <p className="text-text-secondary text-sm sm:text-base">
                      No. You can list and get a funding limit with 0% pledged. Only when you open an advance does a percentage of earnings route to repayment. Think of it like getting pre-approved for a credit line - no cost until you use it.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('creator-2')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">What if my earnings drop?</h4>
                  <svg 
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${openFAQs.has('creator-2') ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFAQs.has('creator-2') && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <p className="text-text-secondary text-sm sm:text-base">
                      Repayments are percentage-based, so they auto-adjust down when earnings drop. We re-price weekly and you can pause new advances at epoch end. If you're not actively borrowing, earnings changes don't affect you at all.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('creator-3')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">How quickly can I get funding?</h4>
                  <svg 
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${openFAQs.has('creator-3') ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFAQs.has('creator-3') && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <p className="text-text-secondary text-sm sm:text-base">
                      Once you're listed (which is instant), you can open an advance and receive funding immediately. No approval process, no waiting periods - just choose your repayment percentage and activate.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('creator-5')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">What platforms are supported?</h4>
                  <svg 
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${openFAQs.has('creator-5') ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFAQs.has('creator-5') && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <p className="text-text-secondary text-sm sm:text-base">
                      Currently focused on Solana-based platforms like Pump.fun, but expanding to support any platform where builder, DAO, and creator revenues can be tracked and verified on-chain.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LP FAQs */}
          <div>
            <h3 className="text-xl sm:text-2xl font-semibold mb-8 text-secondary">For Liquidity Providers</h3>
            <div className="space-y-4">
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('lp-1')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">How do I earn from sponsor earnings?</h4>
                  <svg 
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${openFAQs.has('lp-1') ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFAQs.has('lp-1') && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <p className="text-text-secondary text-sm sm:text-base">
                      You deposit USDC which funds sponsor advances. When builders, DAOs, or creators borrow and their earnings flow in, you earn returns as a priority claimant. Your yields come from sponsor repayments, not speculation.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('lp-2')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">What if sponsors don't borrow much?</h4>
                  <svg 
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${openFAQs.has('lp-2') ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFAQs.has('lp-2') && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <p className="text-text-secondary text-sm sm:text-base">
                      APR varies based on utilization, but we bootstrap early epochs with treasury incentives and protocol fees to maintain target yield ranges. As the platform grows, real sponsor demand from builders, DAOs, and creators drives sustainable returns.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('lp-3')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">What are the main risks?</h4>
                  <svg 
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${openFAQs.has('lp-3') ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFAQs.has('lp-3') && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <p className="text-text-secondary text-sm sm:text-base">
                      Sponsor earnings volatility, platform changes, smart contract bugs, and concentration risk if many participants underperform. You have priority claims and portfolio diversification across multiple sponsors.
                    </p>
                  </div>
                )}
              </div>
              
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-lg sm:text-xl text-text-secondary mb-12 max-w-2xl mx-auto">
            Join the on-chain revenue economy's new financial layer for builders, DAOs, and creators. No commitments required to explore your options.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="https://app.attn.markets" className="bg-primary text-dark px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg hover:bg-primary/90 transition-all glow-effect">
              Get Advance Quote
            </a>
            <a href="https://app.attn.markets/leaderboard" className="bg-secondary text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg hover:bg-secondary/90 transition-all">
              View Sponsor Leaderboard
            </a>
          </div>
          
          <div className="mt-8 text-xs sm:text-sm text-text-secondary">
            List for free → Get instant quotes → Activate only when you need funding
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-lg"></div>
              <span className="text-xl font-semibold">attn.markets</span>
            </div>
            <div className="flex items-center space-x-4 sm:space-x-6">
              <button 
                onClick={() => showComingSoon('Terms of Service')}
                className="text-text-secondary hover:text-primary transition-colors text-sm sm:text-base"
              >
                Terms
              </button>
              <button 
                onClick={() => showComingSoon('Privacy Policy')}
                className="text-text-secondary hover:text-primary transition-colors text-sm sm:text-base"
              >
                Privacy
              </button>
              <button 
                onClick={() => showComingSoon('Twitter/X')}
                className="text-text-secondary hover:text-primary transition-colors text-sm sm:text-base"
              >
                Twitter/X
              </button>
              <button 
                onClick={() => showComingSoon('GitHub Repository')}
                className="text-text-secondary hover:text-primary transition-colors text-sm sm:text-base"
              >
                GitHub
              </button>
            </div>
          </div>
          <div className="text-center text-text-secondary text-xs sm:text-sm mt-8">
            © 2025 attn.markets. Solana's bridge from earnings to funding.
          </div>
        </div>
      </footer>
      
      <Analytics />

      <style jsx global>{`
        @keyframes fade-in-out {
          0% { opacity: 0; transform: translateX(100%); }
          10% { opacity: 1; transform: translateX(0); }
          90% { opacity: 1; transform: translateX(0); }
          100% { opacity: 0; transform: translateX(100%); }
        }
        
        .animate-fade-in-out {
          animation: fade-in-out 3s ease-in-out forwards;
        }

        .gradient-text {
          background: linear-gradient(135deg, #14F195 0%, #7C3AED 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .card-hover {
          transition: transform 0.2s ease-in-out;
        }

        .card-hover:hover {
          transform: translateY(-2px);
        }

        .glow-effect {
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
        }

        .glow-effect:hover {
          box-shadow: 0 0 30px rgba(59, 130, 246, 0.5);
        }
        
        /* Vertical word wheel / slot machine effect */
        .word-wheel-container {
          position: relative;
          display: inline-block;
          height: 1em;
          line-height: 1;
          width: 310px;
          overflow: hidden !important;
          vertical-align: baseline;
          /* Prevent any scrollbars */
          overflow-x: hidden !important;
          overflow-y: hidden !important;
        }

        .word-wheel-inner {
          transition: transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1);
          will-change: transform;
          /* Prevent scrollbars on inner container */
          overflow: hidden !important;
        }

        .wheel-word {
          height: 1em;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #14F195 0%, #7C3AED 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          white-space: nowrap;
          font-size: inherit;
          font-weight: inherit;
          opacity: 0.2;
          transform: scale(0.8);
          transition: all 0.6s cubic-bezier(0.4, 0.0, 0.2, 1);
          /* Prevent word-level scrollbars */
          overflow: hidden !important;
        }

        .wheel-word.active {
          opacity: 1;
          transform: scale(1);
        }

        .wheel-word.adjacent {
          opacity: 0.4;
          transform: scale(0.9);
        }

        /* Mobile adjustments */
        @media (max-width: 640px) {
          .word-wheel-container {
            width: 80px;
          }
        }
      `}</style>
    </main>
  );
}
