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

  const url = `${base.replace(/\/$/, '')}${normalizePath(path)}`;
  const headers: Record<string, string> = init?.headers
    ? { ...init.headers as Record<string, string> }
    : {};

  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const response = await fetch(url, {
    ...init,
    headers,
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
