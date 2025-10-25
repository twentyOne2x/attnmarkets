import {
  calculateBorrowingTerms,
  calculateMonthlyYield,
  calculateLPAPR,
  type Creator as CalcCreator,
  type PoolData as CalcPoolData,
} from '../../utils/borrowingCalculations';
import { loadCreators, loadPoolData, loadUserData } from '../mock-client';
import {
  CreatorSummary,
  CursorParams,
  DataProvider,
  LoanHistoryItem,
  PaginatedResponse,
  PoolOverview,
  RewardPosition,
  RewardsSummary,
  UserPortfolio,
  GovernanceState,
} from './types';

const BASE_POOL_TVL = 250_000;

const normalizeCreators = (creators: any[]): (CreatorSummary & CalcCreator)[] => {
  return creators.map((creator) => {
    const weeklyEarnings = creator.fees7d_usd;
    const borrowingTerms = calculateBorrowingTerms(weeklyEarnings, 60);
    return {
      wallet: creator.wallet,
      fees7d_usd: creator.fees7d_usd,
      status: creator.status ?? 'active',
      est_beta_next30d_usd: creator.est_beta_next30d_usd ?? weeklyEarnings * 4.3,
      beta_pct: creator.beta_pct ?? 0.15,
      alpha_pct: creator.alpha_pct ?? 0.7,
      gamma_pct: creator.gamma_pct ?? 0.15,
      activeLoan: {
        amount: borrowingTerms.borrowAmount,
        maxBorrowable: borrowingTerms.maxBorrowable,
        utilizationPct: 60,
        dailyRepaymentRate: borrowingTerms.repaymentRate,
        interestRate: borrowingTerms.interestRate,
        daysRemaining: borrowingTerms.daysToRepay,
      },
    };
  });
};

const paginate = <T>(items: T[], params?: CursorParams): PaginatedResponse<T> => {
  const limit = params?.limit ?? 20;
  if (!params?.cursor) {
    return {
      items: items.slice(0, limit),
      cursor: items.length > limit ? String(limit) : undefined,
      fromCache: false,
    };
  }
  const index = Number(params.cursor);
  const slice = items.slice(index, index + limit);
  return {
    items: slice,
    cursor: items.length > index + limit ? String(index + limit) : undefined,
    fromCache: false,
  };
};

class DemoDataProvider implements DataProvider {
  async getPoolOverview(): Promise<PoolOverview> {
    const [poolData, creators] = await Promise.all([loadPoolData(), loadCreators()]);
    const normalizedCreators = normalizeCreators(creators);
    return {
      tvl_usdc: BASE_POOL_TVL,
      epoch_end: poolData.epoch_end ?? new Date().toISOString(),
      creator_earnings_next30d:
        poolData.beta_total_usd_next30d ?? normalizedCreators.reduce((sum, c) => sum + c.est_beta_next30d_usd, 0),
    };
  }

  async getCreators(params?: CursorParams): Promise<PaginatedResponse<CreatorSummary>> {
    const creators = normalizeCreators(await loadCreators());
    return paginate(creators, params);
  }

  async getUserPortfolio(wallet: string): Promise<UserPortfolio> {
    const [user, poolOverview, creatorsRaw] = await Promise.all([
      loadUserData(),
      this.getPoolOverview(),
      loadCreators(),
    ]);
    const normalizedCreators = normalizeCreators(creatorsRaw) as unknown as CalcCreator[];
    const poolForCalc: CalcPoolData = {
      tvl_usdc: poolOverview.tvl_usdc,
      projected_apr: 0,
      epoch_end: poolOverview.epoch_end,
      creator_earnings_next30d: poolOverview.creator_earnings_next30d,
    };
    const apr = calculateLPAPR(poolForCalc, normalizedCreators);
    return {
      wallet: wallet || user.wallet,
      usdc_balance: user.usdc_balance ?? 10_000,
      cyt_balance: user.cyt_balance ?? 0,
      deposits: user.deposits ?? [],
      positions: [
        {
          deposited_usdc: 0,
          cyt_tokens: 0,
          estimated_yield: calculateMonthlyYield(0, poolForCalc, normalizedCreators),
          apr,
        },
      ],
    } as UserPortfolio;
  }

  async getLoanHistory(): Promise<PaginatedResponse<LoanHistoryItem>> {
    return { items: [], fromCache: false };
  }

  async getRewards(): Promise<PaginatedResponse<RewardPosition>> {
    return { items: [], fromCache: false };
  }

  async getRewardsSummary(): Promise<RewardsSummary> {
    return { total: 0, claimable: 0, staked: 0 };
  }

  async getGovernance(): Promise<GovernanceState> {
    return {
      creator_vaults: [],
      rewards_pools: [],
      stable_vault: {
        stable_vault: 'StableVault111111111111111111111111111111',
        admin: 'Admin1111111111111111111111111111111111',
        keeper_authority: 'Keeper11111111111111111111111111111111',
        authority_seed: 'seed',
        share_mint: 'ShareMint1111111111111111111111111111111',
        stable_mint: 'StableMint111111111111111111111111111111',
        pending_sol_lamports: 0,
        paused: false,
        last_sweep_id: 0,
        last_conversion_id: 0,
      },
    };
  }
}

export const demoDataProvider = new DemoDataProvider();
