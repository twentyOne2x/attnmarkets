import { CursorParams, DataProvider, LoanHistoryItem, PaginatedResponse, PoolOverview, RewardPosition, RewardsSummary, UserPortfolio, CreatorSummary } from './types';

interface CacheEntry<T> {
  data: T;
  etag?: string;
  timestamp: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ApiDataProvider implements DataProvider {
  private readonly baseUrl: string;
  private readonly cache = new Map<string, CacheEntry<any>>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private buildUrl(path: string, params?: Record<string, any>) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        url.searchParams.set(key, String(value));
      });
    }
    return url.toString();
  }

  private getCacheKey(path: string, params?: Record<string, any>) {
    return `${path}?${JSON.stringify(params ?? {})}`;
  }

  private async fetchWithRetry<T>(path: string, init?: RequestInit & { params?: Record<string, any>; paginated?: boolean; force?: boolean }): Promise<{ data: T; etag?: string; fromCache: boolean; cursor?: string }> {
    const params = init?.params;
    const cacheKey = this.getCacheKey(path, params);
    const cached = this.cache.get(cacheKey);

    const requestInit: RequestInit = {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      signal: init?.signal,
    };

    if (!init?.force && cached?.etag) {
      requestInit.headers = {
        ...requestInit.headers,
        'If-None-Match': cached.etag,
      };
    }

    let attempt = 0;
    let lastError: unknown;

    while (attempt < MAX_RETRIES) {
      try {
        const response = await fetch(this.buildUrl(path, params), requestInit);

        if (response.status === 304 && cached) {
          return { data: cached.data, etag: cached.etag, fromCache: true, cursor: undefined };
        }

        if (response.status === 429 || response.status >= 500) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `Request failed with ${response.status}`);
        }

        const data = (await response.json()) as T;
        const etag = response.headers.get('ETag') ?? undefined;
        const cursor = (data as any)?.cursor;

        this.cache.set(cacheKey, {
          data,
          etag,
          timestamp: Date.now(),
        });

        return { data, etag, fromCache: false, cursor };
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt >= MAX_RETRIES) {
          break;
        }
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }

    if (cached) {
      return { data: cached.data, etag: cached.etag, fromCache: true, cursor: undefined };
    }

    throw lastError ?? new Error('Failed to fetch data');
  }

  async getPoolOverview(params?: { signal?: AbortSignal; force?: boolean }): Promise<PoolOverview> {
    const { data } = await this.fetchWithRetry<PoolOverview>('/v1/pool', {
      signal: params?.signal,
      force: params?.force,
    });
    return data;
  }

  async getCreators(params?: CursorParams): Promise<PaginatedResponse<CreatorSummary>> {
    const { data, fromCache } = await this.fetchWithRetry<{ items: CreatorSummary[]; cursor?: string }>(
      '/v1/creators',
      {
        params: { limit: params?.limit, cursor: params?.cursor },
        signal: params?.signal,
        force: params?.force,
      }
    );
    return {
      items: data.items,
      cursor: data.cursor,
      fromCache,
    };
  }

  async getUserPortfolio(wallet: string, params?: { signal?: AbortSignal; force?: boolean }): Promise<UserPortfolio> {
    const { data } = await this.fetchWithRetry<UserPortfolio>(`/v1/users/${wallet}/portfolio`, {
      signal: params?.signal,
      force: params?.force,
    });
    return data;
  }

  async getLoanHistory(wallet: string, params?: CursorParams): Promise<PaginatedResponse<LoanHistoryItem>> {
    const { data, fromCache } = await this.fetchWithRetry<{ items: LoanHistoryItem[]; cursor?: string }>(
      `/v1/users/${wallet}/loans`,
      {
        params: { limit: params?.limit, cursor: params?.cursor },
        signal: params?.signal,
        force: params?.force,
      }
    );
    return {
      items: data.items,
      cursor: data.cursor,
      fromCache,
    };
  }

  async getRewards(params?: CursorParams): Promise<PaginatedResponse<RewardPosition>> {
    const { data, fromCache } = await this.fetchWithRetry<{ items: RewardPosition[]; cursor?: string }>('/v1/rewards', {
      params: { limit: params?.limit, cursor: params?.cursor },
      signal: params?.signal,
      force: params?.force,
    });
    return {
      items: data.items,
      cursor: data.cursor,
      fromCache,
    };
  }

  async getRewardsSummary(params?: { signal?: AbortSignal; force?: boolean }): Promise<RewardsSummary> {
    const { data } = await this.fetchWithRetry<RewardsSummary>('/v1/rewards/summary', {
      signal: params?.signal,
      force: params?.force,
    });
    return data;
  }
}
