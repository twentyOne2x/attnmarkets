import { runtimeEnv } from '../config/runtime';

const normalizePath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

export interface ApiResponse<T> {
  data: T;
  etag?: string;
  notModified: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

interface ApiOptions {
  maxRetries?: number;     // default 2
  retryDelayMs?: number;   // default 300
}

export async function api<T>(
  path: string,
  etag?: string,
  init?: RequestInit,
  options: ApiOptions = {}
): Promise<ApiResponse<T>> {
  const base = runtimeEnv.apiBaseUrl;
  if (!base) throw new Error('NEXT_PUBLIC_API_BASE is not configured for Live mode');

  const isBrowser = typeof window !== 'undefined';
  const targetPath = normalizePath(path);
  const url = isBrowser ? `/api/bridge${targetPath}` : `${base.replace(/\/$/, '')}${targetPath}`;

  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (etag) headers.set('If-None-Match', etag);

  const maxRetries = options.maxRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 300;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { ...init, headers, cache: 'no-store' });

      if (response.status === 304) {
        return { data: undefined as unknown as T, etag, notModified: true };
      }

      if (response.ok) {
        // tolerate empty bodies and 204s
        const text = await response.text();
        const data = text ? (JSON.parse(text) as T) : (undefined as unknown as T);
        const responseEtag = response.headers.get('ETag') ?? undefined;
        return { data, etag: responseEtag, notModified: false };
      }

      const retriable = response.status === 429 || response.status >= 500;
      if (!retriable || attempt === maxRetries) {
        const body = await response.text();
        throw new ApiError(response.status, body || response.statusText);
      }
    } catch (err) {
      // network or parse error
      if (attempt === maxRetries) {
        if (err instanceof ApiError) throw err;
        const msg = err instanceof Error ? err.message : 'Network error';
        throw new ApiError(0, msg);
      }
    }

    const delay = retryDelayMs * 2 ** attempt;
    await new Promise((r) => setTimeout(r, delay));
  }

  throw new ApiError(500, 'Unhandled API retry failure');
}
