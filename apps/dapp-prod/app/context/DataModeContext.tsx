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
  programIds: Record<string, string>;
  healthStatus: HealthStatus;
  lastError?: string;
}

const DataModeContext = createContext<DataModeContextValue | undefined>(undefined);

const checkHealth = async (apiBase: string): Promise<void> => {
  const readyz = await fetch(`${apiBase.replace(/\/$/, '')}/readyz`, { cache: 'no-store' });
  if (!readyz.ok) {
    throw new Error(`/readyz returned ${readyz.status}`);
  }
  const version = await fetch(`${apiBase.replace(/\/$/, '')}/version`, { cache: 'no-store' });
  if (!version.ok) {
    throw new Error(`/version returned ${version.status}`);
  }
};

export const DataModeProvider = ({ children }: { children: ReactNode }) => {
  const stored = useStoredMode();
  const initialMode = runtimeEnv.isValid ? stored : 'demo';

  const [mode, setModeState] = useState<DataMode>(initialMode);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>(initialMode === 'demo' ? 'healthy' : 'unknown');
  const [lastError, setLastError] = useState<string | undefined>();

  const programIds = useMemo(() => runtimeEnv.programIds[runtimeEnv.cluster] ?? {}, []);
  const apiBaseUrl = runtimeEnv.apiBaseUrl;

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
          console.warn('[attn] Live mode startup health check failed', error);
          setLastError(error instanceof Error ? error.message : 'Live mode unavailable');
          setHealthStatus('unhealthy');
          setModeState('demo');
          persistMode('demo');
        }
      })();
    }
  }, [initialMode, apiBaseUrl]);

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
      programIds,
      healthStatus,
      lastError,
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
