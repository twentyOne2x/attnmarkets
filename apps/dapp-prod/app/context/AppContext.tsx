// apps/dapp/app/context/AppContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  calculateLPAPR,
  calculateMonthlyYield as calcMonthlyYield,
  calculateAverageCreatorBorrowRate,
  calculateBorrowingTerms,
  validateBorrowingRequest,
  calculateAvailableLiquidity,
  Creator,
  PoolData
} from '../utils/borrowingCalculations';
import { useDataMode, type HealthStatus } from './DataModeContext';
import type { DataMode } from '../config/runtime';
import type { GovernanceState } from '../lib/data-providers';

// Simple inline config
const POOL_CONFIG = {
  baseSeedAmount: 250000, // Base pool seed from "other LPs"
  minPoolUtilization: 0.1,
  maxPoolUtilization: 0.8,
  defaultUserBalance: 10000,
};

const computeGovernancePaused = (snapshot: GovernanceState | null): boolean => {
  if (!snapshot) {
    return false;
  }
  const creatorPaused = snapshot.creator_vaults.some(vault => vault.paused);
  const rewardsPaused = snapshot.rewards_pools.some(pool => pool.paused);
  const stablePaused = snapshot.stable_vault?.paused ?? false;
  return creatorPaused || rewardsPaused || stablePaused;
};

// Simple pool TVL calculation - no automatic top-ups
const calculatePoolTVL = (
  totalBorrowed: number,
  userDeposits: number = 0
): number => {
  // Pool TVL = Base Seed + User Deposits
  // Outstanding loans don't add to TVL, they just reduce available liquidity
  return POOL_CONFIG.baseSeedAmount + userDeposits;
};

interface UserData {
  wallet: string;
  usdc_balance: number;
  cyt_balance: number;
  deposits: any[];
  positions: any[];
}

interface UserPosition {
  deposited_usdc: number;
  cyt_tokens: number;
  estimated_yield: number;
  additional_deposits: number;
}

interface LoanHistoryItem {
  id: string;
  type: 'loan' | 'repayment' | 'early_payment' | 'full_payoff';
  amount: number;
  date: string;
  status: 'completed' | 'active' | 'defaulted';
  creatorWallet: string;
  interestRate?: number;
  repaymentRate?: number;
  daysToRepay?: number;
  totalInterest?: number;
}

interface LPHistoryItem {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  date: string;
  status: 'completed';
  wallet: string;
}

interface AppState {
  poolData: PoolData | null;
  userData: UserData | null;
  userPosition: UserPosition;
  creators: Creator[];
  currentUserWallet: string;
  loanHistory: LoanHistoryItem[];
  lpHistory: LPHistoryItem[];
}

// Global notification interface
interface Notification {
  id: string;
  type: 'processing' | 'success' | 'error';
  title: string;
  message: string;
  persistent?: boolean;
  duration?: number;
  position: number;
}

interface AppContextType {
  // Pool data
  poolData: PoolData | null;
  setPoolData: (data: PoolData) => void;
  
  // User data
  userData: UserData | null;
  setUserData: (data: UserData) => void;
  
  // User position
  userPosition: UserPosition;
  setUserPosition: (position: UserPosition) => void;
  
  // Creators data
  creators: Creator[];
  setCreators: (creators: Creator[]) => void;
  addCreatorLoan: (wallet: string, loanData: Creator['activeLoan']) => { success: boolean; message?: string };
  removeCreatorLoan: (wallet: string) => void;
  addCreatorToList: (creatorData: Omit<Creator, 'activeLoan'>) => void;
  updateCreatorEarnings: (wallet: string, newEarnings: number) => void;
  
  // Loan history
  loanHistory: LoanHistoryItem[];
  addLoanHistoryItem: (item: Omit<LoanHistoryItem, 'id' | 'date'>) => void;
  getLoanHistoryForWallet: (wallet: string) => LoanHistoryItem[];
  
  // LP history
  lpHistory: LPHistoryItem[];
  addLPHistoryItem: (item: Omit<LPHistoryItem, 'id' | 'date'>) => void;
  getLPHistoryForWallet: (wallet: string) => LPHistoryItem[];
  
  // Loading states
  loading: boolean;
  setLoading: (loading: boolean) => void;
  
  // Current user wallet
  currentUserWallet: string;
  setCurrentUserWallet: (wallet: string) => void;

  // Data mode
  mode: DataMode;
  isLive: boolean;
  healthStatus: HealthStatus;
  switchMode: (mode: DataMode) => Promise<void>;
  toggleMode: () => Promise<void>;
  apiBaseUrl: string | null;
  programIds: Record<string, string>;
  lastModeError?: string;
  cluster: string;
  governancePaused: boolean;
  writeEnabled: boolean;
  walletNetwork?: string | null;
  governanceState: GovernanceState | null;
  
  // Global notification system
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'position'>) => string;
  removeNotification: (id: string) => void;
  
  // Centralized wallet connection
  isConnecting: boolean;
  isListing: boolean;
  isWalletConnected: boolean;
  isUserListed: boolean;
  isFullyConnected: boolean;
  connectWallet: () => Promise<void>;
  signAndListCreator: () => Promise<void>;
  
  // Utility functions
  calculateLPAPR: () => number;
  calculateCreatorBorrowingRate: () => number;
  calculateMonthlyYield: (amount: number) => number;
  updatePoolTVL: (amount: number) => void;
  getAvailableLiquidity: () => number;
  getSortedCreators: () => Creator[];
  
  // LP specific functions
  depositToPool: (amount: number) => void;
  withdrawFromPool: (amount: number) => void;
  
  // Reset function for demo
  resetToDefaults: () => void;
  
  // Emergency cleanup function
  cleanupContaminatedHistory: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = 'attn-market-app-state';

// Current user wallet constant
const CURRENT_USER_WALLET = '0x1234567890abcdef1234567890abcdef12345678';

// Helper function to safely get from localStorage
const getFromLocalStorage = (): Partial<AppState> | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const savedState = localStorage.getItem(STORAGE_KEY);
    return savedState ? JSON.parse(savedState) : null;
  } catch (error) {
    console.warn('Failed to load state from localStorage:', error);
    return null;
  }
};

// Helper function to safely save to localStorage
const saveToLocalStorage = (state: Partial<AppState>) => {
  if (typeof window === 'undefined') return;
  
  try {
    const currentState = getFromLocalStorage() || {};
    const newState = { ...currentState, ...state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  } catch (error) {
    console.warn('Failed to save state to localStorage:', error);
  }
};

// Create deterministic demo creators with EXACTLY 60% pool utilization ($150K borrowed)
// Current user is EXCLUDED from active loans but CAN have historical loan data
const createDeterministicDemoCreators = (baseCreators: any[]): Creator[] => {
  // ENHANCED creator earnings to enable $150K total borrowing
  // Current user is NOT included in active borrowers
  const fixedBaseCreators = [
    { wallet: '0x742d35Cc6639C0532Ffc0434D16ac4a8b42143e5', fees7d_usd: 18000, beta_pct: 0.15, alpha_pct: 0.70, gamma_pct: 0.15, status: 'active', est_beta_next30d_usd: 77400 }, // Max: $36K
    { wallet: '0x8a65Cd2b3f85e8fd5a2C73A3b3b9bf5c7c9a0b32', fees7d_usd: 15000, beta_pct: 0.12, alpha_pct: 0.73, gamma_pct: 0.15, status: 'active', est_beta_next30d_usd: 64500 }, // Max: $30K
    { wallet: '0x1f2e3d4c5b6a7980123456789abcdef0fedcba98', fees7d_usd: 12500, beta_pct: 0.18, alpha_pct: 0.67, gamma_pct: 0.15, status: 'active', est_beta_next30d_usd: 53750 }, // Max: $25K
    { wallet: '0x9876543210fedcba0987654321abcdef12345678', fees7d_usd: 10000, beta_pct: 0.14, alpha_pct: 0.71, gamma_pct: 0.15, status: 'active', est_beta_next30d_usd: 43000 }, // Max: $20K
    { wallet: '0xabcdef1234567890abcdef1234567890abcdef12', fees7d_usd: 8500, beta_pct: 0.16, alpha_pct: 0.69, gamma_pct: 0.15, status: 'active', est_beta_next30d_usd: 36550 }, // Max: $17K
    { wallet: '0xfedcba0987654321fedcba0987654321fedcba09', fees7d_usd: 7500, beta_pct: 0.17, alpha_pct: 0.68, gamma_pct: 0.15, status: 'active', est_beta_next30d_usd: 32250 }, // Max: $15K
    { wallet: '0x567890abcdef1234567890abcdef1234567890ab', fees7d_usd: 6000, beta_pct: 0.15, alpha_pct: 0.70, gamma_pct: 0.15, status: 'active', est_beta_next30d_usd: 25800 }, // Max: $12K
    { wallet: '0xa1b2c3d4e5f6789012345678901234567890abcd', fees7d_usd: 5000, beta_pct: 0.15, alpha_pct: 0.70, gamma_pct: 0.15, status: 'active', est_beta_next30d_usd: 21500 }  // Max: $10K
  ];
  // Total max borrowable: $155K (enough for $150K target)

  // FINAL loan assignments for EXACTLY $150K total borrowed (60% of $250K)
  // Current user is NOT assigned any active loans
  const finalLoanAssignments = [
    { creatorIndex: 0, utilizationPct: 100 }, // $36K borrowed
    { creatorIndex: 1, utilizationPct: 100 }, // $30K borrowed  
    { creatorIndex: 2, utilizationPct: 100 }, // $25K borrowed
    { creatorIndex: 3, utilizationPct: 100 }, // $20K borrowed
    { creatorIndex: 4, utilizationPct: 100 }, // $17K borrowed
    { creatorIndex: 5, utilizationPct: 100 }, // $15K borrowed
    { creatorIndex: 6, utilizationPct: 58 },  // $12K max → $7K borrowed
    // creatorIndex 7 gets no loan to hit exactly $150K total
  ];
  // Total: $150K borrowed (exactly 60% utilization)

  const creatorsWithLoans: Creator[] = fixedBaseCreators.map((creator, index) => {
    const loanAssignment = finalLoanAssignments.find(assignment => assignment.creatorIndex === index);
    
    if (loanAssignment) {
      const weeklyEarnings = creator.fees7d_usd;
      const utilizationPct = loanAssignment.utilizationPct;
      const borrowingTerms = calculateBorrowingTerms(weeklyEarnings, utilizationPct);
      
      return {
        ...creator,
        activeLoan: {
          amount: borrowingTerms.borrowAmount,
          maxBorrowable: borrowingTerms.maxBorrowable,
          utilizationPct,
          dailyRepaymentRate: borrowingTerms.repaymentRate,
          interestRate: borrowingTerms.interestRate,
          daysRemaining: borrowingTerms.daysToRepay
        }
      } as Creator;
    }
    
    return { ...creator } as Creator;
  });

  const totalBorrowed = creatorsWithLoans.reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);

  console.log('🎯 DETERMINISTIC Demo creators created (Current user NOT included in active loans):', {
    total: creatorsWithLoans.length,
    withLoans: creatorsWithLoans.filter(c => c.activeLoan).length,
    totalBorrowed: totalBorrowed.toLocaleString(),
    poolUtilization: ((totalBorrowed / 250000) * 100).toFixed(1) + '%',
    targetUtilization: '60%',
    currentUserWallet: CURRENT_USER_WALLET,
    currentUserHasActiveLoan: false,
    loanBreakdown: creatorsWithLoans.filter(c => c.activeLoan).map(c => ({
      wallet: c.wallet.slice(0, 8) + '...',
      earnings: c.fees7d_usd,
      borrowed: c.activeLoan?.amount,
      utilization: c.activeLoan?.utilizationPct + '%'
    }))
  });

  return creatorsWithLoans;
};

// Generate sample loan history for demo
// Current user starts with EMPTY loan history - clean slate
const generateSampleLoanHistory = (wallet: string): LoanHistoryItem[] => {
  // ALL users start with empty loan history - fresh start experience
  console.log('🏦 Starting with EMPTY loan history - fresh user experience');
  return [];
};

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const {
    mode,
    setMode: setDataMode,
    toggleMode,
    provider,
    cluster,
    apiBaseUrl,
    programIds,
    healthStatus,
    lastError,
  } = useDataMode();
  const wallet = useWallet();

  // Initialize wallet from localStorage first, before any other state
  const [currentUserWallet, setCurrentUserWalletState] = useState<string>(() => {
    const savedState = getFromLocalStorage();
    const savedWallet = savedState?.currentUserWallet || '';
    
    if (savedWallet) {
      console.log('🔑 WALLET RESTORED FROM STORAGE:', savedWallet);
    } else {
      console.log('🔑 NO WALLET IN STORAGE - STARTING DISCONNECTED');
    }
    
    return savedWallet;
  });

  // Initialize other state
  const [poolData, setPoolDataState] = useState<PoolData | null>(null);
  const [userData, setUserDataState] = useState<UserData | null>(null);
  const [userPosition, setUserPositionState] = useState<UserPosition>({
    deposited_usdc: 0,
    cyt_tokens: 0,
    estimated_yield: 0,
    additional_deposits: 0
  });
  const [creators, setCreatorsState] = useState<Creator[]>([]);
  const [loanHistory, setLoanHistoryState] = useState<LoanHistoryItem[]>([]);
  const [lpHistory, setLPHistoryState] = useState<LPHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [dataInitialized, setDataInitialized] = useState<boolean>(false);

  // Global notification system
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationCounter, setNotificationCounter] = useState<number>(0);

  // Global connection states
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isListing, setIsListing] = useState<boolean>(false);
  const [governanceState, setGovernanceState] = useState<GovernanceState | null>(null);
  const [governancePaused, setGovernancePaused] = useState<boolean>(false);

  // Derived connection states
  const isWalletConnected = wallet.connected || !!currentUserWallet;
  const adapterNetwork =
    wallet.wallet?.adapter && 'network' in wallet.wallet.adapter
      ? ((wallet.wallet.adapter as { network?: string }).network ?? null)
      : null;
  const isWalletOnDevnet =
    !adapterNetwork ||
    adapterNetwork === 'devnet' ||
    adapterNetwork === WalletAdapterNetwork.Devnet;
  const isUserListed = creators.some(c => c.wallet === currentUserWallet);
  const isFullyConnected = isWalletConnected && isUserListed;
  const isLive = mode === 'live';
  const writeEnabled =
    isLive && cluster === 'devnet' && isWalletConnected && !governancePaused && isWalletOnDevnet;

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      const pubkey = wallet.publicKey.toBase58();
      if (currentUserWallet !== pubkey) {
        setCurrentUserWalletState(pubkey);
        saveToLocalStorage({ currentUserWallet: pubkey });
      }
    }
  }, [wallet.connected, wallet.publicKey, currentUserWallet]);

  // Global notification management
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

  // Centralized wallet connection - Step 1: Connect wallet only
  const connectWallet = async () => {
    if (isConnecting || wallet.connected) {
      return;
    }

    setIsConnecting(true);

    try {
      if (wallet.connect) {
        await wallet.connect();
        if (wallet.publicKey) {
          const pubkey = wallet.publicKey.toBase58();
          setCurrentUserWalletState(pubkey);
          saveToLocalStorage({ currentUserWallet: pubkey });
          addNotification({
            type: 'success',
            title: 'Wallet Connected!',
            message: 'Wallet adapter connected successfully.',
            duration: 2500,
          });
          return;
        }
      }
      throw new Error('Wallet adapter unavailable');
    } catch (error) {
      console.warn('Wallet adapter connection failed, falling back to demo wallet', error);
      if (!currentUserWallet) {
        addNotification({
          type: 'processing',
          title: 'Connecting Wallet',
          message: 'Generating demo wallet address...',
          duration: 1000,
        });
        await new Promise(resolve => setTimeout(resolve, 1000));

        const deterministicWallet = '0x1234567890abcdef1234567890abcdef12345678';
        setCurrentUserWalletState(deterministicWallet);
        saveToLocalStorage({ currentUserWallet: deterministicWallet });

        addNotification({
          type: 'success',
          title: 'Demo Wallet Connected',
          message: 'Click Sign & List to complete setup.',
          duration: 3000,
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Connection Failed',
          message: 'Failed to connect wallet',
        });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Centralized listing - Step 2: Sign message and list creator
  const signAndListCreator = async () => {
    if (!currentUserWallet || isListing) return;
    
    setIsListing(true);
    
    try {
      console.log('📝 AppContext: Signing message and listing creator...');
      
      addNotification({
        type: 'processing',
        title: 'Sign Message',
        message: 'Please sign the message in your wallet...',
        duration: 1500
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      addNotification({
        type: 'processing',
        title: 'Processing Signature',
        message: 'Verifying signature and listing creator...',
        duration: 1000
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
        console.log('AppContext: Adding new creator to leaderboard:', newCreator);
        addCreatorToList(newCreator);
      }
      
      addNotification({
        type: 'success',
        title: 'Successfully Listed!',
        message: 'You can now borrow up to 2 weeks of earnings.',
        duration: 4000
      });
      
      console.log('✅ AppContext: Creator successfully listed');
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

  // Initialize data on mount - only once
  useEffect(() => {
    let cancelled = false;

    const initializeData = async () => {
      console.log('🚀 STARTING DATA INITIALIZATION (mode=%s)', mode);
      setLoading(true);

      try {
        if (mode === 'demo') {
          const savedState = getFromLocalStorage();

          if (savedState && savedState.poolData && savedState.creators && savedState.creators.length > 0) {
            if (cancelled) return;
            setPoolDataState(savedState.poolData);
            setUserDataState(savedState.userData || null);

            const userPos = savedState.userPosition || {
              deposited_usdc: 0,
              cyt_tokens: 0,
              estimated_yield: 0,
              additional_deposits: 0,
            };

            if (userPos.additional_deposits === undefined) {
              userPos.additional_deposits = userPos.deposited_usdc;
            }

            setUserPositionState(userPos);
            setCreatorsState(savedState.creators);

            if (savedState.loanHistory && savedState.loanHistory.length > 0) {
              const validLoanTypes: LoanHistoryItem['type'][] = ['loan', 'repayment', 'early_payment', 'full_payoff'];
              const cleanedLoanHistory = savedState.loanHistory.filter((item: LoanHistoryItem) => {
                const isValid = validLoanTypes.includes(item.type) && item.creatorWallet;
                return isValid;
              });
              setLoanHistoryState(cleanedLoanHistory);
            } else {
              const sampleHistory = currentUserWallet ? generateSampleLoanHistory(currentUserWallet) : [];
              setLoanHistoryState(sampleHistory);
              if (sampleHistory.length > 0) {
                saveToLocalStorage({ loanHistory: sampleHistory });
              }
            }

            if (savedState.lpHistory && savedState.lpHistory.length > 0) {
              setLPHistoryState(savedState.lpHistory);
            }
          } else {
            const [poolResponse, userResponse, creatorsResponse] = await Promise.all([
              fetch('/mock/lp_pool.json'),
              fetch('/mock/user.json'),
              fetch('/mock/creators.json'),
            ]);

            const [poolData, userData, creatorsData] = await Promise.all([
              poolResponse.json(),
              userResponse.json(),
              creatorsResponse.json(),
            ]);

            const enhancedCreators = createDeterministicDemoCreators(creatorsData);

            const totalBorrowed = enhancedCreators
              .filter(c => c.activeLoan)
              .reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);

            const initialTVL = calculatePoolTVL(totalBorrowed, 0);

            const updatedPool = {
              ...poolData,
              tvl_usdc: initialTVL,
              creator_earnings_next30d: poolData.beta_total_usd_next30d || 29500,
            };

            const seededUserData = {
              ...userData,
              usdc_balance: POOL_CONFIG.defaultUserBalance,
              wallet: currentUserWallet || 'disconnected',
            };

            const initialPosition = {
              deposited_usdc: 0,
              cyt_tokens: 0,
              estimated_yield: 0,
              additional_deposits: 0,
            };

            const sampleHistory = currentUserWallet ? generateSampleLoanHistory(currentUserWallet) : [];

            if (cancelled) return;
            setPoolDataState(updatedPool);
            setUserDataState(seededUserData);
            setCreatorsState(enhancedCreators);
            setUserPositionState(initialPosition);
            setLoanHistoryState(sampleHistory);
            setLPHistoryState([]);
            setGovernanceState(null);
            setGovernancePaused(false);

            saveToLocalStorage({
              poolData: updatedPool,
              userData: seededUserData,
              userPosition: initialPosition,
              creators: enhancedCreators,
              currentUserWallet: currentUserWallet,
              loanHistory: sampleHistory,
              lpHistory: [],
            });
          }
        } else {
          const [poolOverview, creatorsPage, governanceSnapshot] = await Promise.all([
            provider.getPoolOverview(),
            provider.getCreators({ limit: 100 }),
            provider.getGovernance(),
          ]);

          const normalizedCreators = creatorsPage.items.map(creator => ({
            wallet: creator.wallet,
            fees7d_usd: creator.fees7d_usd,
            beta_pct: creator.beta_pct,
            alpha_pct: creator.alpha_pct,
            gamma_pct: creator.gamma_pct,
            status: creator.status,
            est_beta_next30d_usd: creator.est_beta_next30d_usd,
            activeLoan: creator.activeLoan,
          })) as Creator[];

          const updatedPool: PoolData = {
            tvl_usdc: poolOverview.tvl_usdc,
            projected_apr: calculateLPAPR({
              tvl_usdc: poolOverview.tvl_usdc,
              projected_apr: 0,
              epoch_end: poolOverview.epoch_end,
              creator_earnings_next30d: poolOverview.creator_earnings_next30d,
            }, normalizedCreators),
            epoch_end: poolOverview.epoch_end,
            creator_earnings_next30d: poolOverview.creator_earnings_next30d,
          };

          let userPortfolio: UserData | null = null;
          let liveLoanHistory: LoanHistoryItem[] = [];

          if (currentUserWallet) {
            try {
              const [portfolio, loanHistoryResp] = await Promise.all([
                provider.getUserPortfolio(currentUserWallet),
                provider.getLoanHistory(currentUserWallet, { limit: 50 }),
              ]);

              userPortfolio = {
                wallet: portfolio.wallet,
                usdc_balance: portfolio.usdc_balance,
                cyt_balance: portfolio.cyt_balance,
                deposits: portfolio.deposits,
                positions: portfolio.positions,
              };

              liveLoanHistory = loanHistoryResp.items;
            } catch (error) {
              console.warn('Failed to load live portfolio', error);
            }
          }

          if (cancelled) return;
          setPoolDataState(updatedPool);
          setCreatorsState(normalizedCreators);
          setUserDataState(userPortfolio);
          setUserPositionState({
            deposited_usdc: userPortfolio?.positions?.[0]?.deposited_usdc || 0,
            cyt_tokens: userPortfolio?.positions?.[0]?.cyt_tokens || 0,
            estimated_yield: userPortfolio?.positions?.[0]?.estimated_yield || 0,
            additional_deposits: userPortfolio?.positions?.[0]?.additional_deposits || 0,
          });
          setLoanHistoryState(liveLoanHistory);
          setLPHistoryState([]);
          setGovernanceState(governanceSnapshot);
          setGovernancePaused(computeGovernancePaused(governanceSnapshot));
        }

        if (cancelled) return;
        setLoading(false);
        setDataInitialized(true);

        setTimeout(() => {
          if (!cancelled) {
            cleanupContaminatedHistory();
          }
        }, 1000);
      } catch (error) {
        console.error('Error initializing data:', error);
        if (!cancelled) {
          setLoading(false);
          setDataInitialized(true);
          setGovernanceState(null);
          setGovernancePaused(false);
        }
        if (mode === 'live') {
          await setDataMode('demo');
        }
      }
    };

    initializeData();

    return () => {
      cancelled = true;
    };
  }, [mode, provider, currentUserWallet, setDataMode]);
  const setPoolData = (data: PoolData) => {
    setPoolDataState(data);
    if (!isLive) {
      saveToLocalStorage({ poolData: data });
    }
    const newPosition = {
      ...userPosition,
      estimated_yield: calcMonthlyYield(userPosition.deposited_usdc, data, creators)
    };
    setUserPositionState(newPosition);
    if (!isLive) {
      saveToLocalStorage({ userPosition: newPosition });
    }
  };

  const setUserData = (data: UserData) => {
    setUserDataState(data);
    if (!isLive) {
      saveToLocalStorage({ userData: data });
    }
  };

  const setUserPosition = (position: UserPosition) => {
    setUserPositionState(position);
    if (!isLive) {
      saveToLocalStorage({ userPosition: position });
    }
  };

  const setCreators = (newCreators: Creator[]) => {
    setCreatorsState(newCreators);
    if (!isLive) {
      saveToLocalStorage({ creators: newCreators });
    }
    if (poolData) {
      const newPosition = {
        ...userPosition,
        estimated_yield: calcMonthlyYield(userPosition.deposited_usdc, poolData, newCreators)
      };
      setUserPositionState(newPosition);
      if (!isLive) {
        saveToLocalStorage({ userPosition: newPosition });
      }
    }
  };

  const setCurrentUserWallet = (wallet: string) => {
    console.log('🔑 SETTING WALLET:', wallet || 'DISCONNECTED');
    setCurrentUserWalletState(wallet);
    saveToLocalStorage({ currentUserWallet: wallet });
    
    // If connecting and no history exists, generate sample history
    if (wallet && loanHistory.length === 0) {
      const sampleHistory = generateSampleLoanHistory(wallet);
      setLoanHistoryState(sampleHistory);
      saveToLocalStorage({ loanHistory: sampleHistory });
    }
    
    // If disconnecting (empty wallet), don't auto-generate new data
    if (!wallet) {
      console.log('👋 Wallet disconnected');
    }
  };

  // LP functions that properly adjust pool TVL
  const depositToPool = (amount: number) => {
    console.log('💰 DEPOSITING TO POOL:', amount);
    
    const newPosition = {
      ...userPosition,
      deposited_usdc: userPosition.deposited_usdc + amount,
      additional_deposits: userPosition.additional_deposits + amount,
      estimated_yield: 0
    };
    
    if (poolData) {
      // Only user deposits should increase pool TVL
      const updatedPool = {
        ...poolData,
        tvl_usdc: poolData.tvl_usdc + amount
      };
      
      newPosition.estimated_yield = calcMonthlyYield(newPosition.deposited_usdc, updatedPool, creators);
      
      setPoolDataState(updatedPool);
      setUserPositionState(newPosition);
      
      const lpItem: LPHistoryItem = {
        id: 'lp-deposit-' + Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
        type: 'deposit',
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        status: 'completed',
        wallet: currentUserWallet
      };
      
      const newLPHistory = [lpItem, ...lpHistory];
      setLPHistoryState(newLPHistory);
      
      saveToLocalStorage({ 
        poolData: updatedPool, 
        userPosition: newPosition,
        lpHistory: newLPHistory
      });
      
      console.log('✅ Deposit complete - TVL increased by user deposit');
    }
  };

  const withdrawFromPool = (amount: number) => {
    console.log('💸 WITHDRAWING FROM POOL:', amount);
    
    if (amount > userPosition.deposited_usdc) {
      console.error('Insufficient balance for withdrawal');
      return;
    }
    
    const withdrawFromAdditional = Math.min(amount, userPosition.additional_deposits);
    const newPosition = {
      ...userPosition,
      deposited_usdc: userPosition.deposited_usdc - amount,
      additional_deposits: Math.max(0, userPosition.additional_deposits - withdrawFromAdditional),
      estimated_yield: 0
    };
    
    if (poolData) {
      // Only user withdrawals should decrease pool TVL
      const updatedPool = {
        ...poolData,
        tvl_usdc: poolData.tvl_usdc - amount
      };
      
      newPosition.estimated_yield = calcMonthlyYield(newPosition.deposited_usdc, updatedPool, creators);
      
      setPoolDataState(updatedPool);
      setUserPositionState(newPosition);
      
      const lpItem: LPHistoryItem = {
        id: 'lp-withdrawal-' + Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
        type: 'withdrawal',
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        status: 'completed',
        wallet: currentUserWallet
      };
      
      const newLPHistory = [lpItem, ...lpHistory];
      setLPHistoryState(newLPHistory);
      
      saveToLocalStorage({ 
        poolData: updatedPool, 
        userPosition: newPosition,
        lpHistory: newLPHistory
      });
      
      console.log('✅ Withdrawal complete - TVL decreased by user withdrawal');
    }
  };

  // Loan history functions
  const addLoanHistoryItem = (item: Omit<LoanHistoryItem, 'id' | 'date'>) => {
    const validLoanTypes: LoanHistoryItem['type'][] = ['loan', 'repayment', 'early_payment', 'full_payoff'];
    if (!validLoanTypes.includes(item.type)) {
      console.error('🚨 REJECTED: Invalid loan history type:', item.type);
      return;
    }

    if (!item.creatorWallet) {
      console.error('🚨 REJECTED: No creatorWallet provided for loan history item:', item);
      return;
    }

    const newItem: LoanHistoryItem = {
      ...item,
      id: 'loan-' + Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString().split('T')[0]
    };
    
    const newHistory = [newItem, ...loanHistory];
    setLoanHistoryState(newHistory);
    saveToLocalStorage({ loanHistory: newHistory });
  };

  const getLoanHistoryForWallet = (wallet: string): LoanHistoryItem[] => {
    const validLoanTypes: LoanHistoryItem['type'][] = ['loan', 'repayment', 'early_payment', 'full_payoff'];
    
    const userHistory = loanHistory
      .filter(item => {
        const walletMatch = item.creatorWallet === wallet;
        const typeValid = validLoanTypes.includes(item.type);
        return walletMatch && typeValid;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return userHistory;
  };

  // LP history functions
  const addLPHistoryItem = (item: Omit<LPHistoryItem, 'id' | 'date'>) => {
    const validLPTypes: LPHistoryItem['type'][] = ['deposit', 'withdrawal'];
    if (!validLPTypes.includes(item.type)) {
      console.error('Invalid LP history type:', item.type);
      return;
    }

    const newItem: LPHistoryItem = {
      ...item,
      id: 'lp-' + Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString().split('T')[0]
    };
    
    const newHistory = [newItem, ...lpHistory];
    setLPHistoryState(newHistory);
    saveToLocalStorage({ lpHistory: newHistory });
  };

  const getLPHistoryForWallet = (wallet: string): LPHistoryItem[] => {
    const userHistory = lpHistory
      .filter(item => item.wallet === wallet)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return userHistory;
  };

  const addCreatorToList = (creatorData: Omit<Creator, 'activeLoan'>) => {
    const existingCreatorIndex = creators.findIndex(c => c.wallet === creatorData.wallet);
    
    let newCreators: Creator[];
    if (existingCreatorIndex >= 0) {
      newCreators = creators.map((creator, index) => 
        index === existingCreatorIndex 
          ? { ...creator, ...creatorData, status: 'listed' }
          : creator
      );
    } else {
      const newCreator: Creator = {
        ...creatorData,
        status: 'listed'
      };
      newCreators = [...creators, newCreator];
    }
    
    setCreatorsState(newCreators);
    saveToLocalStorage({ creators: newCreators });

    if (poolData) {
      const newPosition = {
        ...userPosition,
        estimated_yield: calcMonthlyYield(userPosition.deposited_usdc, poolData, newCreators)
      };
      setUserPositionState(newPosition);
      saveToLocalStorage({ userPosition: newPosition });
    }
  };

  const updateCreatorEarnings = (wallet: string, newEarnings: number) => {
    const existingCreator = creators.find(c => c.wallet === wallet);
    if (existingCreator && Math.abs(existingCreator.fees7d_usd - newEarnings) < 0.01) {
      return;
    }
    
    const newCreators = creators.map(creator => 
      creator.wallet === wallet 
        ? { 
            ...creator, 
            fees7d_usd: newEarnings,
            est_beta_next30d_usd: newEarnings * 4.3
          }
        : creator
    );
    
    setCreatorsState(newCreators);
    saveToLocalStorage({ creators: newCreators });
  };

  // Loan operations don't change pool TVL
  const addCreatorLoan = (wallet: string, loanData: Creator['activeLoan']): { success: boolean; message?: string } => {
    if (!loanData) {
      return { success: false, message: "Invalid loan data" };
    }

    const validation = validateBorrowingRequest(loanData.amount, poolData, creators);
    if (!validation.isValid) {
      return { success: false, message: validation.reason };
    }

    console.log('=== Adding Creator Loan (NO TVL CHANGE) ===');
    
    const existingCreatorIndex = creators.findIndex(c => c.wallet === wallet);
    let newCreators: Creator[];

    if (existingCreatorIndex >= 0) {
      newCreators = creators.map((creator, index) => 
        index === existingCreatorIndex
          ? { ...creator, activeLoan: loanData, status: 'active' }
          : creator
      );
    } else {
      const newCreator: Creator = {
        wallet,
        fees7d_usd: 10000,
        beta_pct: 0.15,
        alpha_pct: 0.70,
        gamma_pct: 0.15,
        status: 'active',
        est_beta_next30d_usd: 43000,
        activeLoan: loanData
      };
      newCreators = [...creators, newCreator];
    }

    // Only update creators, NOT pool TVL
    setCreatorsState(newCreators);
    saveToLocalStorage({ creators: newCreators });

    addLoanHistoryItem({
      type: 'loan',
      amount: loanData.amount,
      status: 'active',
      creatorWallet: wallet,
      interestRate: loanData.interestRate,
      repaymentRate: loanData.dailyRepaymentRate,
      daysToRepay: loanData.daysRemaining,
      totalInterest: loanData.maxBorrowable ? (loanData.maxBorrowable / 2) * (loanData.interestRate / 100) * (loanData.daysRemaining / 365) : 0
    });

    if (poolData) {
      const newPosition = {
        ...userPosition,
        estimated_yield: calcMonthlyYield(userPosition.deposited_usdc, poolData, newCreators)
      };
      setUserPositionState(newPosition);
      saveToLocalStorage({ userPosition: newPosition });
    }

    console.log('=== Loan Added Successfully (Available liquidity reduced) ===');
    return { success: true };
  };

  const removeCreatorLoan = (wallet: string) => {
    console.log('=== Removing Creator Loan (NO TVL CHANGE) ===');
    
    const newCreators = creators.map(c => 
      c.wallet === wallet 
        ? { ...c, activeLoan: undefined, status: 'listed' }
        : c
    );
    
    // Only update creators, NOT pool TVL
    setCreatorsState(newCreators);
    saveToLocalStorage({ creators: newCreators });

    if (poolData) {
      const newPosition = {
        ...userPosition,
        estimated_yield: calcMonthlyYield(userPosition.deposited_usdc, poolData, newCreators)
      };
      setUserPositionState(newPosition);
      saveToLocalStorage({ userPosition: newPosition });
    }
    
    console.log('=== Loan Removed Successfully (Available liquidity increased) ===');
  };

  // Calculation functions
  const calculateLPAPRValue = (): number => {
    return calculateLPAPR(poolData, creators);
  };

  const calculateCreatorBorrowingRate = (): number => {
    return calculateAverageCreatorBorrowRate(creators);
  };

  const calculateMonthlyYield = (amount: number): number => {
    return calcMonthlyYield(amount, poolData, creators);
  };

  const updatePoolTVL = (amount: number) => {
    if (amount > 0) {
      depositToPool(amount);
    } else {
      withdrawFromPool(Math.abs(amount));
    }
  };

  // Pure calculation of available liquidity
  const getAvailableLiquidity = (): number => {
    if (!poolData) return 0;
    
    const totalBorrowed = creators
      .filter(c => c.activeLoan)
      .reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);
    
    const availableLiquidity = poolData.tvl_usdc - totalBorrowed;
    
    console.log('💰 Available Liquidity Check:', {
      poolTVL: poolData.tvl_usdc,
      totalBorrowed,
      availableLiquidity,
      utilization: ((totalBorrowed / poolData.tvl_usdc) * 100).toFixed(1) + '%'
    });
    
    return Math.max(0, availableLiquidity);
  };

  const getSortedCreators = (): Creator[] => {
    return [...creators].sort((a, b) => b.fees7d_usd - a.fees7d_usd);
  };

  const resetToDefaults = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
  };

  const cleanupContaminatedHistory = () => {
    const validLoanTypes: LoanHistoryItem['type'][] = ['loan', 'repayment', 'early_payment', 'full_payoff'];
    const cleanedLoanHistory = loanHistory.filter(item => {
      const isValid = validLoanTypes.includes(item.type) && item.creatorWallet;
      if (!isValid) {
        console.log('🧹 REMOVING contaminated item:', item.type, item.id);
      }
      return isValid;
    });
    
    if (cleanedLoanHistory.length !== loanHistory.length) {
      console.log(`🧹 CLEANED ${loanHistory.length - cleanedLoanHistory.length} contaminated items`);
      setLoanHistoryState(cleanedLoanHistory);
      if (!isLive) {
        saveToLocalStorage({ loanHistory: cleanedLoanHistory });
      }
    }
  };

  const contextValue: AppContextType = {
    poolData,
    setPoolData,
    userData,
    setUserData,
    userPosition,
    setUserPosition,
    creators,
    setCreators,
    addCreatorLoan,
    removeCreatorLoan,
    addCreatorToList,
    updateCreatorEarnings,
    loanHistory,
    addLoanHistoryItem,
    getLoanHistoryForWallet,
    lpHistory,
    addLPHistoryItem,
    getLPHistoryForWallet,
    loading,
    setLoading,
    currentUserWallet,
    setCurrentUserWallet,
    mode,
    isLive,
    healthStatus,
    switchMode: setDataMode,
    toggleMode,
    apiBaseUrl,
    programIds,
    lastModeError: lastError,
    cluster,
    governancePaused,
    writeEnabled,
    walletNetwork: adapterNetwork,
    governanceState,

    // Global notification system
    notifications,
    addNotification,
    removeNotification,
    
    // Centralized wallet connection
    isConnecting,
    isListing,
    isWalletConnected,
    isUserListed,
    isFullyConnected,
    connectWallet,
    signAndListCreator,
    
    calculateLPAPR: calculateLPAPRValue,
    calculateCreatorBorrowingRate,
    calculateMonthlyYield,
    updatePoolTVL,
    getAvailableLiquidity,
    getSortedCreators,
    depositToPool,
    withdrawFromPool,
    resetToDefaults,
    cleanupContaminatedHistory
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};
