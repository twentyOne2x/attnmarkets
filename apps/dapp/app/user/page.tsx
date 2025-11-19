// apps/dapp/app/user/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';
import Tooltip from '../components/Tooltip';
import BorrowSlider from '../components/BorrowSlider';
import RepaySlider from '../components/RepaySlider';
import { useAppContext } from '../context/AppContext';
import { calculateBorrowingTerms } from '../utils/borrowingCalculations';

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

export default function CreatorPage(): React.JSX.Element {
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
    getLoanHistoryForWallet
  } = useAppContext();
  
  // Initialize weekly revenues from context
  const [weeklyEarnings, setWeeklyEarnings] = useState<number>(() => {
    const existingCreator = creators.find(c => c.wallet === currentUserWallet);
    return existingCreator?.fees7d_usd || 10000;
  });
  
  // Smart default borrow percentage - always try 50% first, then constrain by liquidity
  const [borrowPercentage, setBorrowPercentage] = useState<number>(() => {
    const initialEarnings = creators.find(c => c.wallet === currentUserWallet)?.fees7d_usd || 10000;
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

  // Don't auto-generate wallet - let user connect manually
  useEffect(() => {
    if (!currentUserWallet) {
      console.log('👤 No wallet connected - user needs to connect first');
    }
  }, [currentUserWallet, setCurrentUserWallet]);

  // Get user's loan history from context
  const userLoanHistory = getLoanHistoryForWallet(currentUserWallet || '');

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
  const currentCreator = creators.find(c => c.wallet === currentUserWallet);
  const isListed = !!currentCreator; // If they exist in the array, they're listed
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
    
    const existingCreator = creators.find(c => c.wallet === currentUserWallet);
    if (existingCreator) {
      console.log('🔄 SYNCING CREATOR DATA');
      console.log('Creator found:', {
        wallet: existingCreator.wallet.slice(0,8),
        revenues: existingCreator.fees7d_usd,
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
  }, [currentUserWallet, creators]); // Re-run when creators change

  // Load revenues on component mount from context
  useEffect(() => {
    if (!currentUserWallet) return;
    
    const existingCreator = creators.find(c => c.wallet === currentUserWallet);
    if (existingCreator && weeklyEarnings === 10000) {
      // Only set revenues if we're still at default value
      console.log('Loading revenues from context on mount:', existingCreator.fees7d_usd);
      setWeeklyEarnings(existingCreator.fees7d_usd);
    }
  }, [currentUserWallet, creators]); // Load once when wallet/creators are available

  // Update borrow percentage when revenues change - only when revenues actually change, not continuously
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

  // Update user revenues when weekly revenues change - SIMPLIFIED AND DEBOUNCED
  useEffect(() => {
    if (!currentUserWallet || isUserEditing) return;
    
    const existingCreator = creators.find(c => c.wallet === currentUserWallet);
    if (existingCreator && Math.abs(existingCreator.fees7d_usd - weeklyEarnings) > 0.01) {
      console.log('Updating user revenues in context:', weeklyEarnings);
      
      // Debounce the update to prevent rapid updates
      const timeoutId = setTimeout(() => {
        updateCreatorEarnings(currentUserWallet, weeklyEarnings);
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [weeklyEarnings, currentUserWallet, isUserEditing]);

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
        title: 'Connecting wallet',
        message: 'Waiting for wallet approval...',
        duration: 1000
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const deterministicWallet = '0x1234567890abcdef1234567890abcdef12345678';
      setCurrentUserWallet(deterministicWallet);
      
      // Step 2: Automatically list the creator
      addNotification({
        type: 'processing',
        title: 'Setting up revenue account',
        message: 'Adding your earnings to the revenue leaderboard...',
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
      
      // Set default borrow percentage to 50% to show the advance terms
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
        title: 'Revenue account ready',
        message: 'Your wallet is connected and your earnings can now back revenue advances.',
        duration: 3000
      });
      
    } catch (error) {
      console.error('Error connecting wallet:', error);
      addNotification({
        type: 'error',
        title: 'Connection failed',
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
      addNotification({
        type: 'processing',
        title: 'Pricing advance',
        message: 'Validating advance request against your earnings...',
        persistent: true,
        duration: 800
      });
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Step 2: Checking liquidity
      addNotification({
        type: 'processing',
        title: 'Checking pool capacity',
        message: 'Checking available liquidity for revenue-backed positions...',
        persistent: true,
        duration: 600
      });
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Step 3: Confirming terms
      addNotification({
        type: 'processing',
        title: 'Confirming terms',
        message: 'Finalising revenue share and APR...',
        persistent: true,
        duration: 700
      });
      await new Promise(resolve => setTimeout(resolve, 700));
      
      // Step 4: Processing transaction
      addNotification({
        type: 'processing',
        title: 'Processing advance',
        message: 'Simulating advance transaction...',
        persistent: true,
        duration: 900
      });
      await new Promise(resolve => setTimeout(resolve, 900));
      
      console.log('Starting borrow process for wallet:', currentUserWallet);
      
      // Ensure creator is listed BEFORE taking advance
      const existingCreator = creators.find(c => c.wallet === currentUserWallet);
      if (!existingCreator) {
        console.log('Creator not found in array, adding them first before advance');
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
      }
      
      const loanData = {
        amount: borrowingTerms.borrowAmount,
        maxBorrowable: borrowingTerms.maxBorrowable,
        utilizationPct: borrowPercentage,
        dailyRepaymentRate: borrowingTerms.repaymentRate,
        interestRate: borrowingTerms.interestRate,
        daysRemaining: borrowingTerms.daysToRepay
      };
      
      console.log('Adding advance to creator:', currentUserWallet, loanData);
      const result = addCreatorLoan(currentUserWallet, loanData);
      if (!result.success) {
        throw new Error(result.message || 'Failed to process advance');
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

      console.log('Advance process completed successfully');
      
      // Add success notification
      addNotification({
        type: 'success',
        title: 'Advance opened',
        message: `${borrowingTerms.borrowAmount.toLocaleString()} USDC advanced at ${borrowingTerms.interestRate.toFixed(0)}% APR, repaid from ${borrowingTerms.repaymentRate}% of daily revenues.`
      });
      
    } catch (error) {
      console.error('Error in borrow process:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to process advance'
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
      addNotification({
        type: 'processing',
        title: 'Processing repayment',
        message: 'Calculating repayment against your remaining balance...',
        persistent: true,
        duration: 700
      });
      await new Promise(resolve => setTimeout(resolve, 700));
      
      // Step 2: Processing payment
      addNotification({
        type: 'processing',
        title: 'Processing repayment',
        message: 'Simulating payment transaction...',
        persistent: true,
        duration: 800
      });
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Step 3: Updating loan status
      addNotification({
        type: 'processing',
        title: 'Updating position',
        message: 'Updating advance status...',
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

        // Add to loan history via context
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
        
        // Update the actual position in context with remaining amount
        const remainingDays = Math.max(1, Math.ceil(newTotalOwed / simulatedLoan.dailyRepayment));
        const updatedLoanData = {
          amount: newTotalOwed,
          maxBorrowable: simulatedLoan.originalAmount * 2,
          utilizationPct: borrowPercentage,
          dailyRepaymentRate: simulatedLoan.repaymentRate,
          interestRate: simulatedLoan.interestRate,
          daysRemaining: remainingDays
        };
        addCreatorLoan(currentUserWallet, updatedLoanData);

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
        title: earlyRepayAmount === 100 ? 'Advance fully repaid' : 'Repayment processed',
        message: earlyRepayAmount === 100 
          ? 'This advance is now closed. Future revenues are unencumbered again.'
          : `${(loanDetails.earlyPaymentTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC early payment processed.`
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
    
    // Early payment with interest discount
    if (earlyRepayAmount > 0) {
      const repaymentPortion = earlyRepayAmount / 100;
      const totalRepaymentAmount = remainingBalance * repaymentPortion;
      
      const totalInterestInLoan = originalTotalInterest;
      const dailyInterestRate = totalInterestInLoan / (originalTotalOwed / dailyRepayment);
      const interestPaidFromDailyPayments = daysElapsed * dailyInterestRate;
      const remainingInterestFromOriginalLoan = Math.max(0, totalInterestInLoan - interestPaidFromDailyPayments);
      
      const totalRemaining = originalAmount + remainingInterestFromOriginalLoan - Math.max(0, totalPaidFromDailyPayments - interestPaidFromDailyPayments);
      const actualRemainingPrincipal = originalAmount - Math.max(0, totalPaidFromDailyPayments - interestPaidFromDailyPayments);
      const actualRemainingInterest = remainingInterestFromOriginalLoan;
      
      if (totalRemaining > 0) {
        const interestRatio = actualRemainingInterest / (actualRemainingPrincipal + actualRemainingInterest);
        const interestToRepay = totalRepaymentAmount * interestRatio;
        const principalToRepay = totalRepaymentAmount - interestToRepay;
        
        // Discount applies only to interest portion
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
    const currentUserCreator = creators.find(c => c.wallet === currentUserWallet);
    
    if (currentUserCreator && !topTwo.some(c => c.wallet === currentUserWallet)) {
      return [...topTwo, currentUserCreator];
    }
    
    return sortedCreators.slice(0, 3);
  };

  const previewCreators = getLeaderboardPreview();

  const faqItems = [
    {
      q: "How much can I borrow against my revenues?",
      a: "In this demo, you can simulate up to ~2 weeks of provable weekly revenues. If you earn $10k/week, you can model advances up to ~$20k."
    },
    {
      q: "How does the APR work?",
      a: "Rates are shown as annualised APR (typically in a 50–90% band). For short, 5–20 day revenue advances this usually translates to roughly 1–5% total cost, depending on slice size and duration."
    },
    {
      q: "How do I repay an advance?",
      a: "Repayments are automatic and daily. Smaller slices (≤50%) use 50% of daily revenues, medium slices (51–75%) use 75%, and large slices (76–100%) use 100% of daily revenues until the target amount is collected."
    },
    {
      q: "How long until the advance is paid off?",
      a: "Typically 5–20 days depending on how large a share of revenues you sell. Larger slices repay faster because a higher % of daily earnings goes to repayment."
    },
    {
      q: "What if my revenues drop?",
      a: "Repayments are percentage-based, so they adjust with actual revenues. If income drops, the advance simply takes longer to amortise instead of forcing a fixed cash payment."
    },
    {
      q: "Can I pay off early?",
      a: "Yes. You can prepay part or all of the remaining balance. In this demo we show a 5% discount on the interest portion of any early repayment to reflect typical early-payoff economics."
    }
  ];

  const formatLoanHistoryType = (type: string) => {
    switch (type) {
      case 'loan': return 'Advance opened';
      case 'repayment': return 'Auto repayment';
      case 'early_payment': return 'Early payment';
      case 'full_payoff': return 'Advance fully repaid';
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
    return '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark text-text-primary flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-lg mx-auto mb-4"></div>
          <p>Loading revenue account...</p>
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

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Revenue Account & Advances</h1>
            {currentUserWallet && (
              <div className="text-sm text-text-secondary mt-1">
                Wallet: <span className="font-mono">{currentUserWallet?.slice(0, 8)}...{currentUserWallet?.slice(-4)}</span>
              </div>
            )}
          </div>
          <a href="/" className="text-text-secondary hover:text-primary transition-colors">
            ← Back to dashboard
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Main Actions */}
          <div className="space-y-6">
            <div className="bg-dark-card border border-primary/20 rounded-xl p-6">
              {/* COMPACT HEADER with Pool Liquidity */}
              <div className="flex justify-between items-start mb-6">
                <div className="text-right">
                  <div className="text-sm text-blue-400 font-medium">Available credit capacity</div>
                  <div className="text-lg font-bold text-blue-400">${(availableLiquidity / 1000).toFixed(0)}K</div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Earnings input */}
                {isListed ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Weekly onchain revenues (USDC)
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
                        Indicative capacity (max advance)
                      </label>
                      <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-base font-mono text-primary">
                        ${borrowingTerms.maxBorrowable.toLocaleString()}
                      </div>
                      <div className="text-xs text-text-secondary mt-1">
                        Roughly up to ~2 weeks of provable revenues in this demo
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Your weekly onchain revenues (USDC)
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
                      {!currentUserWallet ? 'Connect a wallet first to sync or edit revenues.' : 'List your revenue account first to start simulating advances.'}
                    </div>
                  </div>
                )}

                {/* Main Interface */}
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  {/* Toggle between Borrow and Repay */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-4">
                      <h3 className="text-primary font-semibold">
                        {showRepaySection ? 'Position management' : 'Revenue advance simulator'}
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
                            Advance
                          </button>
                          <button
                            onClick={() => setShowRepaySection(true)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                              showRepaySection 
                                ? 'bg-primary text-white' 
                                : 'text-text-secondary hover:text-white'
                            }`}
                          >
                            Repay {(!hasActiveLoan && !simulatedLoan) && '(demo)'}
                          </button>
                        </div>
                      )}
                    </div>
                    <Tooltip content={showRepaySection ? "Manage your open revenue advance and early repayment options." : "Trade a slice of the next 1–3 weeks of revenues for cash now. Larger slices repay faster but at a higher APR."}>
                      <span className="text-xs text-primary cursor-help">ⓘ</span>
                    </Tooltip>
                  </div>

                  {!showRepaySection ? (
                    // Advance section
                    <>
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
                        <div className="p-3 bg-gray-700/30 rounded-lg text-sm">
                          <div className="flex justify-between items-center mb-2">
                            <span>Indicative APR:</span>
                            <span className={`font-semibold text-xl ${
                              borrowingTerms.interestRate <= 60 ? 'text-success' : 
                              borrowingTerms.interestRate <= 75 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {borrowingTerms.interestRate.toFixed(0)}% APR
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Daily repayment share:</span>
                            <span className={`font-semibold text-base ${
                              borrowingTerms.repaymentRate === 50 ? 'text-success' : 
                              borrowingTerms.repaymentRate === 75 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {borrowingTerms.repaymentRate}% of revenues
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Advance terms */}
                      {borrowPercentage > 0 && isListed && (
                        <div className="mt-4 p-3 bg-gray-800/30 rounded-lg text-sm space-y-2">
                          <div className="flex justify-between">
                            <span>Daily repayment:</span>
                            <span className="font-medium">${borrowingTerms.dailyRepayment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-primary">
                            <span>Estimated payoff time:</span>
                            <span className="font-medium">{borrowingTerms.daysToRepay} days</span>
                          </div>
                          <div className="flex justify-between text-text-secondary">
                            <span>Total to repay (principal + fees):</span>
                            <span className="font-medium">${borrowingTerms.totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-success">
                            <span>Total cost (simulated):</span>
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
                          <div className="font-medium">No active advance</div>
                          <div className="text-sm">Open an advance first to see repayment options, or use demo mode.</div>
                          <button
                            onClick={() => {
                              // Demo loan
                              setSimulatedLoan({
                                originalAmount: 15000,
                                interestRate: 65,
                                totalOwed: 15750,
                                originalTotalOwed: 15750,
                                totalPaidFromEarlyRepayments: 0,
                                dailyRepayment: 1071.43,
                                repaymentRate: 75,
                                daysElapsed: 0
                              });
                            }}
                            className="mt-3 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm hover:bg-primary/30 transition-colors"
                          >
                            Try demo repayment
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Current position status */}
                          <div className="bg-gray-800/30 rounded-lg p-4 text-sm">
                            <div className="flex justify-between text-text-secondary mb-2">
                              <span>Original advance amount:</span>
                              <span className="font-mono font-medium">${loanDetails.originalAmount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-text-secondary mb-2">
                              <span>Total interest (simulated):</span>
                              <span className="font-mono font-medium">
                                ${loanDetails.originalTotalInterest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({loanDetails.interestRate.toFixed(0)}% APR)
                              </span>
                            </div>
                            <div className="flex justify-between text-text-secondary mb-2">
                              <span>Total repaid so far:</span>
                              <span className="font-mono font-medium">${loanDetails.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-primary font-medium mb-2">
                              <span>Remaining balance:</span>
                              <span className="font-mono font-semibold">${loanDetails.remainingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-text-secondary">
                              <span>Days until fully repaid:</span>
                              <span className="font-mono font-medium">{loanDetails.daysRemaining} days</span>
                            </div>
                          </div>

                          {/* Early Repayment Option */}
                          {loanDetails.remainingBalance > 0 && (
                            <div className="border-t border-primary/20 pt-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-base font-medium">Early repayment</span>
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
                                    <span>Total to pay now:</span>
                                    <span className="font-semibold">
                                      ${loanDetails.earlyPaymentTotal?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0'}
                                      {loanDetails.earlyPaymentInterest && loanDetails.earlyPaymentInterest > 0 && (
                                        <span className="text-text-secondary font-normal text-xs ml-1">
                                          (incl. ${loanDetails.earlyPaymentInterest?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} interest before discount)
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  {earlyRepayAmount < 100 && (
                                    <div className="flex justify-between text-yellow-400">
                                      <span>Days remaining after early repayment:</span>
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
                    {isConnecting || isTransitioning ? 'Setting up revenue account...' : 'Connect wallet & set up revenue account'}
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
                      ? 'Processing repayment...'
                      : loanDetails.remainingBalance === 0
                      ? 'Advance already fully repaid'
                      : earlyRepayAmount === 0
                      ? 'Select amount to repay'
                      : earlyRepayAmount === 100 
                      ? `Repay advance in full ($${loanDetails.earlyPaymentTotal?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0'} USDC)`
                      : `Make early payment ($${loanDetails.earlyPaymentTotal?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0'} USDC)`
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
                      ? 'Processing advance...' 
                      : hasActiveLoan
                      ? 'Repay existing advance first'
                      : borrowPercentage === 0
                      ? 'Select revenue slice to sell'
                      : !canBorrow
                      ? 'Insufficient pool liquidity'
                      : `Open advance for $${borrowingTerms.borrowAmount.toLocaleString()} at ${borrowingTerms.interestRate.toFixed(0)}% APR`
                    }
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Revenue Leaderboard Preview */}
            <div className="bg-dark-card border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Revenue leaderboard preview</h3>
              <div className="space-y-3">
                {previewCreators.map((creator, index) => {
                  const actualRank = sortedCreators.findIndex(c => c.wallet === creator.wallet) + 1;
                  
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
                          {creator.status === 'active' || creator.activeLoan
                            ? `Advance open • auto-repayment active`
                            : 'Listed revenue account • no active advance'
                          } • ${creator.fees7d_usd.toLocaleString()} 7d revenues
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${
                        creator.status === 'active' || creator.activeLoan
                          ? 'bg-success/20 text-success' 
                          : 'bg-primary/20 text-primary'
                      }`}>
                        {creator.status === 'active' || creator.activeLoan ? 'BORROWING' : 'LISTED'}
                      </span>
                    </div>
                  );
                })}
                <div className="pt-2">
                  <a href="/leaderboard" className="text-primary hover:text-primary/80 text-sm">
                    View full revenue leaderboard →
                  </a>
                </div>
              </div>
            </div>

            {/* Loan History */}
            <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
              <h3 className="text-lg font-bold mb-4">Advance & repayment history</h3>
              {userLoanHistory.length === 0 ? (
                <div className="text-center py-6 text-text-secondary">
                  <div className="font-medium">No history yet</div>
                  <div className="text-sm">Your advances and repayments will appear here.</div>
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
                              <span>{item.repaymentRate}% of revenues</span>
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

        {/* FAQ Section */}
        <div className="mt-12 bg-gray-800/30 border border-gray-700 rounded-xl p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">Revenue advances – frequently asked questions</h2>
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
