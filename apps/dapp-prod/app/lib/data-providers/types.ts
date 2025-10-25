export interface CursorParams {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
  force?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  cursor?: string;
  etag?: string;
  fromCache: boolean;
}

export interface PoolOverview {
  tvl_usdc: number;
  epoch_end: string;
  creator_earnings_next30d: number;
}

export interface CreatorSummary {
  wallet: string;
  fees7d_usd: number;
  status: string;
  est_beta_next30d_usd: number;
  beta_pct: number;
  alpha_pct: number;
  gamma_pct: number;
  activeLoan?: {
    amount: number;
    maxBorrowable: number;
    utilizationPct: number;
    dailyRepaymentRate: number;
    interestRate: number;
    daysRemaining: number;
  } | null;
}

export interface MarketSummary {
  market: string;
  pump_mint: string;
  creator_vault: string;
  sy_mint: string;
  pt_mint: string;
  yt_mint: string;
  maturity_ts: number;
  pt_supply: number;
  yt_supply: number;
  implied_apy: number;
  status: 'active' | 'matured' | 'settled';
}

export interface MarketDetail {
  summary: MarketSummary;
  total_fees_distributed_sol: number;
  fee_index: number;
  tvl_sol: number;
  last_yield_slot: number;
  updated_at: string;
}

export interface UserPosition {
  deposited_usdc: number;
  cyt_tokens: number;
  estimated_yield: number;
  additional_deposits: number;
}

export interface UserPortfolio {
  wallet: string;
  usdc_balance: number;
  cyt_balance: number;
  deposits: any[];
  positions: any[];
}

export interface LoanHistoryItem {
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

export interface RewardsSummary {
  total: number;
  claimable: number;
  staked: number;
}

export interface RewardPosition {
  id: string;
  pool: string;
  amount: number;
  apr: number;
  claimed: number;
  updatedAt: string;
  paused?: boolean;
  attnMint?: string;
  sAttnMint?: string;
  attnVault?: string;
}

export interface CreatorGovernance {
  creator_vault: string;
  pump_mint: string;
  admin: string;
  sol_rewards_bps: number;
  paused: boolean;
  sy_mint: string;
  advance_enabled: boolean;
}

export interface RewardsGovernance {
  rewards_pool: string;
  creator_vault: string;
  admin: string;
  allowed_funder: string;
  reward_bps: number;
  paused: boolean;
}

export interface StableVaultGovernance {
  stable_vault: string;
  admin: string;
  keeper_authority: string;
  authority_seed: string;
  share_mint: string;
  stable_mint: string;
  pending_sol_lamports: number;
  paused: boolean;
  last_sweep_id: number;
  last_conversion_id: number;
}

export interface GovernanceState {
  creator_vaults: CreatorGovernance[];
  rewards_pools: RewardsGovernance[];
  stable_vault?: StableVaultGovernance;
}

export interface AdvanceQuote {
  quote_id: string;
  market: string;
  size_yt: number;
  price_usdc: number;
  implied_apr: number;
  est_slippage: number;
  route: 'rfq' | 'amm';
  side: 'sell' | 'buyback';
  expires_at: string;
  cursor: string;
}

export interface AdvanceCapsSnapshot {
  wallet_limit_usdc?: number;
  wallet_used_usdc: number;
  wallet_remaining_usdc?: number;
  epoch_limit_usdc?: number;
  epoch_used_usdc: number;
  epoch_remaining_usdc?: number;
}

export interface AdvanceTrade {
  quote_id: string;
  route: 'rfq' | 'amm';
  side: 'sell' | 'buyback';
  price_usdc: number;
  size_yt: number;
  expires_at: string;
  ttl_seconds: number;
  settlement: {
    lp_wallet: string;
  };
  caps: AdvanceCapsSnapshot;
}

export interface DataProvider {
  getPoolOverview(params?: { signal?: AbortSignal }): Promise<PoolOverview>;
  getCreators(params?: CursorParams): Promise<PaginatedResponse<CreatorSummary>>;
  getUserPortfolio(wallet: string, params?: { signal?: AbortSignal }): Promise<UserPortfolio>;
  getLoanHistory(wallet: string, params?: CursorParams): Promise<PaginatedResponse<LoanHistoryItem>>;
  getRewards(params?: CursorParams): Promise<PaginatedResponse<RewardPosition>>;
  getRewardsSummary(params?: { signal?: AbortSignal }): Promise<RewardsSummary>;
  getMarkets(params?: { signal?: AbortSignal }): Promise<MarketSummary[]>;
  getMarket(market: string, params?: { signal?: AbortSignal }): Promise<MarketDetail>;
  getGovernance(params?: { signal?: AbortSignal }): Promise<GovernanceState>;
  getYtQuote(
    market: string,
    params: { size: number; maturity: number; side?: 'sell' | 'buyback'; signal?: AbortSignal }
  ): Promise<AdvanceQuote>;
  postSellYt(payload: { quoteId: string; wallet: string }): Promise<AdvanceTrade>;
  postBuybackYt(payload: { quoteId: string; wallet: string }): Promise<AdvanceTrade>;
}
