'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
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
}

const DataModeContext = createContext<DataModeContextValue | undefined>(undefined);

const buildBridgeUrl = (apiBase: string, path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') {
    return `${apiBase.replace(/\/$/, '')}${normalizedPath}`;
  }
  return `/api/bridge${normalizedPath}`;
};

const checkHealth = async (apiBase: string): Promise<void> => {
  const readyz = await fetch(buildBridgeUrl(apiBase, '/readyz'), { cache: 'no-store' });
  if (!readyz.ok) {
    throw new Error(`/readyz returned ${readyz.status}`);
  }
  const version = await fetch(buildBridgeUrl(apiBase, '/version'), { cache: 'no-store' });
  if (!version.ok) {
    throw new Error(`/version returned ${version.status}`);
  }
};

export const DataModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stored = useStoredMode();
  const initialMode = runtimeEnv.isValid ? stored : 'demo';

  const [mode, setModeState] = useState<DataMode>(initialMode);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>(initialMode === 'demo' ? 'healthy' : 'unknown');
  const [lastError, setLastError] = useState<string | undefined>();

  const programIds = useMemo(() => runtimeEnv.programIds[runtimeEnv.cluster] ?? {}, []);
  const apiBaseUrl = runtimeEnv.apiBaseUrl;

  const provider = useMemo<DataProvider>(() => {
    if (mode === 'live' && apiBaseUrl) {
      return new BridgeDataProvider();
    }
    return demoDataProvider;
  }, [mode, apiBaseUrl]);

  const setMode = useCallback(
    async (next: DataMode) => {
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
        try {
          await checkHealth(apiBaseUrl);
          setModeState('live');
          setHealthStatus('healthy');
          setLastError(undefined);
          persistMode('live');
        } catch (error) {
          console.warn('[attn] Live mode health check failed', error);
          setLastError(error instanceof Error ? error.message : 'Live mode unavailable');
          setHealthStatus('unhealthy');
          setModeState('demo');
          persistMode('demo');
        }
      } else {
        setModeState('demo');
        setHealthStatus('healthy');
        setLastError(undefined);
        persistMode('demo');
      }
    },
    [mode, apiBaseUrl]
  );

  const toggleMode = useCallback(() => setMode(mode === 'demo' ? 'live' : 'demo'), [mode, setMode]);

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
    }),
    [mode, setMode, toggleMode, provider, apiBaseUrl, programIds, healthStatus, lastError]
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
