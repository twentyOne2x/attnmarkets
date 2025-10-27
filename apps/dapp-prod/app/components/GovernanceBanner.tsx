'use client';

import React from 'react';
import { useDataMode } from '../context/DataModeContext';
import { useETag } from '../hooks/useETag';
import type { GovernanceState } from '../lib/data-providers';

const isPaused = (snapshot?: GovernanceState): boolean => {
  if (!snapshot) return false;
  const creatorPaused = snapshot.creator_vaults.some((vault) => vault.paused);
  const rewardsPaused = snapshot.rewards_pools.some((pool) => pool.paused);
  const stablePaused = snapshot.stable_vault?.paused ?? false;
  return creatorPaused || rewardsPaused || stablePaused;
};

export const GovernanceBanner: React.FC = () => {
  const { mode } = useDataMode();
  const { data, error, loading } = useETag<GovernanceState>('/v1/governance', {
    enabled: mode === 'live',
    deps: [mode],
    ttlMs: 10_000,
    maxRetries: 2,
  });

  if (mode !== 'live' || loading || error) {
    return null;
  }

  if (!isPaused(data)) {
    return null;
  }

  return (
    <div className="bg-yellow-300/10 border border-yellow-300/40 text-yellow-200 text-sm text-center py-2 px-4">
      Writes disabled: governance pause active.
    </div>
  );
};

export default GovernanceBanner;
