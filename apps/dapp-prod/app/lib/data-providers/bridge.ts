import { api, ApiError } from '../api';
import {
  AdvanceQuote,
  AdvanceTrade,
  CursorParams,
  DataProvider,
  LoanHistoryItem,
  MarketDetail,
  MarketSummary,
  PaginatedResponse,
  PoolOverview,
  RewardPosition,
  RewardsSummary,
  UserPortfolio,
  CreatorSummary,
  GovernanceState,
} from './types';
import type { CreatorMetrics } from '../../utils/borrowingCalculations';

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
  creator_vault: string;
  creator_authority: string;
  sy_mint: string;
  pt_mint: string;
  yt_mint: string;
  maturity_ts: number;
  pt_supply: number;
  yt_supply: number;
  implied_apy: number;
  status: MarketStatus;
  admin: string;
}

interface MarketDetailResponse {
  summary: MarketSummaryResponse;
  total_fees_distributed_sol: number;
  fee_index: number;
  tvl_sol: number;
  last_yield_slot: number;
  updated_at: ISODateTimeString;
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
  private readonly cacheTimestamps = new Map<string, number>();

  private async fetchJson<T>(path: string, init?: RequestInit, cacheKey?: string, ttlMs?: number): Promise<T> {
    const key = cacheKey ?? path;
    let etag = this.etags.get(key);
    const lastFetched = this.cacheTimestamps.get(key);
    if (ttlMs && etag && lastFetched && Date.now() - lastFetched > ttlMs) {
      this.etags.delete(key);
      this.cacheTimestamps.delete(key);
      etag = undefined;
    }

    const response = await api<T>(path, etag, init, { maxRetries: 2 });
    if (!response.notModified) {
      this.cache.set(key, response.data);
      if (response.etag) {
        this.etags.set(key, response.etag);
      } else {
        this.etags.delete(key);
      }
      this.cacheTimestamps.set(key, Date.now());
      return response.data;
    }

    if (this.cache.has(key)) {
      if (ttlMs) {
        this.cacheTimestamps.set(key, Date.now());
      }
      return this.cache.get(key) as T;
    }

    // 304 without cached payload implies the upstream evicted our content. Retry without the ETag.
    this.etags.delete(key);
    this.cacheTimestamps.delete(key);
    const retry = await api<T>(path, undefined, init, { maxRetries: 1 });
    if (retry.notModified) {
      throw new Error(`Cache miss for ${key} after retrying without ETag`);
    }

    this.cache.set(key, retry.data);
    if (retry.etag) {
      this.etags.set(key, retry.etag);
    }
    this.cacheTimestamps.set(key, Date.now());
    return retry.data;
  }

  private buildCreatorMetrics(fees7dUsd: number, estBetaNext30dUsd: number): CreatorMetrics {
    const recent14dTotal = Math.max(0, fees7dUsd * 2);
    const recent14dAverage = recent14dTotal / 14;
    const totalEstimate = Math.max(fees7dUsd, estBetaNext30dUsd);
    const leaderboardBase = totalEstimate + recent14dTotal;
    const leaderboardPoints = Math.round(leaderboardBase * 1.25);
    return {
      totalFeesUsd: Number(totalEstimate.toFixed(2)),
      recent14dTotalUsd: Number(recent14dTotal.toFixed(2)),
      recent14dAverageUsd: Number(recent14dAverage.toFixed(2)),
      leaderboardPoints,
    };
  }

  private mapMarketsToCreators(markets: MarketSummary[]): CreatorSummary[] {
    return markets.map((market) => {
      const annualFeesUsd = toDisplayAmount(market.pt_supply * market.implied_apy);
      const weeklyFeesUsd = annualFeesUsd / 52;
      const estBetaNext30dUsd = Number((weeklyFeesUsd * (30 / 7)).toFixed(2));
      return {
        wallet: market.creator_authority || market.market,
        fees7d_usd: Number(weeklyFeesUsd.toFixed(2)),
        status: market.status === 'active' ? 'active' : market.status,
        est_beta_next30d_usd: estBetaNext30dUsd,
        beta_pct: 0.15,
        alpha_pct: 0.7,
        gamma_pct: 0.15,
        creator_vault: market.creator_vault,
        market: market.market,
        admin: market.admin,
        pump_mint: market.pump_mint,
        metrics: this.buildCreatorMetrics(weeklyFeesUsd, estBetaNext30dUsd),
        activeLoan: null,
      };
    });
  }

  private normalizeMarketSummary(source: MarketSummaryResponse): MarketSummary {
    const status: MarketSummary['status'] =
      source.status === 'settled'
        ? 'settled'
        : source.status === 'matured'
        ? 'matured'
        : 'active';
    return {
      market: source.market,
      pump_mint: source.pump_mint,
      creator_vault: source.creator_vault,
      creator_authority: source.creator_authority,
      sy_mint: source.sy_mint,
      pt_mint: source.pt_mint,
      yt_mint: source.yt_mint,
      maturity_ts: source.maturity_ts,
      pt_supply: source.pt_supply,
      yt_supply: source.yt_supply,
      implied_apy: source.implied_apy,
      status,
      admin: source.admin,
    };
  }

  async getPoolOverview(): Promise<PoolOverview> {
    const [overview, attnusd] = await Promise.all([
      this.fetchJson<OverviewResponse>('/v1/overview', undefined, '/v1/overview', 30_000),
      this.fetchJson<AttnUsdResponse>('/v1/attnusd', undefined, '/v1/attnusd', 30_000),
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
    const markets = await this.getMarkets({ signal: params?.signal });
    const creators = this.mapMarketsToCreators(markets);
    return paginate(creators, params);
  }

  async getMarkets(params?: { signal?: AbortSignal }): Promise<MarketSummary[]> {
    const markets = await this.fetchJson<MarketSummaryResponse[]>(
      '/v1/markets',
      { signal: params?.signal },
      '/v1/markets',
      30_000,
    );
    return markets.map((market) => this.normalizeMarketSummary(market));
  }

  async getMarket(market: string, params?: { signal?: AbortSignal }): Promise<MarketDetail> {
    const detail = await this.fetchJson<MarketDetailResponse>(
      `/v1/markets/${market}`,
      { signal: params?.signal },
      `/v1/markets/${market}`,
      15_000,
    );
    return {
      summary: this.normalizeMarketSummary(detail.summary),
      total_fees_distributed_sol: detail.total_fees_distributed_sol,
      fee_index: detail.fee_index,
      tvl_sol: detail.tvl_sol,
      last_yield_slot: detail.last_yield_slot,
      updated_at: detail.updated_at,
    };
  }

  async getUserPortfolio(wallet: string): Promise<UserPortfolio> {
    try {
      const portfolio = await this.fetchJson<PortfolioResponse>(
        `/v1/portfolio/${wallet}`,
        undefined,
        `/v1/portfolio/${wallet}`,
        15_000,
      );
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
    const response = await this.fetchJson<RewardsEndpointResponse>(
      `/v1/rewards?limit=${limit}${cursor}`,
      undefined,
      `/v1/rewards?limit=${limit}${cursor}`,
      30_000,
    );

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
    const response = await this.fetchJson<RewardsEndpointResponse>(
      '/v1/rewards?limit=100',
      undefined,
      '/v1/rewards?limit=100',
      30_000,
    );
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

  async getYtQuote(
    market: string,
    params: { size: number; maturity: number; side?: 'sell' | 'buyback'; signal?: AbortSignal }
  ): Promise<AdvanceQuote> {
    const query = new URLSearchParams({
      size: params.size.toString(),
      maturity: params.maturity.toString(),
    });
    if (params.side) {
      query.set('side', params.side);
    }
    const path = `/v1/markets/${market}/yt-quote?${query.toString()}`;
    return this.fetchJson<AdvanceQuote>(path, { signal: params.signal }, path, 10_000);
  }

  async postSellYt(payload: { quoteId: string; wallet: string }): Promise<AdvanceTrade> {
    const response = await api<AdvanceTrade>(
      '/v1/rfq/yt-sell',
      undefined,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quote_id: payload.quoteId, wallet: payload.wallet }),
      }
    );
    return response.data;
  }

  async postBuybackYt(payload: { quoteId: string; wallet: string }): Promise<AdvanceTrade> {
    const response = await api<AdvanceTrade>(
      '/v1/rfq/yt-buyback',
      undefined,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quote_id: payload.quoteId, wallet: payload.wallet }),
      }
    );
    return response.data;
  }

  async getGovernance(params?: { signal?: AbortSignal }): Promise<GovernanceState> {
    return this.fetchJson<GovernanceState>(
      '/v1/governance',
      { signal: params?.signal },
      '/v1/governance',
      10_000,
    );
  }
}
