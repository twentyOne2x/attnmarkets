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
              <a
                href="https://docs.attn.markets"
                target="_blank"
                rel="noreferrer"
                className="text-text-secondary hover:text-primary transition-colors hidden sm:inline"
              >
                Docs
              </a>
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
          <div className="text-lg text-text-secondary mb-4">Revenue-backed credit lines on Solana</div>
          
          <h1
            className={`mt-8 sm:mt-10 text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold mb-8 leading-[1.05] sm:leading-[1.1] transition-all duration-1000 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
            }`}
          >
            <span className="gradient-text block pb-[0.12em] mb-4 sm:mb-6">
              Get a credit line backed by
            </span>

            <div className="text-2xl sm:text-5xl lg:text-6xl xl:text-7xl text-white inline-flex items-center justify-center pb-[0.2em]">
              <span>your</span>
              <div className="word-wheel-container mx-3 sm:mx-6 overflow-hidden">
                <div
                  className="word-wheel-inner"
                  style={{
                    transform: `translateY(-${currentWordIndex * 1}em)`
                  }}
                >
                  {(() => {
                    const displayArray: string[] = []
                    const totalWords = rotatingWords.length * 6
                    for (let i = 0; i < totalWords; i++) {
                      displayArray.push(rotatingWords[i % rotatingWords.length])
                    }
                    return displayArray.map((word, index) => {
                      const distance = Math.abs(index - currentWordIndex)
                      const isActive = index === currentWordIndex
                      const isAdjacent = distance === 1
                      return (
                        <div
                          key={`${word}-${index}`}
                          className={`wheel-word ${isActive ? 'active' : isAdjacent ? 'adjacent' : ''}`}
                        >
                          {word}
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
              <span>revenues</span>
            </div>
          </h1>

          <p className="text-lg sm:text-xl text-text-secondary mb-12 max-w-3xl mx-auto">
            Connect your onchain income, get a financing limit, and draw when you need cash. No token sales. Repay automatically from a share of future revenues.
          </p>
          
          {/* User vs LP Blocks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16 max-w-5xl mx-auto">
            {/* User Block */}
            <div className="bg-dark-card border border-primary/20 rounded-2xl p-6 sm:p-8">
              <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-primary text-2xl">🚀</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-4 text-primary">For builders, DAOs, and creators</h3>
              <p className="text-base sm:text-lg font-medium mb-6">Turn recurring income into a financing tool</p>
              <p className="text-text-secondary mb-8 text-sm sm:text-base">
                Get a revenue-backed limit first. Only when you open an advance or draw on a line do repayments start, directly from your incoming revenues.
              </p>
              <div className="space-y-3 mb-8">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">Connect revenues and see your limit (no obligation)</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">Keep 100% ownership of your token and audience</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">Repay from a fixed share of future revenues while active</span>
                </div>
              </div>
              <a
                href="https://app.attn.markets"
                className="bg-primary text-dark px-6 py-3 rounded-xl font-semibold hover:bg-primary/90 transition-all block"
              >
                Get Revenue-Based Quote
              </a>
            </div>

            {/* LP Block */}
            <div className="bg-dark-card border border-secondary/20 rounded-2xl p-6 sm:p-8">
              <div className="w-16 h-16 bg-secondary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-secondary text-2xl">💰</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-4 text-secondary">For liquidity providers</h3>
              <p className="text-base sm:text-lg font-medium mb-6">Yield backed by apps cashflows</p>
              <p className="text-text-secondary mb-8 text-sm sm:text-base">
                Deposit stablecoins into the priority pool and earn yield from a diversified book of revenue-backed advances and credit lines, via attnUSD.
              </p>
              <div className="space-y-3 mb-8">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-secondary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">First-priority claims on active repayments</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-secondary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">Exposure to revenue-backed credit, not token price</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-secondary rounded-full flex-shrink-0"></div>
                  <span className="text-sm">Composable position you can use across Solana DeFi</span>
                </div>
              </div>
              <a
                href="https://app.attn.markets/deposit"
                className="bg-secondary text-white px-6 py-3 rounded-xl font-semibold hover:bg-secondary/90 transition-all block"
              >
                Deposit to Priority Pool
              </a>
            </div>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto mb-16">
            <div className="bg-dark-card border border-gray-700 rounded-xl p-3 sm:p-4 card-hover">
              <div className="text-lg sm:text-xl font-mono font-semibold text-primary mb-1">$100K</div>
              <div className="text-xs sm:text-sm text-text-secondary">Simulated available financing</div>
            </div>
            <div className="bg-dark-card border border-gray-700 rounded-xl p-3 sm:p-4 card-hover">
              <div className="text-lg sm:text-xl font-mono font-semibold text-secondary mb-1">$250K</div>
              <div className="text-xs sm:text-sm text-text-secondary">Simulated pool TVL</div>
            </div>
            <div className="bg-dark-card border border-gray-700 rounded-xl p-3 sm:p-4 card-hover">
              <div className="text-lg sm:text-xl font-mono font-semibold text-accent mb-1">89.2%</div>
              <div className="text-xs sm:text-sm text-text-secondary">Demo borrower APR (builders, DAOs, creators)</div>
            </div>
            <div className="bg-dark-card border border-gray-700 rounded-xl p-3 sm:p-4 card-hover">
              <div className="text-lg sm:text-xl font-mono font-semibold text-success mb-1">48.2%</div>
              <div className="text-xs sm:text-sm text-text-secondary">Demo LP APR</div>
              <div className="text-xs text-text-secondary mt-1">At 60.0% simulated utilization</div>
            </div>
          </div>

          {/* Demo Notice */}
          <div className="max-w-2xl mx-auto">
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 sm:p-6">
              <h3 className="text-warning font-semibold mb-2">⚠️ Demo platform</h3>
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
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">How it works</h2>
          <p className="text-lg sm:text-xl text-text-secondary text-center mb-16 max-w-3xl mx-auto">
            Three pieces: a revenue account, revenue-backed products (advances and lines), and attnUSD, the USD share token for LPs.
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mb-16">
            <div className="bg-dark-card border border-primary/20 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <div className="text-2xl font-bold text-primary">1</div>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4">Connect revenues & get a limit</h3>
              <p className="text-text-secondary mb-4 text-sm sm:text-base">
                Point your creator rewards or protocol fees to a revenue account and let attn estimate safe advance and credit line limits from your history.
              </p>
              <div className="bg-gray-800/30 rounded-lg p-3 text-xs sm:text-sm">
                Connect income → Get limits → No obligation until you borrow
              </div>
            </div>
            
            <div className="bg-dark-card border border-secondary/20 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 bg-secondary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <div className="text-2xl font-bold text-secondary">2</div>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4">Request cash against a slice of income</h3>
              <p className="text-text-secondary mb-4 text-sm sm:text-base">
                Ask for an amount. attn proposes a revenue share, horizon, and cap. You approve once and receive stablecoins instantly while the position is open.
              </p>
              <div className="bg-gray-800/30 rounded-lg p-3 text-xs sm:text-sm">
                Choose amount → See share & window → Accept for upfront cash
              </div>
            </div>
            
            <div className="bg-dark-card border border-accent/20 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 bg-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <div className="text-2xl font-bold text-accent">3</div>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4">Revenues auto-repay while active</h3>
              <p className="text-text-secondary mb-4 text-sm sm:text-base">
                While an advance or line is open, an agreed share of incoming revenues is routed to repayment first. When repaid, routing drops back to 0%.
              </p>
              <div className="bg-gray-800/30 rounded-lg p-3 text-xs sm:text-sm">
                Revenues in → Repayment first → You keep the rest
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section id="problem" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">The financing gap</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-12">
            <div className="bg-dark-card border border-red-500/20 rounded-xl p-6 sm:p-8">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-red-400 text-2xl">⚡</span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4 text-red-400">
                Onchain revenues exist, but don&apos;t behave like a financing asset
              </h3>
              <p className="text-text-secondary text-sm sm:text-base">
                For most apps, DAOs, and creators, income lands in generic wallets, gets mixed with treasury and speculation, and isn&apos;t wired into clear rules for who gets paid when or how it can back credit.
              </p>
            </div>
            <div className="bg-dark-card border border-red-500/20 rounded-xl p-6 sm:p-8">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-red-400 text-2xl">🏦</span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4 text-red-400">Banks don&apos;t understand onchain income</h3>
              <p className="text-text-secondary text-sm sm:text-base">
                Traditional finance expects payslips, invoices, and collateral it recognises. Irregular creator rewards, memecoin fees, and protocol income don&apos;t fit that template, so most teams default to token sales and one-off OTC deals.
              </p>
            </div>
          </div>
          <div className="text-center">
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-6 sm:p-8 inline-block max-w-lg">
              <h3 className="text-lg sm:text-xl font-semibold mb-4 text-primary">attn turns revenues into bankable collateral</h3>
              <p className="text-text-secondary text-sm sm:text-base">
                attn adds the missing product layer: a governed revenue account, standard revenue-backed advances and credit lines, and a pooled USD share token so LPs can underwrite those flows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section id="solution" className="py-20 px-4 sm:px-6 lg:px-8 bg-dark-card/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Our solution</h2>
          <p className="text-lg sm:text-xl text-text-secondary text-center mb-16 max-w-3xl mx-auto">
            A revenue account for your onchain business, revenue-backed financing rails on top, and attnUSD for LPs on the other side.
          </p>
          
          <div className="space-y-8 sm:space-y-12">
            {/* For Users */}
            <div className="bg-dark-card border border-primary/20 rounded-2xl p-6 sm:p-8">
              <h3 className="text-xl sm:text-2xl font-semibold mb-6 text-primary text-center">For apps, DAOs, and creators</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-primary">📝</span>
                  </div>
                  <h4 className="font-semibold mb-2">Set up a revenue account</h4>
                  <p className="text-text-secondary text-sm sm:text-base">
                    Point creator rewards or protocol fees into a jointly governed account. When no position is open, you can withdraw or redeploy at will.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-primary">💡</span>
                  </div>
                  <h4 className="font-semibold mb-2">Open advances or a line when needed</h4>
                  <p className="text-text-secondary text-sm sm:text-base">
                    Ask for an amount, see the proposed revenue share and horizon, and choose between one-off advances or a revolving credit line sized by your income.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-primary">🎯</span>
                  </div>
                  <h4 className="font-semibold mb-2">Repay from income, not token dumps</h4>
                  <p className="text-text-secondary text-sm sm:text-base">
                    While a position is active, an agreed share of revenues goes to repayment first. When it completes, routing drops to zero and all revenues flow back to you.
                  </p>
                </div>
              </div>
            </div>

            {/* For LPs */}
            <div className="bg-dark-card border border-secondary/20 rounded-2xl p-6 sm:p-8">
              <h3 className="text-xl sm:text-2xl font-semibold mb-6 text-secondary text-center">For liquidity providers</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-secondary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-secondary">🏆</span>
                  </div>
                  <h4 className="font-semibold mb-2">Priority pool access</h4>
                  <p className="text-text-secondary text-sm sm:text-base">
                    Deposit stablecoins into the priority pool and hold attnUSD, a USD-denominated share backed by revenue-backed advances, credit lines, and a stablecoin basket.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-secondary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-secondary">📊</span>
                  </div>
                  <h4 className="font-semibold mb-2">Revenue-backed yield</h4>
                  <p className="text-text-secondary text-sm sm:text-base">
                    Yield comes from interest and fees on revenue-backed positions and, in some cases, base yield on pledged assets – not only from emissions.
                  </p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-secondary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-secondary">🔄</span>
                  </div>
                  <h4 className="font-semibold mb-2">Composability over time</h4>
                  <p className="text-text-secondary text-sm sm:text-base">
                    As PT/YT rails open up, you can choose between diversified attnUSD exposure or specific revenue positions and structured strategies.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">Why this works</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12">
            {/* User Benefits */}
            <div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-6 text-primary">For apps, DAOs, and creators</h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-primary text-sm">🚫</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Non-dilutive, revenue-based financing</h4>
                    <p className="text-text-secondary text-sm sm:text-base">
                      You use income, not governance tokens, as the primary financing asset. Users keep their exposure; your community sees that revenues, not dumps, fund the roadmap.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-primary text-sm">👑</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Clear commitments, easy to explain</h4>
                    <p className="text-text-secondary text-sm sm:text-base">
                      You can point to a revenue account, a defined share, and a defined horizon. It is obvious how much of future income is spoken for and why.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-primary text-sm">🎛️</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Built-in discipline without extra overhead</h4>
                    <p className="text-text-secondary text-sm sm:text-base">
                      Routing and repayment are enforced onchain at the revenue account level, so you don&apos;t need manual spreadsheets or offchain tracking to keep promises.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* LP Benefits */}
            <div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-6 text-secondary">For liquidity providers</h3>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-secondary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-secondary text-sm">🎯</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Exposure to real cashflows</h4>
                    <p className="text-text-secondary text-sm sm:text-base">
                      attnUSD is backed by marked PT/YT positions and stablecoins. You see what drives yield and where credit risk sits, rather than guessing behind emissions.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-secondary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-secondary text-sm">🛡️</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Risk-aware portfolio construction</h4>
                    <p className="text-text-secondary text-sm sm:text-base">
                      Limits, diversification rules, and reserves are all applied at the portfolio level, so one underperforming project does not define the whole book.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-secondary/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-secondary text-sm">🔧</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Path to more granular strategies</h4>
                    <p className="text-text-secondary text-sm sm:text-base">
                      The same PT/YT rails that power attnUSD can be exposed for specific revenue bonds, structured products, and DeFi integrations once the system is mature.
                    </p>
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
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">Frequently asked questions</h2>
          
          {/* User FAQs */}
          <div className="mb-12">
            <h3 className="text-xl sm:text-2xl font-semibold mb-8 text-primary">For builders, DAOs, and creators</h3>
            <div className="space-y-4">
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('creator-1')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">Do I have to lock my revenues to join?</h4>
                  <svg
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${
                      openFAQs.has('creator-1') ? 'rotate-180' : ''
                    }`}
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
                      No. You can connect revenues, set up a revenue account, and see your limits without committing anything. A share of revenues only routes to repayment when you open an advance or draw on your line.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('creator-2')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">What happens if my revenues drop?</h4>
                  <svg
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${
                      openFAQs.has('creator-2') ? 'rotate-180' : ''
                    }`}
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
                      Repayments are based on a percentage of actual incoming revenues, so they naturally go down when your income does. Limits and pricing are refreshed regularly, and you can pause new advances once a period ends if you want to wait for income to stabilise.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('creator-3')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">How quickly can I access funds?</h4>
                  <svg
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${
                      openFAQs.has('creator-3') ? 'rotate-180' : ''
                    }`}
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
                      Once your revenue account is connected and a limit exists, opening an advance is a single transaction. Funding is immediate: you choose the amount, see terms, and receive stablecoins in the same flow.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('creator-5')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">Which platforms and revenue types can I use?</h4>
                  <svg
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${
                      openFAQs.has('creator-5') ? 'rotate-180' : ''
                    }`}
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
                      The demo focuses on Solana sources like Pump.fun creator rewards. The production system is designed for any revenue stream that can be routed onchain: protocol fee switches, DePIN income, AI agents, and similar flows.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LP FAQs */}
          <div>
            <h3 className="text-xl sm:text-2xl font-semibold mb-8 text-secondary">For liquidity providers</h3>
            <div className="space-y-4">
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('lp-1')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">What do I actually hold when I hold attnUSD?</h4>
                  <svg
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${
                      openFAQs.has('lp-1') ? 'rotate-180' : ''
                    }`}
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
                      attnUSD is a USD-denominated share of a vault that holds a basket of stablecoins plus PT/YT positions backed by project revenues. Your yield comes from interest and fees on those revenue-backed positions and any underlying base yield, net of losses and costs.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('lp-2')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">Is attnUSD a 1:1 stablecoin?</h4>
                  <svg
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${
                      openFAQs.has('lp-2') ? 'rotate-180' : ''
                    }`}
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
                      No. attnUSD tracks the net asset value of the underlying portfolio. It can move above or below 1 depending on how revenues, defaults, recoveries, and stablecoin risks play out. You are explicitly taking revenue-backed credit risk in exchange for yield.
                    </p>
                  </div>
                )}
              </div>
              
              <div className="bg-dark-card border border-gray-700 rounded-xl">
                <button
                  onClick={() => toggleFAQ('lp-3')}
                  className="w-full text-left p-4 sm:p-6 flex justify-between items-center hover:bg-gray-800/30 transition-colors"
                >
                  <h4 className="text-base sm:text-lg font-semibold pr-4">What are the main risk buckets?</h4>
                  <svg
                    className={`w-5 h-5 transform transition-transform flex-shrink-0 ${
                      openFAQs.has('lp-3') ? 'rotate-180' : ''
                    }`}
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
                      You take project credit risk (revenues underperform or disappear), stablecoin risk, concentration risk if the book is not sufficiently diversified, and standard Solana / program / operational risk. The design of attnUSD and the PT/YT layer is meant to make those risks transparent and manageable.
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
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">Ready to explore revenue-backed financing?</h2>
          <p className="text-lg sm:text-xl text-text-secondary mb-12 max-w-2xl mx-auto">
            Connect your address, see what your revenues can support, and decide later if and when you want to borrow or deploy capital.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://app.attn.markets"
              className="bg-primary text-dark px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg hover:bg-primary/90 transition-all glow-effect"
            >
              Get Revenue-Based Quote
            </a>
            <a
              href="https://app.attn.markets/leaderboard"
              className="bg-secondary text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg hover:bg-secondary/90 transition-all"
            >
              View User Leaderboard
            </a>
          </div>
          
          <div className="mt-8 text-xs sm:text-sm text-text-secondary">
            Connect revenues → See limits → Activate only when you need financing
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
              <a
                href="https://docs.attn.markets"
                target="_blank"
                rel="noreferrer"
                className="text-text-secondary hover:text-primary transition-colors text-sm sm:text-base"
              >
                Docs
              </a>
              <a
                href="https://t.me/twentyOne2x"
                target="_blank"
                rel="noreferrer"
                className="text-text-secondary hover:text-primary transition-colors text-sm sm:text-base"
              >
                Telegram
              </a>
              <a
                href="https://x.com/attndotmarkets"
                target="_blank"
                rel="noreferrer"
                className="text-text-secondary hover:text-primary transition-colors text-sm sm:text-base"
              >
                Twitter/X
              </a>
              <a
                href="https://github.com/twentyOne2x/attnmarket"
                target="_blank"
                rel="noreferrer"
                className="text-text-secondary hover:text-primary transition-colors text-sm sm:text-base"
              >
                GitHub
              </a>
            </div>
          </div>
          <div className="text-center text-text-secondary text-xs sm:text-sm mt-8">
            © 2025 attn.markets. Revenue-backed credit lines on Solana.
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
          overflow-x: hidden !important;
          overflow-y: hidden !important;
        }

        .word-wheel-inner {
          transition: transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1);
          will-change: transform;
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

        @media (max-width: 640px) {
          .word-wheel-container {
            width: 80px;
          }
        }
      `}</style>
    </main>
  );
}
