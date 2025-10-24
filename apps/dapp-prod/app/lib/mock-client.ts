// Mock client for loading data

export interface Creator {
    wallet: string;
    fees7d_usd: number;
    beta_pct: number;
    alpha_pct: number;
    gamma_pct: number;
    status: string;
    est_beta_next30d_usd: number;
  }
  
  export interface PoolData {
    tvl_usdc: number;
    projected_apr: number;
    epoch_end: string;
    beta_total_usd_next30d: number;
  }
  
  export interface UserData {
    wallet: string;
    usdc_balance: number;
    cyt_balance: number;
    deposits: any[];
    positions: any[];
  }
  
  export const loadCreators = async (): Promise<Creator[]> => {
    const response = await fetch('/mock/creators.json');
    return response.json();
  };
  
  export const loadPoolData = async (): Promise<PoolData> => {
    const response = await fetch('/mock/lp_pool.json');
    return response.json();
  };
  
  export const loadUserData = async (): Promise<UserData> => {
    const response = await fetch('/mock/user.json');
    return response.json();
  };