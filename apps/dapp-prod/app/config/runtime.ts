import { useMemo } from 'react';

export type DataMode = 'demo' | 'live';

export interface RuntimeEnv {
  defaultMode: DataMode;
  apiBaseUrl: string | null;
  cluster: string;
  programIds: Record<string, Record<string, string>>;
  isValid: boolean;
}

const MODE_STORAGE_KEY = 'attn.mode';

const parseMode = (rawMode?: string | null): DataMode => {
  if (!rawMode) return 'demo';
  const normalized = rawMode.toLowerCase();
  return normalized === 'live' ? 'live' : 'demo';
};

const parseProgramIds = (raw?: string): Record<string, Record<string, string>> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[attn] NEXT_PUBLIC_PROGRAM_IDS must be an object. Falling back to demo.');
      return {};
    }

    return Object.keys(parsed).reduce<Record<string, Record<string, string>>>((acc, cluster) => {
      const clusterPrograms = parsed[cluster];
      if (typeof clusterPrograms !== 'object' || clusterPrograms === null) {
        console.warn(`[attn] Program IDs for cluster "${cluster}" are not an object. Skipping.`);
        return acc;
      }

      const validPrograms: Record<string, string> = {};
      for (const [program, address] of Object.entries(clusterPrograms)) {
        if (typeof address !== 'string') {
          console.warn(`[attn] Program ID for ${program} in ${cluster} must be string. Skipping.`);
          continue;
        }
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
          console.warn(`[attn] Program ID for ${program} in ${cluster} failed base58 check. Skipping.`);
          continue;
        }
        validPrograms[program] = address;
      }

      if (Object.keys(validPrograms).length > 0) {
        acc[cluster] = validPrograms;
      }
      return acc;
    }, {});
  } catch (error) {
    console.warn('[attn] Failed to parse NEXT_PUBLIC_PROGRAM_IDS. Falling back to demo.', error);
    return {};
  }
};

export const runtimeEnv: RuntimeEnv = (() => {
  const defaultMode = parseMode(process.env.NEXT_PUBLIC_DATA_MODE ?? 'demo');
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE?.trim() || null;
  const cluster = process.env.NEXT_PUBLIC_CLUSTER?.trim() || 'devnet';
  const programIds = parseProgramIds(process.env.NEXT_PUBLIC_PROGRAM_IDS);

  const isValid = Boolean(apiBaseUrl && Object.keys(programIds).length > 0);

  if (defaultMode !== 'demo' && !isValid) {
    console.warn('[attn] Live mode configuration incomplete. Defaulting to demo mode.');
  }

  return {
    defaultMode: isValid ? defaultMode : 'demo',
    apiBaseUrl: isValid ? apiBaseUrl : null,
    cluster,
    programIds,
    isValid,
  };
})();

export const useStoredMode = (): DataMode => {
  if (typeof window === 'undefined') {
    return runtimeEnv.defaultMode;
  }
  const savedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
  return savedMode ? parseMode(savedMode) : runtimeEnv.defaultMode;
};

export const persistMode = (mode: DataMode) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
};

export const useRuntimeMode = (mode: DataMode) => {
  return useMemo(
    () => ({
      mode,
      apiBaseUrl: runtimeEnv.apiBaseUrl,
      cluster: runtimeEnv.cluster,
      programIds: runtimeEnv.programIds,
    }),
    [mode]
  );
};

export { MODE_STORAGE_KEY };
