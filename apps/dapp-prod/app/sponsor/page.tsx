// apps/dapp/app/sponsor/page.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Navigation from '../components/Navigation';
import Tooltip from '../components/Tooltip';
import BorrowSlider from '../components/BorrowSlider';
import RepaySlider from '../components/RepaySlider';
import { useAppContext } from '../context/AppContext';
import { calculateBorrowingTerms } from '../utils/borrowingCalculations';
import { runtimeEnv } from '../config/runtime';
import CreatorTourOverlay from './components/CreatorTourOverlay';

const LIVE_TOUR_STORAGE_KEY = 'attn.liveSponsorTour';

const squadsFeatureEnabled = runtimeEnv.squadsEnabled;

const SquadsSafeOnboarding = squadsFeatureEnabled
  ? dynamic(() => import('./components/SquadsSafeOnboarding'), {
      ssr: false,
      loading: () => (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-6 text-sm text-neutral-400">
          Loading sponsor onboarding…
        </div>
      ),
    })
  : null;

interface LoanDetails {
  originalAmount: number;
  totalPaid: number;
  remainingBalance: number;
  daysRemaining: number;
  daysRemainingAfterEarlyPayment: number;
  dailyPayment: number;
  totalOwed: number;
  originalTotalInterest: number;
  interestRate: number;
  // New fields for proper early payment calculation
  earlyPaymentPrincipal?: number;
  earlyPaymentInterest?: number;
  earlyPaymentDiscount?: number;
  earlyPaymentTotal?: number;
}

interface Notification {
  id: string;
  type: 'processing' | 'success' | 'error';
  title: string;
  message: string;
  persistent?: boolean;
  processingStep?: string;
  duration?: number;
  position: number; // Fixed position in the stack
}

export default function SponsorPage(): React.JSX.Element {
  const {
    creators,
    loading,
    addCreatorLoan,
    removeCreatorLoan,
    addCreatorToList,
    updateCreatorEarnings,
    getAvailableLiquidity,
    currentUserWallet,
    setCurrentUserWallet,
    getSortedCreators,
    poolData,
    addLoanHistoryItem,
    getLoanHistoryForWallet,
    connectWallet,
    signAndListCreator,
    isWalletConnected,
    currentUserCreator,
    isUserPreviewed,
    isUserListed,
    isFullyConnected,
    isLive,
    governanceState,
    cluster,
  } = useAppContext();
  const router = useRouter();
  const searchParams = useSearchParams();

  const showSquadsOnboarding = squadsFeatureEnabled && SquadsSafeOnboarding !== null;
  const liveChecklistRef = useRef<HTMLDivElement | null>(null);
  const [showLiveTour, setShowLiveTour] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  
  // Initialize weekly earnings from context
  const [weeklyEarnings, setWeeklyEarnings] = useState<number>(() => currentUserCreator?.fees7d_usd || 10000);
  
  // Smart default borrow percentage - always try 50% first, then constrain by liquidity
  const [borrowPercentage, setBorrowPercentage] = useState<number>(() => {
    const initialEarnings = currentUserCreator?.fees7d_usd || 10000;
    const maxBorrowable = initialEarnings * 2; // 2 weeks
    const currentLiquidity = getAvailableLiquidity();
    
    // Always try 50% first
    const desiredAmount = maxBorrowable * 0.5; // 50%
    
    if (desiredAmount <= currentLiquidity) {
      console.log('Initial default: 50% - fits within liquidity');
      return 50; // 50% fits within liquidity
    } else {
      // 50% exceeds liquidity, so default to max possible percentage
      const maxPossiblePercentage = Math.floor((currentLiquidity / maxBorrowable) * 100);
      const result = Math.max(50, maxPossiblePercentage); // Ensure minimum of 50% to show meaningful data
      console.log('Initial default: constraining to max possible:', result, '%');
      return result;
    }
  });
  
  const [showRepaySection, setShowRepaySection] = useState<boolean>(false);
  const [earlyRepayAmount, setEarlyRepayAmount] = useState<number>(50);
  const [openFaqItems, setOpenFaqItems] = useState<{ [key: number]: boolean }>({});
  const [isUserEditing, setIsUserEditing] = useState<boolean>(false);
  
  // Processing states
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isBorrowing, setIsBorrowing] = useState<boolean>(false);
  const [isRepaying, setIsRepaying] = useState<boolean>(false);
  
  // Notification system
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationCounter, setNotificationCounter] = useState<number>(0); // Track creation order
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  
  // Loan simulation state for repayment demo
  const [simulatedLoan, setSimulatedLoan] = useState<{
    originalAmount: number;
    interestRate: number;
    totalOwed: number;
    originalTotalOwed: number;
    totalPaidFromEarlyRepayments: number;
    dailyRepayment: number;
    repaymentRate: number;
    daysElapsed: number;
  } | null>(null);

  // Use consistent sorting
  const sortedCreators = getSortedCreators();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    const startTourParam = searchParams?.get('startTour');
    if (!startTourParam) return;
    const normalized = startTourParam.toLowerCase();
    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
      return;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LIVE_TOUR_STORAGE_KEY);
    }
    setShowLiveTour(true);
    router.replace('/sponsor', { scroll: false });
  }, [hasMounted, router, searchParams]);

  // Don't auto-generate wallet - let user connect manually
  useEffect(() => {
    if (!currentUserWallet) {
      console.log('👤 No wallet connected - user needs to connect first');
    }
  }, [currentUserWallet, setCurrentUserWallet]);

  // Get user's loan history from context
  const userLoanHistory = getLoanHistoryForWallet(currentUserWallet || '');
  const creatorMetrics = currentUserCreator?.metrics;
  const hasCreatorVault = currentUserCreator?.hasCreatorVault ?? false;
  const userNeedsListing = isWalletConnected && !isUserListed;
  const showLoanInterface = !isLive || (isLive && hasCreatorVault);
  const squadsAdminAddress = currentUserCreator?.admin;

  useEffect(() => {
    if (!hasMounted) return;
    if (!isLive || hasCreatorVault) {
      setShowLiveTour(false);
      return;
    }
    if (typeof window === 'undefined') return;
    const seen = window.localStorage.getItem(LIVE_TOUR_STORAGE_KEY);
    if (!seen) {
      setShowLiveTour(true);
    }
  }, [hasMounted, isLive, hasCreatorVault]);

  const handleDismissLiveTour = useCallback(() => {
    setShowLiveTour(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LIVE_TOUR_STORAGE_KEY, 'seen');
    }
  }, []);

  const handleFocusLiveTour = useCallback(() => {
    if (liveChecklistRef.current) {
      liveChecklistRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // Notification management functions - UPDATED with fixed positioning
  const addNotification = (notification: Omit<Notification, 'id' | 'position'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newNotification = { 
      ...notification, 
      id,
      position: notificationCounter // Assign fixed position based on creation order
    };
    
    setNotifications(prev => [...prev, newNotification]); // Add to end of array
    setNotificationCounter(prev => prev + 1); // Increment counter for next notification
    
    // Auto-remove notifications based on duration or type
    if (!notification.persistent || notification.duration) {
      const duration = notification.duration || (notification.type === 'processing' ? 1000 : 4000);
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
    
    return id;
  };

  const removeNotification = (id: string) => {
    // Just remove directly without animation - positions stay fixed
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const updateNotification = (id: string, updates: Partial<Notification>) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  // Debug: Add immediate state monitoring
  useEffect(() => {
    console.log('🔄 CREATORS ARRAY CHANGED:', {
      timestamp: new Date().toISOString(),
      totalCreators: creators.length,
      currentWallet: currentUserWallet,
      creatorWallets: creators.map(c => ({
        wallet: c.wallet.slice(0,8) + '...',
        status: c.status,
        hasLoan: !!c.activeLoan,
        isCurrentUser: c.wallet === currentUserWallet
      }))
    });
  }, [creators]);

  // Force reload state when component mounts to ensure we have latest data
  useEffect(() => {
    console.log('📱 CREATOR PAGE MOUNTED - Current state check');
    console.log('localStorage creators:', JSON.parse(localStorage.getItem('attn-market-app-state') || '{}').creators?.length || 0);
    console.log('Context creators:', creators.length);
    
    // If there's a mismatch, something went wrong with state sync
    const savedState = JSON.parse(localStorage.getItem('attn-market-app-state') || '{}');
    if (savedState.creators && savedState.creators.length !== creators.length) {
      console.warn('⚠️ STATE MISMATCH DETECTED');
      console.log('localStorage has:', savedState.creators.length, 'creators');
      console.log('Context has:', creators.length, 'creators');
    }
  }, []);

  // Derived state - A user is "listed" if they exist in creators array OR have an active loan
  const currentCreator = currentUserCreator;
  const isListed = isUserListed;
  const isPreviewOnly = isUserPreviewed && !isUserListed;
  const hasActiveLoan = !!(currentCreator?.activeLoan);
  const borrowingTerms = calculateBorrowingTerms(weeklyEarnings, borrowPercentage);
  const availableLiquidity = getAvailableLiquidity();
  const canBorrow = borrowingTerms.borrowAmount <= availableLiquidity;

  useEffect(() => {
    console.log('👤 CURRENT USER STATE:', {
      wallet: currentUserWallet,
      foundInArray: !!currentCreator,
      isListed: isListed,
      hasActiveLoan: hasActiveLoan,
      creatorData: currentCreator
    });
  }, [currentUserWallet, currentCreator, isListed, hasActiveLoan]);

  // Debug: Log loan history when it changes
  useEffect(() => {
    console.log('Creator page - loan history updated:', {
      wallet: currentUserWallet,
      historyCount: userLoanHistory.length,
      items: userLoanHistory.map(h => `${h.type}: $${h.amount}`)
    });
  }, [userLoanHistory, currentUserWallet]);

  // Force re-render when liquidity changes
  useEffect(() => {
    // This will trigger a re-render when the context updates
  }, [creators, poolData]);

  // Sync with existing creator data - ENSURE LOAN STATE IS CONSISTENT
  useEffect(() => {
    if (!currentUserWallet) return;
    
    const existingCreator = currentUserCreator;
    if (existingCreator) {
      console.log('🔄 SYNCING CREATOR DATA');
      console.log('Creator found:', {
        wallet: existingCreator.wallet.slice(0,8),
        earnings: existingCreator.fees7d_usd,
        hasActiveLoan: !!existingCreator.activeLoan,
        activeLoan: existingCreator.activeLoan
      });
      console.log('Current simulated loan:', simulatedLoan);
      
      // Handle loan simulation sync - IMPROVED LOGIC
      if (existingCreator.activeLoan && !simulatedLoan) {
        console.log('Creating simulated loan from active loan');
        const loan = existingCreator.activeLoan;
        const newSimulatedLoan = {
          originalAmount: loan.amount,
          interestRate: loan.interestRate,
          totalOwed: loan.amount * (1 + loan.interestRate / 100 * loan.daysRemaining / 365),
          originalTotalOwed: loan.amount * (1 + loan.interestRate / 100 * loan.daysRemaining / 365),
          totalPaidFromEarlyRepayments: 0,
          dailyRepayment: existingCreator.fees7d_usd / 7 * (loan.dailyRepaymentRate / 100),
          repaymentRate: loan.dailyRepaymentRate,
          daysElapsed: 0
        };
        console.log('Setting simulated loan:', newSimulatedLoan);
        setSimulatedLoan(newSimulatedLoan);
      } else if (!existingCreator.activeLoan && simulatedLoan) {
        console.log('Clearing simulated loan - no active loan in context');
        setSimulatedLoan(null);
      } else if (existingCreator.activeLoan && simulatedLoan) {
        console.log('Both active loan and simulated loan exist - keeping simulated');
      } else {
        console.log('No active loan and no simulated loan');
      }
    } else {
      console.warn('User wallet not found in creators array:', currentUserWallet);
    }
  }, [currentUserWallet, currentUserCreator, simulatedLoan]); // Re-run when creators change

  // Load earnings on component mount from context
  useEffect(() => {
    if (!currentUserWallet) return;
    
    const existingCreator = currentUserCreator;
    if (existingCreator && weeklyEarnings === 10000) {
      // Only set earnings if we're still at default value
      console.log('Loading earnings from context on mount:', existingCreator.fees7d_usd);
      setWeeklyEarnings(existingCreator.fees7d_usd);
    }
  }, [currentUserWallet, currentUserCreator]); // Load once when wallet/creators are available

  // Update borrow percentage when earnings change - only when earnings actually change, not continuously
  useEffect(() => {
    if (!isUserEditing && weeklyEarnings > 0) {
      const maxBorrowable = weeklyEarnings * 2;
      const currentLiquidity = availableLiquidity;
      
      // Only adjust if the current selection would exceed liquidity
      const currentBorrowAmount = maxBorrowable * (borrowPercentage / 100);
      
      if (currentBorrowAmount > currentLiquidity) {
        // 50% exceeds liquidity, calculate max possible percentage
        const maxPossiblePercentage = Math.floor((currentLiquidity / maxBorrowable) * 100);
        const newPercentage = Math.max(25, maxPossiblePercentage); // Ensure minimum meaningful percentage
        
        console.log('Constraining selection due to liquidity limit:', {
          currentBorrowAmount,
          currentLiquidity,
          oldPercentage: borrowPercentage,
          newPercentage
        });
        setBorrowPercentage(newPercentage);
      }
      // If current selection is valid, don't change it
    }
  }, [weeklyEarnings]); // Only depend on weeklyEarnings, not availableLiquidity or borrowPercentage

  // Update sponsor revenues when weekly earnings change - SIMPLIFIED AND DEBOUNCED
  useEffect(() => {
    if (!currentUserWallet || isUserEditing) return;
    
    const existingCreator = currentUserCreator;
    if (existingCreator && Math.abs(existingCreator.fees7d_usd - weeklyEarnings) > 0.01) {
      console.log('Updating sponsor revenues in context:', weeklyEarnings);
      
      // Debounce the update to prevent rapid updates
      const timeoutId = setTimeout(() => {
        updateCreatorEarnings(currentUserWallet, weeklyEarnings);
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [weeklyEarnings, currentUserWallet, currentUserCreator, isUserEditing]);

  // Helper function for currency formatting
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('en-US');
  };

  const handleEarningsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Set editing flag to prevent context sync during user input
    setIsUserEditing(true);
    
    // Remove all non-digits (except decimal points)
    const value = e.target.value.replace(/[^\d.]/g, '');
    const numericValue = parseFloat(value) || 0;
    setWeeklyEarnings(numericValue);
    
    // Clear editing flag after a longer delay to prevent interference
    setTimeout(() => setIsUserEditing(false), 2000);
  };

  // Helper function to snap slider values
  const snapToAnchor = (value: number, anchors: number[] = [0, 25, 50, 75, 100]) => {
    const snapThreshold = 3;
    for (const anchor of anchors) {
      if (Math.abs(value - anchor) <= snapThreshold) {
        return anchor;
      }
    }
    return value;
  };

  const handleConnectWallet = async () => {
    setIsConnecting(true);
    setIsTransitioning(true);
    
    // Reset borrow percentage to 0 first to ensure clean state
    setBorrowPercentage(0);
    
    try {
      // Step 1: Connect wallet
      addNotification({
        type: 'processing',
        title: 'Connecting Wallet',
        message: 'Waiting for wallet approval...',
        duration: 1000
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const deterministicWallet = '0x1234567890abcdef1234567890abcdef12345678';
      setCurrentUserWallet(deterministicWallet);
      
      // Step 2: Automatically list the creator
      addNotification({
        type: 'processing',
        title: 'Setting Up Account',
        message: 'Adding to sponsor leaderboard...',
        duration: 800
      });
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const newCreator = {
        wallet: deterministicWallet,
        fees7d_usd: weeklyEarnings,
        beta_pct: 0.15,
        alpha_pct: 0.70,
        gamma_pct: 0.15,
        status: 'listed',
        est_beta_next30d_usd: weeklyEarnings * 4.3
      };
      
      addCreatorToList(newCreator);
      
      // Small delay before setting borrow percentage
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Set default borrow percentage to 50% to show the loan terms
      const maxBorrowable = weeklyEarnings * 2;
      const currentLiquidity = getAvailableLiquidity();
      const desiredAmount = maxBorrowable * 0.5;
      
      if (desiredAmount <= currentLiquidity) {
        setBorrowPercentage(50);
      } else {
        const maxPossiblePercentage = Math.floor((currentLiquidity / maxBorrowable) * 100);
        setBorrowPercentage(Math.max(25, maxPossiblePercentage));
      }
      
      // Wait for the container expansion animation
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // End transition state - this will allow button to change
      setIsTransitioning(false);
      
      addNotification({
        type: 'success',
        title: 'Connected Successfully!',
        message: 'Your wallet is connected and you can now borrow up to 2 weeks of earnings.',
        duration: 3000
      });
      
    } catch (error) {
      console.error('Error connecting wallet:', error);
      addNotification({
        type: 'error',
        title: 'Connection Failed',
        message: 'Failed to connect wallet. Please try again.'
      });
      setIsTransitioning(false);
    } finally {
      setIsConnecting(false);
    }
  };

  // Take out a loan with loading notifications
  const handleBorrow = async () => {
    setIsBorrowing(true);
    
    try {
      // Step 1: Validating request
      const step1Id = addNotification({
        type: 'processing',
        title: 'Processing Advance',
        message: 'Validating advance request...',
        persistent: true,
        duration: 800
      });
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Step 2: Checking liquidity
      const step2Id = addNotification({
        type: 'processing',
        title: 'Processing Advance',
        message: 'Checking pool liquidity...',
        persistent: true,
        duration: 600
      });
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Step 3: Confirming terms
      const step3Id = addNotification({
        type: 'processing',
        title: 'Processing Advance',
        message: 'Confirming loan terms...',
        persistent: true,
        duration: 700
      });
      await new Promise(resolve => setTimeout(resolve, 700));
      
      // Step 4: Processing transaction
      const step4Id = addNotification({
        type: 'processing',
        title: 'Processing Advance',
        message: 'Processing advance transaction...',
        persistent: true,
        duration: 900
      });
      await new Promise(resolve => setTimeout(resolve, 900));
      
      console.log('Starting borrow process for wallet:', currentUserWallet);
      
      // CRITICAL: Ensure creator is listed BEFORE taking loan
      const existingCreator = currentUserCreator;
      if (!existingCreator) {
        console.log('Creator not found in array, adding them first before loan');
        const newCreator = {
          wallet: currentUserWallet,
          fees7d_usd: weeklyEarnings,
          beta_pct: 0.15,
          alpha_pct: 0.70,
          gamma_pct: 0.15,
          status: 'listed',
          est_beta_next30d_usd: weeklyEarnings * 4.3
        };
        addCreatorToList(newCreator);

        // Wait a moment for state to update
        await new Promise(resolve => setTimeout(resolve, 100));
      } else if (existingCreator.status === 'pending_squads') {
        addCreatorToList({ ...existingCreator, status: 'listed' });
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const loanData = {
        amount: borrowingTerms.borrowAmount,
        maxBorrowable: borrowingTerms.maxBorrowable,
        utilizationPct: borrowPercentage,
        dailyRepaymentRate: borrowingTerms.repaymentRate,
        interestRate: borrowingTerms.interestRate,
        daysRemaining: borrowingTerms.daysToRepay
      };
      
      console.log('Adding loan to creator:', currentUserWallet, loanData);
      const result = addCreatorLoan(currentUserWallet, loanData);
      if (!result.success) {
        throw new Error(result.message || 'Failed to process loan');
      }
      
      // Set up simulation for repayment demo
      setSimulatedLoan({
        originalAmount: borrowingTerms.borrowAmount,
        interestRate: borrowingTerms.interestRate,
        totalOwed: borrowingTerms.totalOwed,
        originalTotalOwed: borrowingTerms.totalOwed,
        totalPaidFromEarlyRepayments: 0,
        dailyRepayment: borrowingTerms.dailyRepayment,
        repaymentRate: borrowingTerms.repaymentRate,
        daysElapsed: 0
      });

      console.log('Loan process completed successfully');
      
      // Add success notification
      addNotification({
        type: 'success',
        title: 'Advance Received!',
        message: `${borrowingTerms.borrowAmount.toLocaleString()} USDC borrowed at ${borrowingTerms.interestRate.toFixed(0)}% APR. Repaying ${borrowingTerms.repaymentRate}% of daily earnings.`
      });
      
    } catch (error) {
      console.error('Error in borrow process:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to process loan'
      });
    } finally {
      setIsBorrowing(false);
    }
  };

  // Fixed repay loan function with loading notifications
  const handleRepay = async () => {
    setIsRepaying(true);
    
    try {
      // Step 1: Calculating payment
      const step1Id = addNotification({
        type: 'processing',
        title: 'Processing Repayment',
        message: 'Calculating repayment amount...',
        persistent: true,
        duration: 700
      });
      await new Promise(resolve => setTimeout(resolve, 700));
      
      // Step 2: Processing payment
      const step2Id = addNotification({
        type: 'processing',
        title: 'Processing Repayment',
        message: 'Processing payment transaction...',
        persistent: true,
        duration: 800
      });
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Step 3: Updating loan status
      const step3Id = addNotification({
        type: 'processing',
        title: 'Processing Repayment',
        message: 'Updating loan status...',
        persistent: true,
        duration: 500
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const loanDetails = calculateLoanDetails();
      const isFullPayoff = earlyRepayAmount === 100;
      
      if (isFullPayoff) {
        removeCreatorLoan(currentUserWallet);
        setSimulatedLoan(null);
        setShowRepaySection(false);

        // Add to loan history via context - NO DISCOUNT FIELD
        addLoanHistoryItem({
          type: 'full_payoff',
          amount: loanDetails.earlyPaymentTotal || 0,
          status: 'completed',
          creatorWallet: currentUserWallet
        });
      } else if (simulatedLoan && earlyRepayAmount > 0) {
        // Use the corrected early payment amount (discount only on interest)
        const repaymentAmount = loanDetails.earlyPaymentTotal || 0;
        const newTotalOwed = simulatedLoan.totalOwed - repaymentAmount;
        
        // KEEP all the original tracking data, just update the amounts
        setSimulatedLoan({
          ...simulatedLoan,
          totalOwed: newTotalOwed,
          totalPaidFromEarlyRepayments: simulatedLoan.totalPaidFromEarlyRepayments + repaymentAmount
        });
        
        // Update the actual loan in context with remaining amount, but keep it proportional
        const remainingDays = Math.max(1, Math.ceil(newTotalOwed / simulatedLoan.dailyRepayment));
        const updatedLoanData = {
          amount: newTotalOwed, // Remaining amount for pool liquidity calculation
          maxBorrowable: simulatedLoan.originalAmount * 2, // Keep original max
          utilizationPct: borrowPercentage,
          dailyRepaymentRate: simulatedLoan.repaymentRate, // Keep original rate
          interestRate: simulatedLoan.interestRate, // Keep original rate
          daysRemaining: remainingDays
        };
        addCreatorLoan(currentUserWallet, updatedLoanData);

        // Add to loan history via context - NO DISCOUNT FIELD
        addLoanHistoryItem({
          type: 'early_payment',
          amount: repaymentAmount,
          status: 'completed',
          creatorWallet: currentUserWallet
        });
      }
      
      // Add success notification
      addNotification({
        type: 'success',
        title: earlyRepayAmount === 100 ? 'Loan Paid Off Successfully!' : 'Payment Processed!',
        message: earlyRepayAmount === 100 
          ? 'You can now open new advances.'
          : `${(loanDetails.earlyPaymentTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC payment processed.`
      });
      
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to process repayment'
      });
    } finally {
      setIsRepaying(false);
    }
  };

  // Fixed calculate loan details function with better debugging
  const calculateLoanDetails = (): LoanDetails => {
    console.log('🔍 CALCULATING LOAN DETAILS');
    console.log('Current creator:', currentCreator);
    console.log('Simulated loan:', simulatedLoan);
    
    // Check both actual loan and simulated loan
    const actualLoan = currentCreator?.activeLoan;
    const loanToUse = simulatedLoan || (actualLoan ? {
      originalAmount: actualLoan.amount,
      interestRate: actualLoan.interestRate,
      totalOwed: actualLoan.amount * 1.05,
      originalTotalOwed: actualLoan.amount * 1.05,
      totalPaidFromEarlyRepayments: 0,
      dailyRepayment: weeklyEarnings / 7 * (actualLoan.dailyRepaymentRate / 100),
      repaymentRate: actualLoan.dailyRepaymentRate,
      daysElapsed: 0
    } : null);

    console.log('Loan to use for calculations:', loanToUse);

    if (!loanToUse) {
      console.log('No loan found for calculations');
      return {
        originalAmount: 0,
        totalPaid: 0,
        remainingBalance: 0,
        daysRemaining: 0,
        daysRemainingAfterEarlyPayment: 0,
        dailyPayment: 0,
        totalOwed: 0,
        originalTotalInterest: 0,
        interestRate: 0
      };
    }

    const { originalAmount, totalOwed, originalTotalOwed, totalPaidFromEarlyRepayments, dailyRepayment, daysElapsed, interestRate } = loanToUse;
    
    const originalTotalInterest = originalTotalOwed - originalAmount;
    const totalPaidFromDailyPayments = daysElapsed * dailyRepayment;
    const totalPaid = totalPaidFromDailyPayments + totalPaidFromEarlyRepayments;
    
    const remainingBalance = Math.max(0, totalOwed - totalPaidFromDailyPayments);
    const daysRemaining = Math.max(0, Math.ceil(remainingBalance / dailyRepayment));
    
    console.log('Loan calculation results:', {
      originalAmount,
      totalOwed,
      remainingBalance,
      daysRemaining,
      dailyRepayment
    });
    
    // FIXED: Calculate early payment with proper interest tracking
    if (earlyRepayAmount > 0) {
      const repaymentPortion = earlyRepayAmount / 100;
      const totalRepaymentAmount = remainingBalance * repaymentPortion;
      
      // Key insight: Track how much interest has been paid vs remains
      const totalInterestInLoan = originalTotalInterest;
      const dailyInterestRate = totalInterestInLoan / (originalTotalOwed / dailyRepayment); // interest per day
      const interestPaidFromDailyPayments = daysElapsed * dailyInterestRate;
      const remainingInterestFromOriginalLoan = Math.max(0, totalInterestInLoan - interestPaidFromDailyPayments);
      
      // The remaining balance contains: remaining principal + remaining interest
      const actualRemainingPrincipal = originalAmount - Math.max(0, totalPaidFromDailyPayments - interestPaidFromDailyPayments);
      const actualRemainingInterest = remainingInterestFromOriginalLoan;
      
      // Split the repayment proportionally
      const totalRemaining = actualRemainingPrincipal + actualRemainingInterest;
      if (totalRemaining > 0) {
        const interestRatio = actualRemainingInterest / totalRemaining;
        const interestToRepay = totalRepaymentAmount * interestRatio;
        const principalToRepay = totalRepaymentAmount - interestToRepay;
        
        // 5% discount applies ONLY to the interest portion
        const discountAmount = interestToRepay * 0.05;
        const discountedInterest = interestToRepay * 0.95;
        const totalEarlyPayment = principalToRepay + discountedInterest;
        
        const balanceAfterEarlyPayment = Math.max(0, remainingBalance - totalEarlyPayment);
        const daysRemainingAfterEarlyPayment = Math.max(0, Math.ceil(balanceAfterEarlyPayment / dailyRepayment));
        
        return {
          originalAmount,
          totalPaid,
          remainingBalance,
          daysRemaining,
          daysRemainingAfterEarlyPayment,
          dailyPayment: dailyRepayment,
          totalOwed,
          originalTotalInterest,
          interestRate,
          // Additional fields for early payment breakdown
          earlyPaymentPrincipal: principalToRepay,
          earlyPaymentInterest: interestToRepay,
          earlyPaymentDiscount: discountAmount,
          earlyPaymentTotal: totalEarlyPayment
        };
      }
    }
    
    return {
      originalAmount,
      totalPaid,
      remainingBalance,
      daysRemaining,
      daysRemainingAfterEarlyPayment: daysRemaining,
      dailyPayment: dailyRepayment,
      totalOwed,
      originalTotalInterest,
      interestRate
    };
  };

  const toggleFaqItem = (index: number) => {
    setOpenFaqItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const loanDetails = calculateLoanDetails();

  // Get leaderboard preview - show top 2 + current user if listed
  const getLeaderboardPreview = () => {
    const topTwo = sortedCreators.slice(0, 2);
    if (currentUserCreator && !topTwo.some(c => c.wallet === currentUserWallet)) {
      // Add current user if they're not in top 2
      return [...topTwo, currentUserCreator];
    }
    
    // If user is in top 2 or not listed, just show top 3
    return sortedCreators.slice(0, 3);
  };

  const previewCreators = getLeaderboardPreview();

  const faqItems = [
    {
      q: "How much can I borrow?",
      a: "Up to 2 weeks of your proven weekly earnings. If you earn $10k/week, you can borrow up to $20k."
    },
    {
      q: "How does the interest rate work?",
      a: "Interest rates are 50-90% APR (annualized). For short-term loans of 1-3 weeks, this translates to roughly 1-5% total interest depending on loan size and duration."
    },
    {
      q: "How do I repay the loan?",
      a: "Repayments are automatic and daily. Smaller loans (≤50%) = 50% of daily earnings. Medium loans (51-75%) = 75% of earnings. Large loans (76-100%) = 100% of earnings."
    },
    {
      q: "How long until I'm paid off?",
      a: "Typically 5-20 days depending on loan size. Larger loans get paid off faster due to higher repayment rates."
    },
    {
      q: "What if my earnings drop?",
      a: "Repayments are percentage-based, so they adjust automatically with your actual earnings. Your loan just takes longer to repay."
    },
    {
      q: "Can I pay off early?",
      a: "Yes! You get a 5% discount on the interest portion of any early repayment, whether partial or full payoff."
    }
  ];

  const formatLoanHistoryType = (type: string) => {
    switch (type) {
      case 'loan': return 'Advance Taken';
      case 'repayment': return 'Auto Repayment';
      case 'early_payment': return 'Early Payment';
      case 'full_payoff': return 'Full Payoff';
      default: return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-success';
      case 'active': return 'text-primary';
      case 'defaulted': return 'text-red-400';
      default: return 'text-text-secondary';
    }
  };

  const getTypeIcon = (type: string) => {
    // Removed icons for more professional appearance
    return '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark text-text-primary flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-lg mx-auto mb-4"></div>
          <p>Loading sponsor interface (Builders, DAOs, Creators)...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark text-text-primary">
      {showLiveTour && isLive && !hasCreatorVault && (
        <CreatorTourOverlay
          targetRef={liveChecklistRef}
          visible={showLiveTour}
          onClose={handleDismissLiveTour}
          onFocusTarget={handleFocusLiveTour}
        />
      )}
      {/* Fixed Notification Stack Container - UPDATED with proper spacing */}
      <div className="fixed top-20 right-8 z-[9999] w-80">
        {notifications
          .sort((a, b) => a.position - b.position) // Sort by creation order
          .map((notification, visualIndex) => {
          // Use visual index for compact stacking, but keep original position for z-index
          const topPosition = visualIndex * 110; // Increased to 110px spacing to prevent overlap
          
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
                top: `${topPosition}px`, // Position based on current visual order
                zIndex: 9999 - notification.position, // Z-index based on creation order (newer on top)
                opacity: Math.max(0.85, 1 - (visualIndex * 0.08)), // Slight fade for depth
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

      {isLive && isPreviewOnly && (
        <div className="mx-auto mt-6 max-w-3xl px-4">
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-5 py-4 text-left text-warning">
            <div className="text-sm font-semibold uppercase tracking-wide text-warning/80">Leaderboard preview active</div>
            <p className="mt-1 text-sm text-warning/90">
              You&apos;re already queued on the Live leaderboard. Finish the Squads 2-of-2 safe below to unlock borrowing and auto-sweeps.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold" title="Sponsors include builders, DAOs, and creators with recurring on-chain revenue.">
              Sponsor Console (Builders, DAOs, Creators)
            </h1>
            {currentUserWallet && (
              <div className="text-sm text-text-secondary mt-1">
                Wallet: <span className="font-mono">{currentUserWallet?.slice(0, 8)}...{currentUserWallet?.slice(-4)}</span>
              </div>
            )}
          </div>
          <a href="/" className="text-text-secondary hover:text-primary transition-colors">
            ← Back to Dashboard
          </a>
        </div>
        {isLive && !hasCreatorVault && (
          <div ref={liveChecklistRef} className="mb-8 space-y-4">
            <div className="bg-dark-card border border-secondary/30 rounded-xl p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-secondary">Live mode checklist</h2>
                  <p className="text-sm text-text-secondary">
                    You&apos;re connected to devnet. Complete the steps below to enable auto-sweeps and financing.
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
                    Use the wallet adapter to authorize sponsor actions in Live mode.
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
                    <span>2. Create Squads safe</span>
                    <span className={`text-xs ${hasCreatorVault ? 'text-green-300' : 'text-text-secondary'}`}>
                      {hasCreatorVault ? 'Linked' : 'Pending'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    Set up a 2-of-2 sponsor safe so auto-sweeps and locks are co-signed.
                  </p>
                  {hasCreatorVault && squadsAdminAddress && (
                    <div className="mt-3 rounded-md bg-black/40 px-3 py-2 text-[11px] font-mono text-text-secondary">
                      {squadsAdminAddress.slice(0, 8)}…{squadsAdminAddress.slice(-6)}
                    </div>
                  )}
                  {!hasCreatorVault && (
                    <a
                      href="#squads-setup"
                      className="mt-3 inline-flex items-center justify-center rounded-lg border border-secondary/50 px-3 py-1.5 text-sm font-medium text-secondary hover:border-secondary"
                    >
                      Open Squads setup
                    </a>
                  )}
                </div>

                <div className={`rounded-lg border ${(isFullyConnected && hasCreatorVault) ? 'border-green-400/40 bg-green-500/10' : 'border-gray-700 bg-gray-900/60'} p-4`}>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>3. List + unlock financing</span>
                    <span className={`text-xs ${(isFullyConnected && hasCreatorVault) ? 'text-green-300' : isPreviewOnly ? 'text-warning' : 'text-text-secondary'}`}>
                      {(isFullyConnected && hasCreatorVault) ? 'Ready' : isPreviewOnly ? 'Preview saved' : 'Pending'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    {isPreviewOnly
                      ? 'Preview created, sign once your Squads safe is live to activate borrowing.'
                      : 'Sign the attn sponsor agreement to appear on the leaderboard and enable loan quotes.'}
                  </p>
                  {creatorMetrics ? (
                    <div className="mt-3 space-y-1 rounded-md border border-secondary/20 bg-black/30 px-3 py-2 text-[11px] text-text-secondary">
                      <div className="flex justify-between">
                        <span>Total fees (est.)</span>
                        <span className="font-mono">${creatorMetrics.totalFeesUsd.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg. daily (14d)</span>
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
                      Connect your wallet to compute devnet fee stats.
                    </div>
                  )}
                  {(!isFullyConnected || !hasCreatorVault) && (
                    <button
                      onClick={signAndListCreator}
                      className="mt-3 inline-flex items-center justify-center rounded-lg bg-secondary/30 px-3 py-1.5 text-sm font-medium text-secondary hover:bg-secondary/20 disabled:opacity-50"
                      disabled={!isWalletConnected || (isFullyConnected && hasCreatorVault)}
                    >
                      Sign &amp; list sponsor
                    </button>
                  )}
                </div>
              </div>
            </div>

            {!hasCreatorVault && squadsFeatureEnabled && SquadsSafeOnboarding && (
              <div id="squads-setup" className="scroll-mt-24">
                <SquadsSafeOnboarding />
              </div>
            )}
          </div>
        )}

        {showLoanInterface ? (
          <>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Main Actions */}
              <div className="space-y-6">
                <div className="bg-dark-card border border-primary/20 rounded-xl p-6">
              {/* COMPACT HEADER with Pool Liquidity */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold">Sponsor Console</h2>
                </div>
                <div className="text-right">
                  <div className="text-sm text-blue-400 font-medium">Pool Liquidity</div>
                  <div className="text-lg font-bold text-blue-400">${(availableLiquidity / 1000).toFixed(0)}K</div>
                </div>
              </div>

              <div className="space-y-6">
                {/* COMPACT EARNINGS INPUT - Two columns when listed */}
                {isListed ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Weekly Earnings (USDC)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary font-mono">$</span>
                        <input
                          type="text"
                          value={formatCurrency(weeklyEarnings)}
                          onChange={handleEarningsChange}
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-7 pr-3 py-2 text-base font-mono focus:border-primary focus:outline-none"
                          placeholder="10,000"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Available to Borrow
                      </label>
                      <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-base font-mono text-primary">
                        ${borrowingTerms.maxBorrowable.toLocaleString()}
                      </div>
                      <div className="text-xs text-text-secondary mt-1">
                        Borrow up to 2 weeks of your proven earnings
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Your Weekly Earnings (USDC)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-text-secondary font-mono">$</span>
                      <input
                        type="text"
                        value={formatCurrency(weeklyEarnings)}
                        onChange={handleEarningsChange}
                        disabled={!currentUserWallet}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-8 pr-4 py-3 text-lg font-mono focus:border-primary focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="10,000"
                      />
                    </div>
                    <div className="text-xs text-text-secondary mt-1">
                      {!currentUserWallet
                        ? 'Connect wallet first to adjust earnings'
                        : isPreviewOnly
                        ? 'Leaderboard preview saved, finish Squads to unlock borrowing'
                        : 'List yourself first to start borrowing'}
                    </div>
                  </div>
                )}

                {/* Main Interface */}
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  {/* Toggle between Borrow and Repay */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-4">
                      <h3 className="text-primary font-semibold">
                        {showRepaySection ? 'Loan Management' : 'Available to Borrow'}
                      </h3>
                      {isListed && (
                        <div className="flex bg-gray-700 rounded-lg p-1">
                          <button
                            onClick={() => setShowRepaySection(false)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                              !showRepaySection 
                                ? 'bg-primary text-white' 
                                : 'text-text-secondary hover:text-white'
                            }`}
                          >
                            Borrow
                          </button>
                          <button
                            onClick={() => setShowRepaySection(true)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                              showRepaySection 
                                ? 'bg-primary text-white' 
                                : 'text-text-secondary hover:text-white'
                            }`}
                          >
                            Repay {!hasActiveLoan && !simulatedLoan && '(Demo)'}
                          </button>
                        </div>
                      )}
                    </div>
                    <Tooltip content={showRepaySection ? "Manage your existing loan and early repayment options." : "Borrow up to 2 weeks of earnings. Higher amounts = higher rates but faster repayment."}>
                      <span className="text-xs text-primary cursor-help">ⓘ</span>
                    </Tooltip>
                  </div>

                  {!showRepaySection ? (
                    // Borrow Section
                    <>
                      {/* Borrow Amount Slider */}
                      <div className="mb-16">
                        <BorrowSlider
                          value={borrowPercentage}
                          onChange={setBorrowPercentage}
                          disabled={!isListed || hasActiveLoan}
                          maxBorrowable={borrowingTerms.maxBorrowable}
                          availableLiquidity={availableLiquidity}
                          snapToAnchor={snapToAnchor}
                        />
                      </div>
                      
                      {/* Interest Rate and Repayment Rate */}
                      {borrowPercentage > 0 && isListed && (
                        <div className={`p-3 bg-gray-700/30 rounded-lg text-sm`}>
                          <div className="flex justify-between items-center mb-2">
                            <span>Interest Rate:</span>
                            <span className={`font-semibold text-xl ${
                              borrowingTerms.interestRate <= 60 ? 'text-success' : 
                              borrowingTerms.interestRate <= 75 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {borrowingTerms.interestRate.toFixed(0)}% APR
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Daily repayment rate:</span>
                            <span className={`font-semibold text-base ${
                              borrowingTerms.repaymentRate === 50 ? 'text-success' : 
                              borrowingTerms.repaymentRate === 75 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {borrowingTerms.repaymentRate}% of earnings
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Loan Terms */}
                      {borrowPercentage > 0 && isListed && (
                        <div className={`mt-4 p-3 bg-gray-800/30 rounded-lg text-sm space-y-2`}>
                          <div className="flex justify-between">
                            <span>Daily Repayment:</span>
                            <span className="font-medium">${borrowingTerms.dailyRepayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-primary">
                            <span>Estimated payoff time:</span>
                            <span className="font-medium">{borrowingTerms.daysToRepay} days</span>
                          </div>
                          <div className="flex justify-between text-text-secondary">
                            <span>Total amount to repay:</span>
                            <span className="font-medium">${borrowingTerms.totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-success">
                            <span>Total interest:</span>
                            <span className="font-medium">${(borrowingTerms.totalOwed - borrowingTerms.borrowAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    // Repay Section
                    <div className="space-y-4">
                      {!hasActiveLoan && !simulatedLoan ? (
                        <div className="text-center py-8 text-text-secondary">
                          <div className="font-medium">No Active Loan</div>
                          <div className="text-sm">Borrow first to see repayment options, or use demo mode</div>
                          <button
                            onClick={() => {
                              // Set up demo loan for repayment testing - start fresh
                              setSimulatedLoan({
                                originalAmount: 15000,
                                interestRate: 65,
                                totalOwed: 15750,
                                originalTotalOwed: 15750,
                                totalPaidFromEarlyRepayments: 0,
                                dailyRepayment: 1071.43,
                                repaymentRate: 75,
                                daysElapsed: 0 // Start demo from day 0
                              });
                            }}
                            className="mt-3 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm hover:bg-primary/30 transition-colors"
                          >
                            Try Demo Repayment
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Current Loan Status */}
                          <div className="bg-gray-800/30 rounded-lg p-4 text-sm">
                            <div className="flex justify-between text-text-secondary mb-2">
                              <span>Original loan amount:</span>
                              <span className="font-mono font-medium">${loanDetails.originalAmount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-text-secondary mb-2">
                              <span>Total interest:</span>
                              <span className="font-mono font-medium">
                                ${loanDetails.originalTotalInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({loanDetails.interestRate.toFixed(0)}% APR)
                              </span>
                            </div>
                            <div className="flex justify-between text-text-secondary mb-2">
                              <span>Total paid so far:</span>
                              <span className="font-mono font-medium">${loanDetails.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-primary font-medium mb-2">
                              <span>Remaining balance:</span>
                              <span className="font-mono font-semibold">${loanDetails.remainingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-text-secondary">
                              <span>Days until paid off:</span>
                              <span className="font-mono font-medium">{loanDetails.daysRemaining} days</span>
                            </div>
                          </div>

                          {/* Early Repayment Option */}
                          {loanDetails.remainingBalance > 0 && (
                            <div className="border-t border-primary/20 pt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-base font-medium">Early Repayment</span>
                              </div>
                              
                              <div className="mb-12">
                                <RepaySlider
                                  value={earlyRepayAmount}
                                  onChange={setEarlyRepayAmount}
                                  remainingBalance={loanDetails.remainingBalance}
                                  snapToAnchor={snapToAnchor}
                                />
                              </div>

                              {earlyRepayAmount > 0 && (
                                <div className="pt-2 border-t border-gray-600 space-y-2 text-sm">
                                  <div className="flex justify-between text-primary font-medium">
                                    <span>Total to pay:</span>
                                    <span className="font-semibold">
                                      ${loanDetails.earlyPaymentTotal?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0'}
                                      {loanDetails.earlyPaymentInterest && loanDetails.earlyPaymentInterest > 0 && (
                                        <span className="text-text-secondary font-normal text-xs ml-1">
                                          (incl. ${loanDetails.earlyPaymentInterest?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} interest)
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  {earlyRepayAmount < 100 && (
                                    <div className="flex justify-between text-yellow-400">
                                      <span>Days until paid off after early payment:</span>
                                      <span className="font-medium">{loanDetails.daysRemainingAfterEarlyPayment} days</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Button */}
                {!currentUserWallet || isTransitioning ? (
                  <button
                    onClick={handleConnectWallet}
                    disabled={isConnecting || isTransitioning}
                    className="w-full py-3 rounded-xl font-semibold transition-all bg-primary text-dark hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isConnecting || isTransitioning ? 'Setting up...' : 'Connect Wallet'}
                  </button>
                ) : showRepaySection ? (
                  <button
                    onClick={handleRepay}
                    disabled={earlyRepayAmount === 0 || isRepaying || loanDetails.remainingBalance === 0}
                    className={`w-full py-3 rounded-xl font-semibold transition-all ${
                      loanDetails.remainingBalance === 0
                        ? 'bg-gray-600 text-gray-300' 
                        : 'bg-success text-white hover:bg-success/90'
                    } ${
                      earlyRepayAmount === 0 || isRepaying || loanDetails.remainingBalance === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isRepaying
                      ? 'Processing Payment...'
                      : loanDetails.remainingBalance === 0
                      ? 'Loan already paid off'
                      : earlyRepayAmount === 0
                      ? 'Select amount to repay'
                      : earlyRepayAmount === 100 
                      ? `Pay Off Loan Completely ($${loanDetails.earlyPaymentTotal?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0'} USDC)`
                      : `Make Early Payment ($${loanDetails.earlyPaymentTotal?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0'} USDC)`
                    }
                  </button>
                ) : (
                  <button
                    onClick={handleBorrow}
                    disabled={isBorrowing || borrowPercentage === 0 || hasActiveLoan || !canBorrow}
                    className={`w-full py-3 rounded-xl font-semibold transition-all bg-secondary text-white hover:bg-secondary/90 ${
                      isBorrowing || borrowPercentage === 0 || hasActiveLoan || !canBorrow ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isBorrowing 
                      ? 'Processing Transaction...' 
                      : hasActiveLoan
                      ? 'Repay existing loan first'
                      : borrowPercentage === 0
                      ? 'Select amount to borrow'
                      : !canBorrow
                      ? 'Insufficient liquidity'
                      : `Borrow $${borrowingTerms.borrowAmount.toLocaleString()} at ${borrowingTerms.interestRate.toFixed(0)}% APR`
                    }
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Sponsor Leaderboard Preview - Smart Display */}
            <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Sponsor Leaderboard Preview (Builders, DAOs, Creators)</h3>
              <div className="space-y-3">
                {previewCreators.map((creator, index) => {
                  // Find this creator's actual rank in the full sorted list
                  const actualRank = sortedCreators.findIndex(c => c.wallet === creator.wallet) + 1;
                  const isBorrowing = creator.status === 'active' || !!creator.activeLoan;
                  const isPendingSquads = creator.status === 'pending_squads';
                  const statusSummary = isPendingSquads
                    ? 'Pending Squads safe • Finish setup to activate'
                    : isBorrowing
                    ? 'Borrowing • Auto-repayment active'
                    : 'Listed • No active advance';
                  const statusChipClasses = isPendingSquads
                    ? 'bg-warning/20 text-warning'
                    : isBorrowing
                    ? 'bg-success/20 text-success'
                    : 'bg-primary/20 text-primary';
                  const statusLabel = isPendingSquads ? 'PENDING SQUADS' : isBorrowing ? 'BORROWING' : 'LISTED';

                  return (
                    <div key={creator.wallet} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-b-0">
                      <div>
                        <div className="font-mono text-sm">
                          <span className={`text-lg font-bold mr-2 ${
                            actualRank === 1 ? 'text-yellow-400' : 
                            actualRank === 2 ? 'text-gray-300' : 
                            actualRank === 3 ? 'text-orange-400' : 
                            'text-text-secondary'
                          }`}>
                            #{actualRank}
                          </span>
                          {creator.wallet.slice(0, 8)}...{creator.wallet.slice(-4)}
                          {creator.wallet === currentUserWallet && (
                            <span className="ml-2 px-2 py-1 text-xs bg-primary/20 text-primary rounded">YOU</span>
                          )}
                        </div>
                        <div className="text-xs text-text-secondary">
                          {statusSummary} • ${creator.fees7d_usd.toLocaleString()} 7d earnings
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${statusChipClasses}`}>
                        {statusLabel}
                      </span>
                    </div>
                  );
                })}
                <div className="pt-2">
                  <a href="/leaderboard" className="text-primary hover:text-primary/80 text-sm">
                    View full leaderboard →
                  </a>
                </div>
              </div>
            </div>

            {/* Loan History */}
            <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Loan History</h3>
              {userLoanHistory.length === 0 ? (
                <div className="text-center py-6 text-text-secondary">
                  <div className="font-medium">No loan history</div>
                  <div className="text-sm">Your transactions will appear here</div>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {userLoanHistory.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-gray-700/20 rounded border border-gray-600/30 text-sm">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{formatLoanHistoryType(item.type)}</span>
                          <span className={`font-medium ${
                            item.type === 'loan' ? 'text-primary' : 'text-red-400'
                          }`}>
                            {item.type === 'loan' ? '+' : '-'}${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-text-secondary mt-1">
                          <div className="flex items-center space-x-3">
                            <span>{item.date}</span>
                            {item.interestRate && (
                              <span>{item.interestRate}% APR</span>
                            )}
                            {item.repaymentRate && (
                              <span>{item.repaymentRate}% of earnings</span>
                            )}
                          </div>
                          <span className={`${getStatusColor(item.status)} uppercase`}>
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

            {/* FAQ Section - Full Width at Bottom */}
            <div className="mt-12 bg-gray-800/30 border border-gray-700 rounded-xl p-8">
              <h2 className="text-2xl font-bold mb-6 text-center">Frequently Asked Questions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {faqItems.map((faq, index) => (
                  <div key={index} className="border border-gray-600 rounded-lg">
                    <button
                      onClick={() => toggleFaqItem(index)}
                      className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-700/30 transition-colors rounded-lg"
                    >
                      <span className="font-medium text-primary">{faq.q}</span>
                      <span className={`text-primary transition-transform ${openFaqItems[index] ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>
                    {openFaqItems[index] && (
                      <div className="px-4 pb-4 text-text-secondary text-sm leading-relaxed">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-8 text-center text-text-secondary">
            <h2 className="text-2xl font-semibold text-primary">Complete Squads setup to unlock financing</h2>
            <p className="mt-3 text-sm">
              {isPreviewOnly ? 'Your wallet is already on the leaderboard preview. ' : ''}
              Once your creator vault is linked to a Squads 2-of-2 safe and you&apos;re listed, the borrowing and repayment tools will appear here.
            </p>
            <p className="mt-3 text-xs uppercase tracking-wide text-text-secondary/70">
              Step 1: connect wallet • Step 2: create safe • Step 3: sign &amp; list
            </p>
          </div>
        )}

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

        /* Notification animations - slide in from right, stay in fixed position */
        .notification-item {
          animation: slideInFromRight 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
