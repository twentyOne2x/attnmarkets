import {
  calculateBorrowingTerms,
  calculateMonthlyYield,
  calculateLPAPR,
  type Creator as CalcCreator,
  type PoolData as CalcPoolData,
} from '../../utils/borrowingCalculations';
import { loadCreators, loadPoolData, loadUserData } from '../mock-client';
import {
  AdvanceQuote,
  AdvanceTrade,
  CreatorSummary,
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

const DEMO_MARKET_SUMMARY: MarketSummary = {
  market: 'MarketDemo1111111111111111111111111111111',
  pump_mint: 'PumpMintDemo1111111111111111111111111111111',
  creator_vault: 'CreatorVaultDemo1111111111111111111111111111',
  creator_authority: 'AuthorityDemo1111111111111111111111111111',
  sy_mint: 'SyMintDemo11111111111111111111111111111111',
  pt_mint: 'PtMintDemo11111111111111111111111111111111',
  yt_mint: 'YtMintDemo11111111111111111111111111111111',
  maturity_ts: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 15,
  pt_supply: 125_000,
  yt_supply: 125_000,
  implied_apy: 0.18,
  status: 'active',
  admin: 'AdminDemo1111111111111111111111111111111',
};

const DEMO_MARKET_DETAIL: MarketDetail = {
  summary: { ...DEMO_MARKET_SUMMARY },
  total_fees_distributed_sol: 420.5,
  fee_index: 1.02,
  tvl_sol: 95_000,
  last_yield_slot: 235_000_000,
  updated_at: new Date().toISOString(),
};

class DemoDataProvider implements DataProvider {
  private lastQuotes = new Map<string, AdvanceQuote>();

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

  async getMarkets(): Promise<MarketSummary[]> {
    return [{ ...DEMO_MARKET_SUMMARY }];
  }

  async getMarket(_market: string, _params?: { signal?: AbortSignal }): Promise<MarketDetail> {
    return {
      ...DEMO_MARKET_DETAIL,
      summary: { ...DEMO_MARKET_SUMMARY },
      updated_at: new Date().toISOString(),
    };
  }

  async getYtQuote(
    _market: string,
    params: { size: number; maturity: number; side?: 'sell' | 'buyback'; signal?: AbortSignal }
  ): Promise<AdvanceQuote> {
    if (params.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const quoteId = `demo-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30_000).toISOString();
    const priceMultiplier = params.side === 'buyback' ? 1.015 : 0.985;
    const price = Number((params.size * priceMultiplier).toFixed(6));
    const quote: AdvanceQuote = {
      quote_id: quoteId,
      market: DEMO_MARKET_SUMMARY.market,
      size_yt: params.size,
      price_usdc: price,
      implied_apr: DEMO_MARKET_SUMMARY.implied_apy,
      est_slippage: params.side === 'buyback' ? 0.004 : 0.003,
      route: 'rfq',
      side: params.side ?? 'sell',
      expires_at: expiresAt,
      cursor: quoteId,
    };
    this.lastQuotes.set(quoteId, quote);
    return quote;
  }

  async postSellYt(payload: { quoteId: string; wallet: string }): Promise<AdvanceTrade> {
    return this.buildDemoTrade(payload.quoteId, 'sell');
  }

  async postBuybackYt(payload: { quoteId: string; wallet: string }): Promise<AdvanceTrade> {
    return this.buildDemoTrade(payload.quoteId, 'buyback');
  }

  private buildDemoTrade(quoteId: string, side: 'sell' | 'buyback'): AdvanceTrade {
    const quote = this.lastQuotes.get(quoteId);
    const fallbackSize = 100;
    const size = quote?.size_yt ?? fallbackSize;
    const price = quote?.price_usdc ?? (side === 'buyback' ? size * 1.02 : size * 0.98);
    const trade: AdvanceTrade = {
      quote_id: quoteId,
      route: 'rfq',
      side,
      price_usdc: Number(price.toFixed(6)),
      size_yt: size,
      expires_at: quote?.expires_at ?? new Date(Date.now() + 30_000).toISOString(),
      ttl_seconds: 30,
      settlement: {
        lp_wallet: 'DemoLpWallet111111111111111111111111111111',
      },
      caps: {
        wallet_used_usdc: side === 'sell' ? Number(price.toFixed(2)) : 0,
        epoch_used_usdc: side === 'sell' ? Number((price * 2).toFixed(2)) : 0,
        wallet_limit_usdc: 25_000,
        wallet_remaining_usdc: 25_000 - Number(price.toFixed(2)),
        epoch_limit_usdc: 250_000,
        epoch_remaining_usdc: 250_000 - Number((price * 2).toFixed(2)),
      },
    };
    this.lastQuotes.delete(quoteId);
    return trade;
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

  async getLoanHistory(_wallet: string, _params?: CursorParams): Promise<PaginatedResponse<LoanHistoryItem>> {
    return { items: [], fromCache: false };
  }

  async getRewards(_params?: CursorParams): Promise<PaginatedResponse<RewardPosition>> {
    return { items: [], fromCache: false };
  }

  async getRewardsSummary(): Promise<RewardsSummary> {
    return { total: 0, claimable: 0, staked: 0 };
  }

  async getGovernance(_params?: { signal?: AbortSignal }): Promise<GovernanceState> {
    return {
      creator_vaults: [
        {
          creator_vault: DEMO_MARKET_SUMMARY.creator_vault,
          pump_mint: DEMO_MARKET_SUMMARY.pump_mint,
          admin: 'AdminDemo11111111111111111111111111111111',
          sol_rewards_bps: 300,
          paused: false,
          sy_mint: DEMO_MARKET_SUMMARY.sy_mint,
          advance_enabled: true,
        },
      ],
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
