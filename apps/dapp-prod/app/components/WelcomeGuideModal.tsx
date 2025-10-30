'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface WelcomeGuideModalProps {
  open: boolean;
  onChooseSponsor: () => void;
  onChooseLP: () => void;
  onExplore: () => void;
}

const WelcomeGuideModal: React.FC<WelcomeGuideModalProps> = ({
  open,
  onChooseSponsor,
  onChooseLP,
  onExplore,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[2500] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70" role="presentation" onClick={onExplore} />
      <div className="relative z-[2501] w-full max-w-2xl rounded-2xl border border-primary/40 bg-gray-950/95 p-6 shadow-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary">Welcome to attn</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Where should we guide you?</h2>
            <p className="mt-2 text-sm text-gray-300">
              Pick the role that fits you best and we&apos;ll open the right workspace. You can also skip the tour and explore on
              your own.
            </p>
          </div>
          <button
            type="button"
            onClick={onExplore}
            className="self-start rounded-full border border-gray-700 px-3 py-1 text-xs uppercase tracking-wide text-gray-400 transition hover:border-gray-500 hover:text-gray-200"
          >
            Skip
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={onChooseSponsor}
            className="group flex flex-col rounded-xl border border-secondary/30 bg-secondary/10 p-4 text-left transition hover:border-secondary/60 hover:bg-secondary/20"
            title="Sponsors include creators, builders, and DAOs with on-chain revenue."
          >
            <span className="text-sm font-semibold text-secondary">I&apos;m a sponsor (creator, builder, DAO)</span>
            <span className="mt-2 text-xs text-secondary/80">
              Connect your wallet, spin up a Squads safe, and route your revenue flows into attn.
            </span>
            <span className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-secondary/70 group-hover:text-secondary">
              Take me to the sponsor console →
            </span>
          </button>

          <button
            type="button"
            onClick={onChooseLP}
            className="group flex flex-col rounded-xl border border-primary/30 bg-primary/5 p-4 text-left transition hover:border-primary/60 hover:bg-primary/15"
          >
            <span className="text-sm font-semibold text-primary">I provide liquidity</span>
            <span className="mt-2 text-xs text-primary/80">
              Deposit USDC, earn vault yield, and monitor creator performance in live mode.
            </span>
            <span className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-primary/70 group-hover:text-primary">
              Show me the LP tools →
            </span>
          </button>

          <div className="flex flex-col justify-between rounded-xl border border-gray-700 bg-gray-900/60 p-4 text-left">
            <div>
              <span className="text-sm font-semibold text-gray-200">Just looking around</span>
              <p className="mt-2 text-xs text-gray-400">
                Close this guide and explore the dashboard. You can reopen it anytime from the banner.
              </p>
            </div>
            <button
              type="button"
              onClick={onExplore}
              className="mt-4 w-full rounded-lg border border-gray-600 px-3 py-2 text-xs font-semibold text-gray-200 transition hover:border-gray-400 hover:text-white"
            >
              Let me browse freely
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WelcomeGuideModal;
