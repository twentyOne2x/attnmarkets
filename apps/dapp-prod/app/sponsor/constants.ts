export const CLUSTER_LABELS: Record<string, string> = {
  mainnet: 'Mainnet',
  'mainnet-beta': 'Mainnet',
  devnet: 'Devnet',
  testnet: 'Testnet',
  localnet: 'Localnet',
};

const DEFAULT_CLUSTER = 'devnet';

export const normalizeCluster = (cluster?: string | null): string => {
  if (!cluster) {
    return DEFAULT_CLUSTER;
  }
  const trimmed = cluster.trim().toLowerCase();
  if (trimmed === 'mainnet-beta') {
    return 'mainnet';
  }
  if (trimmed === 'localnet') {
    return 'devnet';
  }
  if (trimmed === '') {
    return DEFAULT_CLUSTER;
  }
  return trimmed;
};

export const formatClusterLabel = (cluster?: string | null): string => {
  const normalized = normalizeCluster(cluster);
  return CLUSTER_LABELS[normalized] ?? normalized;
};

export const LIVE_TOUR_STORAGE_PREFIX = 'attn.liveUserTour';

const sanitizeStorageSegment = (value: string | null | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? fallback : trimmed.toLowerCase();
};

export const buildLiveTourStorageKey = (
  cluster: string | null | undefined,
  wallet: string | null | undefined
): string => {
  const normalizedCluster = sanitizeStorageSegment(normalizeCluster(cluster), 'devnet');
  const sanitizedWallet = sanitizeStorageSegment(wallet, 'anonymous');
  return `${LIVE_TOUR_STORAGE_PREFIX}::${normalizedCluster}::${sanitizedWallet}`;
};
