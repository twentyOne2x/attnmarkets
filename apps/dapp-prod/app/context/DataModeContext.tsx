'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DataMode, persistMode, runtimeEnv, useStoredMode } from '../config/runtime';
import { BridgeDataProvider, DataProvider, demoDataProvider } from '../lib/data-providers';

export type HealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy';

interface DataModeContextValue {
  mode: DataMode;
  setMode: (next: DataMode) => Promise<void>;
  toggleMode: () => Promise<void>;
  provider: DataProvider;
  cluster: string;
  apiBaseUrl: string | null;
  apiKey: string | null;
  csrfToken: string;
  programIds: Record<string, string>;
  healthStatus: HealthStatus;
  lastError?: string;
  isAdmin: boolean;
  forceLiveDefault: boolean;
}

const DataModeContext = createContext<DataModeContextValue | undefined>(undefined);

const buildBridgeUrl = (apiBase: string, path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') {
    return `${apiBase.replace(/\/$/, '')}${normalizedPath}`;
  }
  return `/api/bridge${normalizedPath}`;
};

const buildAuthHeaders = (): HeadersInit => {
  const headers: Record<string, string> = {};
  if (runtimeEnv.apiKey) {
    headers['X-API-Key'] = runtimeEnv.apiKey;
  }
  if (runtimeEnv.csrfToken) {
    headers['X-ATTN-Client'] = runtimeEnv.csrfToken;
  }
  return headers;
};

const checkHealth = async (apiBase: string): Promise<void> => {
  const headers = buildAuthHeaders();
  const readyz = await fetch(buildBridgeUrl(apiBase, '/readyz'), {
    cache: 'no-store',
    headers,
  });
  if (!readyz.ok) {
    throw new Error(`/readyz returned ${readyz.status}`);
  }
  const version = await fetch(buildBridgeUrl(apiBase, '/version'), {
    cache: 'no-store',
    headers,
  });
  if (!version.ok) {
    throw new Error(`/version returned ${version.status}`);
  }
};

export const DataModeProvider = ({ children }: { children: ReactNode }) => {
  const stored = useStoredMode();
  const forceLiveDefault = runtimeEnv.isValid && runtimeEnv.defaultMode === 'live';
  const initialMode = runtimeEnv.isValid
    ? forceLiveDefault
      ? 'live'
      : stored
    : 'demo';

  if (typeof window === 'undefined') {
    console.info('[attn] DataModeProvider init (server)', {
      runtimeDefaultMode: runtimeEnv.defaultMode,
      storedMode: stored,
      forceLiveDefault,
      initialMode,
      cluster: runtimeEnv.cluster,
      apiBaseConfigured: Boolean(runtimeEnv.apiBaseUrl),
      programIdsConfigured: Object.keys(runtimeEnv.programIds[runtimeEnv.cluster] ?? {}).length,
      isValid: runtimeEnv.isValid,
    });
  }

  const [mode, setModeState] = useState<DataMode>(initialMode);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>(initialMode === 'demo' ? 'healthy' : 'unknown');
  const [lastError, setLastError] = useState<string | undefined>();

  const programIds = useMemo(() => runtimeEnv.programIds[runtimeEnv.cluster] ?? {}, []);
  const apiBaseUrl = runtimeEnv.apiBaseUrl;

  useEffect(() => {
    if (forceLiveDefault) {
      persistMode('live');
    }
  }, [forceLiveDefault]);

  useEffect(() => {
    console.info('[attn] DataModeProvider hydrate', {
      runtimeDefaultMode: runtimeEnv.defaultMode,
      storedMode: stored,
      forceLiveDefault,
      initialMode,
      currentMode: mode,
      healthStatus,
      apiBaseConfigured: Boolean(apiBaseUrl),
    });
  }, [forceLiveDefault, stored, initialMode, mode, healthStatus, apiBaseUrl]);

  useEffect(() => {
    if (initialMode === 'live' && apiBaseUrl) {
      setHealthStatus('checking');
      (async () => {
        try {
          await checkHealth(apiBaseUrl);
          setHealthStatus('healthy');
          setLastError(undefined);
          setModeState('live');
          persistMode('live');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Live mode unavailable';
          console.warn('[attn] Live mode startup health check failed', message);
          setLastError(message);
          setHealthStatus('unhealthy');
          if (!forceLiveDefault) {
            setModeState('demo');
            persistMode('demo');
          }
        }
      })();
    }
  }, [initialMode, apiBaseUrl, forceLiveDefault]);

  const provider = useMemo<DataProvider>(() => {
    if (mode === 'live' && apiBaseUrl) {
      return new BridgeDataProvider();
    }
    return demoDataProvider;
  }, [mode, apiBaseUrl]);

  const setMode = useCallback(
    async (next: DataMode) => {
      if (forceLiveDefault && next === 'demo') {
        console.info('[attn] Demo mode blocked – live default enforced');
        return;
      }
      if (next === mode) return;

      if (next === 'live') {
        if (!apiBaseUrl) {
          setLastError('Live mode is not configured.');
          setHealthStatus('unhealthy');
          setModeState('demo');
          persistMode('demo');
          return;
        }

        setHealthStatus('checking');
        setModeState('live');
        try {
          await checkHealth(apiBaseUrl);
          setHealthStatus('healthy');
          setLastError(undefined);
          persistMode('live');
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Live mode unavailable';
          console.warn('[attn] Live mode health check failed', message);
          setLastError(message);
          setHealthStatus('unhealthy');
          if (!forceLiveDefault) {
            setModeState('demo');
            persistMode('demo');
          }
        }
      } else {
        setModeState('demo');
        setHealthStatus('healthy');
        setLastError(undefined);
        persistMode('demo');
      }
    },
    [mode, apiBaseUrl, forceLiveDefault]
  );

  const toggleMode = useCallback(() => {
    if (forceLiveDefault) {
      console.info('[attn] Toggle ignored – live default enforced');
      return Promise.resolve();
    }
    return setMode(mode === 'demo' ? 'live' : 'demo');
  }, [mode, setMode, forceLiveDefault]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.setAttribute('data-attn-mode', mode);
    return () => {
      document.body.removeAttribute('data-attn-mode');
    };
  }, [mode]);

  const value = useMemo<DataModeContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode,
      provider,
      cluster: runtimeEnv.cluster,
      apiBaseUrl,
      apiKey: runtimeEnv.apiKey,
      csrfToken: runtimeEnv.csrfToken,
      programIds,
      healthStatus,
      lastError,
      isAdmin: runtimeEnv.isAdmin,
      forceLiveDefault,
    }),
    [mode, setMode, toggleMode, provider, apiBaseUrl, programIds, healthStatus, lastError, forceLiveDefault]
  );

  return <DataModeContext.Provider value={value}>{children}</DataModeContext.Provider>;
};

export const useDataMode = (): DataModeContextValue => {
  const ctx = useContext(DataModeContext);
  if (!ctx) {
    throw new Error('useDataMode must be used within DataModeProvider');
  }
  return ctx;
};
