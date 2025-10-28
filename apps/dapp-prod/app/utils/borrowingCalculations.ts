// apps/dapp/app/utils/borrowingCalculations.ts

export interface CreatorMetrics {
  totalFeesUsd: number;
  recent14dTotalUsd: number;
  recent14dAverageUsd: number;
  leaderboardPoints: number;
}

export interface Creator {
  wallet: string;
  fees7d_usd: number;
  beta_pct: number;
  alpha_pct: number;
  gamma_pct: number;
  status: string;
  est_beta_next30d_usd: number;
  creator_vault?: string | null;
  market?: string;
  admin?: string | null;
  pump_mint?: string | null;
  metrics?: CreatorMetrics;
  hasCreatorVault?: boolean;
  activeLoan?: {
    amount: number;
    maxBorrowable: number;
    utilizationPct: number;
    dailyRepaymentRate: number;
    interestRate: number;
    daysRemaining: number;
  };
}

export interface PoolData {
  tvl_usdc: number;
  projected_apr: number;
  epoch_end: string;
  creator_earnings_next30d: number;
}

export interface BorrowingTerms {
  maxBorrowable: number;
  borrowAmount: number;
  interestRate: number;
  repaymentRate: number;
  dailyRepayment: number;
  daysToRepay: number;
  totalOwed: number;
}

/**
 * Calculate borrowing terms for a creator based on their weekly earnings and desired borrow percentage
 * This is the SINGLE SOURCE OF TRUTH for all borrowing calculations
 */
export const calculateBorrowingTerms = (
  weeklyEarnings: number, 
  borrowPercentage: number
): BorrowingTerms => {
  const maxBorrowable = weeklyEarnings * 2;
  const borrowAmount = borrowPercentage === 0 ? 0 : maxBorrowable * (borrowPercentage / 100);
  
  if (borrowAmount === 0) {
    return {
      maxBorrowable,
      borrowAmount: 0,
      interestRate: 0,
      repaymentRate: 0,
      dailyRepayment: 0,
      daysToRepay: 0,
      totalOwed: 0
    };
  }
  
  // Interest rate calculation: 50% base + up to 40% utilization premium = 50-90% APR
  const baseRate = 50;
  const maxRate = 90;
  const utilizationPremium = (borrowPercentage / 100) * (maxRate - baseRate);
  const interestRate = baseRate + utilizationPremium;
  
  // Repayment rate tiers based on loan size
  let repaymentRate;
  if (borrowPercentage <= 50) {
    repaymentRate = 50; // 50% of daily earnings
  } else if (borrowPercentage <= 75) {
    repaymentRate = 75; // 75% of daily earnings
  } else {
    repaymentRate = 100; // 100% of daily earnings
  }
  
  // Calculate repayment schedule
  const dailyEarnings = weeklyEarnings / 7;
  const dailyRepayment = dailyEarnings * (repaymentRate / 100);
  
  // Calculate total owed including interest
  const estimatedDays = Math.ceil(borrowAmount / dailyRepayment);
  const weeksForLoan = estimatedDays / 7;
  const weeklyRate = interestRate / 52;
  const actualInterestRate = (weeklyRate / 100) * weeksForLoan;
  const totalOwed = borrowAmount * (1 + actualInterestRate);
  
  const daysToRepay = Math.ceil(totalOwed / dailyRepayment);
  
  return {
    maxBorrowable,
    borrowAmount,
    interestRate,
    repaymentRate,
    dailyRepayment,
    daysToRepay,
    totalOwed
  };
};

/**
 * Check if a borrowing request is valid given current pool state
 */
export const validateBorrowingRequest = (
  borrowAmount: number,
  poolData: PoolData | null,
  creators: Creator[]
): { isValid: boolean; reason?: string } => {
  if (!poolData) {
    return { isValid: false, reason: "Pool data not available" };
  }

  // Calculate total currently borrowed
  const totalBorrowed = creators
    .filter(c => c.activeLoan)
    .reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);

  // Available liquidity is TVL minus already borrowed funds
  const availableLiquidity = poolData.tvl_usdc - totalBorrowed;

  if (borrowAmount > availableLiquidity) {
    return { 
      isValid: false, 
      reason: `Insufficient liquidity. Available: $${availableLiquidity.toLocaleString()}, Requested: $${borrowAmount.toLocaleString()}` 
    };
  }

  return { isValid: true };
};

/**
 * FIXED: Calculate LP APR based on borrower rates and pool utilization
 * Returns percentage as a number (e.g., 63 for 63% APR) - PROPER FORMAT
 */
export const calculateLPAPR = (
  poolData: PoolData | null, 
  creators: Creator[]
): number => {
  console.log('🔍 LP APR Calculation Start:', {
    hasPoolData: !!poolData,
    poolTVL: poolData?.tvl_usdc || 'N/A',
    creatorsCount: creators.length,
    creatorsWithLoans: creators.filter(c => c.activeLoan).length
  });

  if (!poolData || poolData.tvl_usdc === 0) {
    console.log('📊 LP APR: No pool data, returning base rate 8.5');
    return 8.5;
  }
  
  const activeCreators = creators.filter(c => c.activeLoan);
  if (activeCreators.length === 0) {
    console.log('📊 LP APR: No active loans, returning base rate 8.5');
    return 8.5;
  }
  
  // Calculate weighted average borrower APR
  const totalBorrowed = activeCreators.reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);
  
  if (totalBorrowed === 0) {
    console.log('📊 LP APR: Total borrowed is 0, returning base rate 8.5');
    return 8.5;
  }
  
  const weightedBorrowerAPR = activeCreators.reduce((sum, c) => {
    const loanAmount = c.activeLoan?.amount || 0;
    const weight = loanAmount / totalBorrowed;
    const borrowerAPR = c.activeLoan?.interestRate || 65;
    return sum + (borrowerAPR * weight);
  }, 0);
  
  // Pool utilization ratio
  const utilization = totalBorrowed / poolData.tvl_usdc;
  
  // LP APR = (Borrower APR × Utilization × Protocol Take Rate)
  const protocolTakeRate = 0.90; // LPs get 90% of borrower interest
  const lpAPR = weightedBorrowerAPR * utilization * protocolTakeRate;
  
  console.log('📊 LP APR Calculation:', {
    activeCreators: activeCreators.length,
    totalBorrowed: totalBorrowed.toLocaleString(),
    poolTVL: poolData.tvl_usdc.toLocaleString(),
    weightedBorrowerAPR: weightedBorrowerAPR.toFixed(1),
    utilization: (utilization * 100).toFixed(1) + '%',
    protocolTakeRate: (protocolTakeRate * 100) + '%',
    finalLPAPR: lpAPR.toFixed(1),
    calculation: `${weightedBorrowerAPR.toFixed(1)} × ${(utilization * 100).toFixed(1)}% × 90% = ${lpAPR.toFixed(1)}`
  });
  
  // Return the calculated LP APR as number (minimum 8.5)
  return Math.max(Math.round(lpAPR * 10) / 10, 8.5);
};

/**
 * FIXED: Calculate monthly yield for LPs based on deposit amount and current APR
 */
export const calculateMonthlyYield = (
  depositAmount: number,
  poolData: PoolData | null,
  creators: Creator[]
): number => {
  const apr = calculateLPAPR(poolData, creators);
  const monthlyYield = (depositAmount * (apr / 100)) / 12;
  
  console.log('💰 Monthly Yield Calculation:', {
    depositAmount: depositAmount.toLocaleString(),
    annualAPR: apr.toFixed(1),
    monthlyYield: monthlyYield.toFixed(2)
  });
  
  return monthlyYield;
};

/**
 * FIXED: Calculate weighted average creator borrowing rate for dashboard display
 * Returns percentage as a number (e.g., 70 for 70%) - PROPER FORMAT
 */
export const calculateAverageCreatorBorrowRate = (creators: Creator[]): number => {
  const creatorsWithLoans = creators.filter(c => c.activeLoan);
  
  if (creatorsWithLoans.length === 0) {
    console.log('📈 Creator Borrow Rate: No active loans, returning default 70');
    return 70; // Default 70% APR
  }
  
  const totalBorrowed = creatorsWithLoans.reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);
  
  if (totalBorrowed === 0) {
    console.log('📈 Creator Borrow Rate: Total borrowed is 0, returning default 70');
    return 70;
  }
  
  const weightedInterestSum = creatorsWithLoans.reduce((sum, c) => {
    const loanAmount = c.activeLoan?.amount || 0;
    const interestRate = c.activeLoan?.interestRate || 70;
    return sum + (loanAmount * interestRate);
  }, 0);
  
  const averageAPR = weightedInterestSum / totalBorrowed;
  
  console.log('📈 Creator Borrow Rate Calculation:', {
    creatorsWithLoans: creatorsWithLoans.length,
    totalBorrowed: totalBorrowed.toLocaleString(),
    weightedInterestSum: weightedInterestSum.toLocaleString(),
    averageAPR: averageAPR.toFixed(1)
  });
  
  // Return as number (e.g., 70 for 70%)
  return Math.round(averageAPR * 10) / 10;
};

/**
 * Calculate available liquidity in the pool
 */
export const calculateAvailableLiquidity = (
  poolData: PoolData | null,
  creators: Creator[]
): number => {
  if (!poolData) return 0;
  
  const totalBorrowed = creators
    .filter(c => c.activeLoan)
    .reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0);
  
  return Math.max(0, poolData.tvl_usdc - totalBorrowed);
};

/**
 * Generate enhanced creators with random active loans for initial demo data
 * This ensures consistent loan generation across the app and guarantees some active loans for realistic LP APR
 */
export const generateDemoCreatorsWithLoans = (baseCreators: any[]): Creator[] => {
  const enhancedCreators = baseCreators.map((creator, index) => {
    // FIXED: Give more creators loans for better demo experience
    // Ensure first 5 active creators get loans, then 40% chance for others
    const shouldHaveLoan = creator.status === 'active' && (
      (index < 5) || // First 5 active creators always get loans
      Math.random() > 0.6 // 40% chance for others (was 30%)
    );
    
    if (shouldHaveLoan) {
      const weeklyEarnings = creator.fees7d_usd;
      const utilizationPct = Math.floor(Math.random() * 60) + 25; // 25-85% utilization
      
      // Use the centralized borrowing calculations
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
      };
    }
    return creator;
  });

  // Log the loan generation results for debugging
  const activeLoans = enhancedCreators.filter(c => c.activeLoan);
  console.log('🎯 Demo Loan Generation:', {
    totalCreators: enhancedCreators.length,
    activeCreators: enhancedCreators.filter(c => c.status === 'active').length,
    creatorsWithLoans: activeLoans.length,
    totalBorrowedAmount: activeLoans.reduce((sum, c) => sum + (c.activeLoan?.amount || 0), 0),
    avgInterestRate: activeLoans.length > 0 
      ? (activeLoans.reduce((sum, c) => sum + (c.activeLoan?.interestRate || 0), 0) / activeLoans.length).toFixed(1)
      : 'N/A'
  });

  return enhancedCreators;
};
