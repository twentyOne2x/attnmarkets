'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

interface UseETagOptions {
  deps?: any[];
  enabled?: boolean;
  init?: RequestInit;
  ttlMs?: number;
  maxRetries?: number;
}

interface UseETagResult<T> {
  data?: T;
  loading: boolean;
  error?: Error;
  etag?: string;
}

export function useETag<T>(path: string, options: UseETagOptions = {}): UseETagResult<T> {
  const { deps = [], enabled = true, init, ttlMs, maxRetries } = options;
  const etagRef = useRef<string>();
  const lastFetchRef = useRef<number | null>(null);
  const [data, setData] = useState<T>();
  const [etag, setEtag] = useState<string>();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (ttlMs && etagRef.current && lastFetchRef.current) {
      const age = Date.now() - lastFetchRef.current;
      if (age > ttlMs) {
        etagRef.current = undefined;
      }
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    (async () => {
      try {
        const response = await api<T>(path, etagRef.current, init, { maxRetries });
        if (!cancelled && !response.notModified) {
          setData(response.data);
          setEtag(response.etag);
          etagRef.current = response.etag;
          lastFetchRef.current = Date.now();
        } else if (!cancelled && response.notModified) {
          lastFetchRef.current = Date.now();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, path, ...deps]);

  return { data, loading, error, etag };
}
