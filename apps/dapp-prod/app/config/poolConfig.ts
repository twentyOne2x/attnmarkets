// apps/dapp/app/config/poolConfig.ts

export interface PoolConfig {
    targetAvailableLiquidity: number;
    minPoolUtilization: number;
    maxPoolUtilization: number;
    defaultUserBalance: number;
    defaultUserLPPosition: number;
  }
  
  export const POOL_CONFIG: PoolConfig = {
    // Target available liquidity for creators to borrow
    targetAvailableLiquidity: 250000, // $250K
    
    // Pool utilization bounds (what % of pool can be borrowed)
    minPoolUtilization: 0.1, // At least 10% utilization for realistic APR
    maxPoolUtilization: 0.8, // Max 80% utilization for safety
    
    // User seeding defaults
    defaultUserBalance: 10000, // $10K USDC balance
    defaultUserLPPosition: 5000, // $5K deposited
  };
  
  /**
   * Calculate the optimal pool TVL to ensure target available liquidity
   */
  export const calculateOptimalPoolTVL = (
    targetAvailableLiquidity: number,
    totalBorrowed: number,
    config: PoolConfig = POOL_CONFIG
  ): number => {
    // Pool TVL = Total Borrowed + Target Available Liquidity
    const baseTVL = totalBorrowed + targetAvailableLiquidity;
    
    // Ensure we meet minimum utilization if there are active loans
    if (totalBorrowed > 0) {
      const minTVLForUtilization = totalBorrowed / config.maxPoolUtilization;
      return Math.max(baseTVL, minTVLForUtilization);
    }
    
    return baseTVL;
  };
  
  /**
   * Validate pool configuration and provide warnings
   */
  export const validatePoolConfig = (
    poolTVL: number,
    totalBorrowed: number,
    config: PoolConfig = POOL_CONFIG
  ): {
    isValid: boolean;
    warnings: string[];
    availableLiquidity: number;
    utilization: number;
  } => {
    const availableLiquidity = Math.max(0, poolTVL - totalBorrowed);
    const utilization = poolTVL > 0 ? totalBorrowed / poolTVL : 0;
    
    const warnings: string[] = [];
    let isValid = true;
    
    if (availableLiquidity < config.targetAvailableLiquidity) {
      warnings.push(`Available liquidity ($${availableLiquidity.toLocaleString()}) is below target ($${config.targetAvailableLiquidity.toLocaleString()})`);
      isValid = false;
    }
    
    if (utilization > config.maxPoolUtilization) {
      warnings.push(`Pool utilization (${(utilization * 100).toFixed(1)}%) exceeds maximum (${(config.maxPoolUtilization * 100).toFixed(1)}%)`);
    }
    
    if (totalBorrowed > 0 && utilization < config.minPoolUtilization) {
      warnings.push(`Pool utilization (${(utilization * 100).toFixed(1)}%) is below minimum (${(config.minPoolUtilization * 100).toFixed(1)}%)`);
    }
    
    return {
      isValid,
      warnings,
      availableLiquidity,
      utilization
    };
  };