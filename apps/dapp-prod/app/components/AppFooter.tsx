'use client';

import React from 'react';
import { useDataMode } from '../context/DataModeContext';
import { useETag } from '../hooks/useETag';

type VersionPayload = {
  version: string;
  git_sha: string;
  built_at_unix: number;
};

const AppFooter: React.FC = () => {
  const { mode, apiBaseUrl } = useDataMode();
  const fetchEnabled = mode === 'live' && !!apiBaseUrl;
  const { data } = useETag<VersionPayload>('/version', {
    enabled: fetchEnabled,
    deps: [fetchEnabled, apiBaseUrl],
    ttlMs: 60_000,
    maxRetries: 1,
  });

  const shortSha = data?.git_sha ? data.git_sha.slice(0, 7) : 'demo';
  const buildLabel =
    data && data.built_at_unix
      ? new Date(data.built_at_unix * 1000).toISOString()
      : 'n/a';
  const repoUrl = 'https://github.com/twentyOne2x/attnmarket';
  const commitUrl =
    fetchEnabled && data?.git_sha && data.git_sha !== 'unknown'
      ? `${repoUrl}/commit/${data.git_sha}`
      : null;

  return (
    <footer className="w-full border-t border-gray-800 bg-dark-card text-xs text-text-secondary px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span>attn.markets</span>
      </div>
      <div className="flex items-center gap-3 text-[11px]">
        <a
          href="https://x.com/attndotmarkets"
          target="_blank"
          rel="noreferrer"
          className="text-text-secondary hover:text-primary transition-colors"
        >
          Twitter/X
        </a>
        <a
          href="https://docs.attn.markets"
          target="_blank"
          rel="noreferrer"
          className="text-text-secondary hover:text-primary transition-colors"
        >
          Docs
        </a>
        <a
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          className="text-text-secondary hover:text-primary transition-colors"
        >
          GitHub
        </a>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <a
          href={commitUrl ?? repoUrl}
          target="_blank"
          rel="noreferrer"
          className="text-text-secondary hover:text-primary transition-colors"
          title={data?.git_sha ?? 'latest build'}
        >
          {shortSha}
        </a>
        <span>· {buildLabel}</span>
      </div>
    </footer>
  );
};

export default AppFooter;
