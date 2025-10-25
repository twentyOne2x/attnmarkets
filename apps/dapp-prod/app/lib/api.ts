import { runtimeEnv } from '../config/runtime';

const normalizePath = (path: string): string => {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
};

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

export async function api<T>(path: string, etag?: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const base = runtimeEnv.apiBaseUrl;
  if (!base) {
    throw new Error('NEXT_PUBLIC_API_BASE is not configured for Live mode');
  }

  const isBrowser = typeof window !== 'undefined';
  const targetPath = normalizePath(path);
  const url = isBrowser ? `/api/bridge${targetPath}` : `${base.replace(/\/$/, '')}${targetPath}`;
  const headers = new Headers(init?.headers ?? undefined);

  if (etag) {
    headers.set('If-None-Match', etag);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (response.status === 304) {
    return {
      data: undefined as unknown as T,
      etag,
      notModified: true,
    };
  }

  if (!response.ok) {
    const body = await response.text();
    if (!isBrowser) {
      console.error('[attn] upstream API request failed', {
        url,
        status: response.status,
        body: body ? body.slice(0, 1024) : '<empty>',
      });
    }
    throw new ApiError(response.status, body || response.statusText);
  }

  const payload = await response.json() as T;
  const responseEtag = response.headers.get('ETag') ?? undefined;
  return {
    data: payload,
    etag: responseEtag,
    notModified: false,
  };
}
