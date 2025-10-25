import { api, ApiError } from '../api';
import {
  CursorParams,
  DataProvider,
  LoanHistoryItem,
  PaginatedResponse,
  PoolOverview,
  RewardPosition,
  RewardsSummary,
  UserPortfolio,
  CreatorSummary,
  GovernanceState,
} from './types';

type ISODateTimeString = string;

interface OverviewResponse {
  total_creator_vaults: number;
  total_markets: number;
  total_fees_collected_sol: number;
  attnusd_supply: number;
  attnusd_nav: number;
  updated_at: ISODateTimeString;
}

interface AttnUsdResponse {
  total_supply: number;
  nav_sol: number;
  price_per_share: number;
  seven_day_apy: number;
  last_rebalance_slot: number;
  updated_at: ISODateTimeString;
}

type MarketStatus = 'active' | 'matured' | 'settled';

interface MarketSummaryResponse {
  market: string;
  pump_mint: string;
  maturity_ts: number;
  pt_supply: number;
  yt_supply: number;
  implied_apy: number;
  status: MarketStatus;
}

interface PortfolioPositionResponse {
  market: string;
  pt_balance: number;
  yt_balance: number;
  accrued_yield_sol: number;
  last_claimed_slot: number;
}

interface PortfolioResponse {
  wallet: string;
  total_value_sol: number;
  positions: PortfolioPositionResponse[];
  updated_at: ISODateTimeString;
}

interface RewardsListResponse {
  pools: RewardPosition[];
  next_cursor?: string;
}

const toDisplayAmount = (solAmount: number): number =>
  Math.round(solAmount * 1_000_000) / 1_000_000;

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

interface BackendRewardSummary {
  pool: string;
  creator_vault: string;
  reward_bps: number;
  total_staked_attnusd: number;
  sol_per_share: number;
  pending_rewards_sol: number;
  total_rewards_sol: number;
  admin: string;
  allowed_funder: string;
  treasury_balance_sol: number;
  paused: boolean;
   attn_mint: string;
   s_attn_mint: string;
   attn_vault: string;
  updated_at: ISODateTimeString;
}

interface RewardsEndpointResponse {
  pools: BackendRewardSummary[];
  next_cursor?: string;
}

export class BridgeDataProvider implements DataProvider {
  private readonly etags = new Map<string, string>();
  private readonly cache = new Map<string, unknown>();

  private async fetchJson<T>(path: string): Promise<T> {
    const etag = this.etags.get(path);
    const response = await api<T>(path, etag);
    if (!response.notModified) {
      this.cache.set(path, response.data);
      if (response.etag) {
        this.etags.set(path, response.etag);
      }
      return response.data;
    }
    return this.cache.get(path) as T;
  }

  private mapMarketsToCreators(markets: MarketSummaryResponse[]): CreatorSummary[] {
    return markets.map((market) => {
      const annualFeesUsd = toDisplayAmount(market.pt_supply * market.implied_apy);
      const weeklyFeesUsd = annualFeesUsd / 52;
      return {
        wallet: market.market,
        fees7d_usd: Number(weeklyFeesUsd.toFixed(2)),
        status: market.status === 'active' ? 'active' : market.status,
        est_beta_next30d_usd: Number((weeklyFeesUsd * (30 / 7)).toFixed(2)),
        beta_pct: 0.15,
        alpha_pct: 0.7,
        gamma_pct: 0.15,
        activeLoan: null,
      };
    });
  }

  async getPoolOverview(): Promise<PoolOverview> {
    const [overview, attnusd] = await Promise.all([
      this.fetchJson<OverviewResponse>('/v1/overview'),
      this.fetchJson<AttnUsdResponse>('/v1/attnusd'),
    ]);

    return {
      tvl_usdc: Number(toDisplayAmount(attnusd.nav_sol).toFixed(6)),
      epoch_end: overview.updated_at,
      creator_earnings_next30d: Number(
        (toDisplayAmount(overview.total_fees_collected_sol) / 12).toFixed(6),
      ),
    };
  }

  async getCreators(params?: CursorParams): Promise<PaginatedResponse<CreatorSummary>> {
    const markets = await this.fetchJson<MarketSummaryResponse[]>('/v1/markets');
    const creators = this.mapMarketsToCreators(markets);
    return paginate(creators, params);
  }

  async getUserPortfolio(wallet: string): Promise<UserPortfolio> {
    try {
      const portfolio = await this.fetchJson<PortfolioResponse>(`/v1/portfolio/${wallet}`);
      const positions = portfolio.positions.map((position) => ({
        deposited_usdc: toDisplayAmount(position.pt_balance),
        cyt_tokens: position.yt_balance,
        estimated_yield: toDisplayAmount(position.accrued_yield_sol),
        additional_deposits: 0,
      }));

      return {
        wallet: wallet || portfolio.wallet,
        usdc_balance: toDisplayAmount(portfolio.total_value_sol),
        cyt_balance: positions.reduce((sum, pos) => sum + pos.cyt_tokens, 0),
        deposits: [],
        positions,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return {
          wallet,
          usdc_balance: 0,
          cyt_balance: 0,
          deposits: [],
          positions: [],
        };
      }
      throw error;
    }
  }

  async getLoanHistory(_wallet: string, _params?: CursorParams): Promise<PaginatedResponse<LoanHistoryItem>> {
    return {
      items: [],
      fromCache: false,
    };
  }

  async getRewards(params?: CursorParams): Promise<PaginatedResponse<RewardPosition>> {
    const limit = params?.limit ?? 20;
    const cursor = params?.cursor ? `&cursor=${encodeURIComponent(params.cursor)}` : '';
    const response = await this.fetchJson<RewardsEndpointResponse>(`/v1/rewards?limit=${limit}${cursor}`);

    const items = response.pools.map((pool): RewardPosition => ({
      id: pool.pool,
      pool: pool.pool,
      amount: pool.total_staked_attnusd,
      apr: pool.sol_per_share,
      claimed: pool.total_rewards_sol,
      updatedAt: pool.updated_at,
      paused: pool.paused,
      attnMint: pool.attn_mint,
      sAttnMint: pool.s_attn_mint,
      attnVault: pool.attn_vault,
    }));

    return {
      items,
      cursor: response.next_cursor,
      fromCache: false,
    };
  }

  async getRewardsSummary(): Promise<RewardsSummary> {
    const response = await this.fetchJson<RewardsEndpointResponse>('/v1/rewards?limit=100');
    const totals = response.pools.reduce(
      (acc, pool) => {
        acc.total += pool.total_staked_attnusd;
        acc.claimable += pool.pending_rewards_sol;
        acc.staked += pool.total_staked_attnusd;
        return acc;
      },
      { total: 0, claimable: 0, staked: 0 },
    );
    return totals;
  }

  async getGovernance(): Promise<GovernanceState> {
    return this.fetchJson<GovernanceState>('/v1/governance');
  }
}
