import { useMemo } from 'react';

export type DataMode = 'demo' | 'live';

export interface RuntimeEnv {
  defaultMode: DataMode;
  apiBaseUrl: string | null;
  cluster: string;
  programIds: Record<string, Record<string, string>>;
  isValid: boolean;
  squadsEnabled: boolean;
  attnSquadsMember: string;
  apiKey: string | null;
  csrfToken: string;
  isAdmin: boolean;
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

const parseBoolean = (raw?: string | null): boolean => {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

export const runtimeEnv: RuntimeEnv = (() => {
  const defaultMode = parseMode(process.env.NEXT_PUBLIC_DATA_MODE ?? 'demo');
  const fallbackApiBase = process.env.NEXT_PUBLIC_DEFAULT_API_BASE?.trim() || 'https://attn-api-406386298457.us-central1.run.app';
  const envApiBase = process.env.NEXT_PUBLIC_API_BASE;
  const rawApiBase = envApiBase !== undefined ? envApiBase.trim() || null : fallbackApiBase;
  const cluster = process.env.NEXT_PUBLIC_CLUSTER?.trim() || 'devnet';
  const programIds = parseProgramIds(process.env.NEXT_PUBLIC_PROGRAM_IDS);
  const squadsEnabled = parseBoolean(
    process.env.NEXT_PUBLIC_SQUADS_ENABLED ?? 'true'
  );
  const attnSquadsMember =
    process.env.NEXT_PUBLIC_SQUADS_ATTN_MEMBER?.trim() || 'Attn111111111111111111111111111111111111111';
  const apiKey = process.env.NEXT_PUBLIC_ATTN_API_KEY?.trim() || null;
  const csrfToken = process.env.NEXT_PUBLIC_CSRF_TOKEN?.trim() || 'attn-dapp';
  const adminFlag = process.env.NEXT_PUBLIC_SQUADS_ADMIN_MODE?.trim().toLowerCase();
  const isAdmin = adminFlag === '1' || adminFlag === 'true';

  const isServer = typeof window === 'undefined';
  const isLocalApiBase = rawApiBase ? /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(rawApiBase) : false;
  const allowLocalApi = parseBoolean(process.env.NEXT_PUBLIC_ALLOW_LOCAL_API_BASE);
  let apiBaseUrl = rawApiBase;

  if (rawApiBase && isLocalApiBase && process.env.NODE_ENV === 'production' && !allowLocalApi) {
    if (isServer) {
      console.error(
        `[attn] NEXT_PUBLIC_API_BASE is set to a localhost URL (${rawApiBase}) in production. Disabling Live mode fetches.`,
      );
    }
    apiBaseUrl = null;
  } else if (rawApiBase && isLocalApiBase && allowLocalApi) {
    console.info('[attn] Local API base allowed for current environment.');
  } else if (!rawApiBase && isServer) {
    console.warn('[attn] NEXT_PUBLIC_API_BASE is not configured. Live mode will remain disabled.');
  }

  const activePrograms = programIds[cluster];
  const isValid = Boolean(apiBaseUrl && activePrograms && Object.keys(activePrograms).length > 0);

  if (defaultMode !== 'demo' && !isValid) {
    console.warn('[attn] Live mode configuration incomplete. Defaulting to demo mode.');
  }

  if (isServer) {
    console.info(
      `[attn] runtime config: mode=${isValid ? defaultMode : 'demo'} cluster=${cluster} apiBase=${apiBaseUrl ?? 'unset'}`,
    );
  }

  return {
    defaultMode: isValid ? defaultMode : 'demo',
    apiBaseUrl: isValid ? apiBaseUrl : null,
    cluster,
    programIds,
    isValid,
    squadsEnabled,
    attnSquadsMember,
    apiKey,
    csrfToken,
    isAdmin,
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
