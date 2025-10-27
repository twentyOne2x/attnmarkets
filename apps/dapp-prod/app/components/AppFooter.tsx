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
  const { data } = useETag<VersionPayload>('/version', {
    enabled: mode === 'live' && !!apiBaseUrl,
    deps: [mode, apiBaseUrl],
    ttlMs: 60_000,
    maxRetries: 1,
  });

  const shortSha = data?.git_sha ? data.git_sha.slice(0, 7) : 'demo';
  const buildLabel =
    data && data.built_at_unix
      ? new Date(data.built_at_unix * 1000).toISOString()
      : 'n/a';
  const commitUrl =
    mode === 'live' && data?.git_sha && data.git_sha !== 'unknown'
      ? `https://github.com/attn-labs/attnmarket/commit/${data.git_sha}`
      : null;

  return (
    <footer className="w-full border-t border-gray-800 bg-dark-card text-xs text-text-secondary px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="flex flex-col gap-1">
        <span>attn.markets — Live data {mode === 'live' ? 'enabled' : 'disabled'}</span>
        <span className="text-[11px] text-warning">
          This is a sale of future yield, not a loan. Quotes available on devnet only.
        </span>
      </div>
      <span className="flex items-center gap-2">
        build
        {commitUrl ? (
          <a
            href={commitUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
            title={data?.git_sha}
          >
            {shortSha}
          </a>
        ) : (
          <span>{shortSha}</span>
        )}
        · {buildLabel}
      </span>
    </footer>
  );
};

export default AppFooter;
