'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Navigation from '@/app/components/Navigation';
import Tooltip from '@/app/components/Tooltip';
import { useDataMode } from '@/app/context/DataModeContext';
import type {
  AdvanceQuote,
  AdvanceTrade,
  GovernanceState,
  MarketDetail,
} from '@/app/lib/data-providers';
import { mintPtYt, sellYt, buybackYt, closeMarket } from '@/app/actions';

interface PageProps {
  params: {
    market: string;
  };
}

const formatNumber = (value: number, maximumFractionDigits = 2): string =>
  Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits }) : '—';

const rateFormat = (value: number): string => `${(value * 100).toFixed(2)}%`;

const getTimeToMaturity = (maturityTs: number): string => {
  const now = Date.now() / 1000;
  const diffSeconds = Math.max(0, maturityTs - now);
  const diffDays = Math.floor(diffSeconds / 86_400);
  const diffHours = Math.floor((diffSeconds % 86_400) / 3_600);
  if (diffDays > 0) {
    return `${diffDays}d ${diffHours}h`;
  }
  const diffMinutes = Math.floor((diffSeconds % 3_600) / 60);
  return `${diffHours}h ${diffMinutes}m`;
};

export default function MarketAdvancePage({ params }: PageProps): React.JSX.Element {
  const { provider, mode, cluster, healthStatus } = useDataMode();
  const walletAdapter = useWallet();
  const publicKey = walletAdapter.publicKey;
  const [marketDetail, setMarketDetail] = useState<MarketDetail | null>(null);
  const [governance, setGovernance] = useState<GovernanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amountUi, setAmountUi] = useState('100');
  const [quote, setQuote] = useState<AdvanceQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [advanceTrade, setAdvanceTrade] = useState<AdvanceTrade | null>(null);
  const [processingAdvance, setProcessingAdvance] = useState(false);
  const [advanceStatus, setAdvanceStatus] = useState<string | null>(null);

  const [buyAmountUi, setBuyAmountUi] = useState('50');
  const [buyQuote, setBuyQuote] = useState<AdvanceQuote | null>(null);
  const [buyTrade, setBuyTrade] = useState<AdvanceTrade | null>(null);
  const [processingBuyback, setProcessingBuyback] = useState(false);
  const [buybackStatus, setBuybackStatus] = useState<string | null>(null);
  const [isBuyQuoting, setIsBuyQuoting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeStatus, setCloseStatus] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [detail, governanceSnapshot] = await Promise.all([
          provider.getMarket(params.market, { signal: controller.signal }),
          provider.getGovernance({ signal: controller.signal }),
        ]);
        setMarketDetail(detail);
        setGovernance(governanceSnapshot);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('[advance] failed to load market', err);
        setError(err instanceof Error ? err.message : 'Failed to load market');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    load();
    return () => controller.abort();
  }, [provider, params.market]);

  const advancePolicy = useMemo(() => {
    if (!marketDetail || !governance) {
      return { enabled: false, paused: false };
    }
    const creatorSnapshot = governance.creator_vaults.find(
      (vault) => vault.pump_mint === marketDetail.summary.pump_mint,
    );
    const enabled = creatorSnapshot?.advance_enabled ?? false;
    const paused = creatorSnapshot?.paused ?? false;
    const stablePaused = governance.stable_vault?.paused ?? false;
    return { enabled, paused: paused || stablePaused };
  }, [marketDetail, governance]);

  const isLiveMode = mode === 'live' && healthStatus === 'healthy';
  const isDevnet = cluster?.toLowerCase() === 'devnet';
  const isWalletConnected = walletAdapter.connected && Boolean(publicKey);
  const canExecuteAdvance =
    isLiveMode &&
    isDevnet &&
    advancePolicy.enabled &&
    !advancePolicy.paused &&
    isWalletConnected;
  const marketSummary = marketDetail?.summary;
  const walletBase58 = publicKey?.toBase58();
  const hasOutstandingSupply =
    (marketSummary?.pt_supply ?? 0) > 0 || (marketSummary?.yt_supply ?? 0) > 0;
  const matchesDualRole =
    Boolean(walletBase58 && marketSummary) &&
    walletBase58 === marketSummary?.creator_authority &&
    walletBase58 === marketSummary?.admin;
  const canCloseMarket =
    Boolean(marketSummary) &&
    matchesDualRole &&
    !hasOutstandingSupply &&
    isLiveMode &&
    isDevnet &&
    healthStatus === 'healthy';

  const getQuote = useCallback(async () => {
    if (!marketDetail) return;
    const size = Number(amountUi);
    if (!Number.isFinite(size) || size <= 0) {
      setError('Enter a positive amount of SY to advance.');
      return;
    }
    setIsQuoting(true);
    setError(null);
    try {
      const nextQuote = await provider.getYtQuote(marketDetail.summary.market, {
        size,
        maturity: marketDetail.summary.maturity_ts,
        side: 'sell',
      });
      setQuote(nextQuote);
      setAdvanceTrade(null);
      setAdvanceStatus(null);
    } catch (err) {
      console.error('[advance] quote failed', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch quote');
    } finally {
      setIsQuoting(false);
    }
  }, [amountUi, marketDetail, provider]);

  const getBuyQuote = useCallback(async () => {
    if (!marketDetail) return;
    const size = Number(buyAmountUi);
    if (!Number.isFinite(size) || size <= 0) {
      setError('Enter a positive YT amount to buy back.');
      return;
    }
    setIsBuyQuoting(true);
    setError(null);
    try {
      const nextQuote = await provider.getYtQuote(marketDetail.summary.market, {
        size,
        maturity: marketDetail.summary.maturity_ts,
        side: 'buyback',
      });
      setBuyQuote(nextQuote);
      setBuyTrade(null);
      setBuybackStatus(null);
    } catch (err) {
      console.error('[advance] buyback quote failed', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch buyback quote');
    } finally {
      setIsBuyQuoting(false);
    }
  }, [buyAmountUi, marketDetail, provider]);

  const handleCloseMarket = useCallback(async () => {
    if (!marketSummary || !walletAdapter) return;
    if (!canCloseMarket) {
      setCloseError('Closing requires zero outstanding PT/YT supply, Live devnet mode, and the same wallet for creator authority and admin.');
      return;
    }
    setCloseError(null);
    setCloseStatus('Submitting close transaction...');
    setClosing(true);
    try {
      const signature = await closeMarket({
        wallet: walletAdapter,
        market: marketSummary.market,
        creatorVault: marketSummary.creator_vault,
        ptMint: marketSummary.pt_mint,
        ytMint: marketSummary.yt_mint,
        creatorAuthority: marketSummary.creator_authority,
        admin: marketSummary.admin,
      });
      setCloseStatus(`Submitted transaction ${signature}`);
    } catch (err) {
      console.error('[advance] close market failed', err);
      setCloseError(err instanceof Error ? err.message : 'Failed to close market');
    } finally {
      setClosing(false);
    }
  }, [walletAdapter, marketSummary, canCloseMarket]);

  const runAdvance = useCallback(async () => {
    if (!marketDetail || !quote) return;
    if (!canExecuteAdvance) {
      setError('Advance execution is gated to devnet Live mode with an active wallet.');
      return;
    }
    const walletToUse: any = walletAdapter;
    if (!walletToUse?.publicKey) {
      setError('Wallet not connected. Connect from the header and try again.');
      return;
    }
    setProcessingAdvance(true);
    setAdvanceStatus('Submitting RFQ trade...');
    try {
      const trade = await provider.postSellYt({
        quoteId: quote.quote_id,
        wallet: walletToUse.publicKey?.toBase58() ?? publicKey?.toBase58() ?? '',
      });
      setAdvanceStatus('Minting PT/YT from your SY...');
      await mintPtYt({
        wallet: walletToUse,
        market: marketDetail.summary.market,
        creatorVault: marketDetail.summary.creator_vault,
        syMint: marketDetail.summary.sy_mint,
        ptMint: marketDetail.summary.pt_mint,
        ytMint: marketDetail.summary.yt_mint,
        amountUi: quote.size_yt.toString(),
      });
      setAdvanceStatus('Selling YT for upfront USDC...');
      await sellYt({
        wallet: walletToUse,
        trade: {
          quoteId: trade.quote_id,
          sizeYt: trade.size_yt,
          route: trade.route,
          side: 'sell',
          settlement: {
            lpWallet: trade.settlement.lp_wallet,
          },
        },
        market: {
          ytMint: marketDetail.summary.yt_mint,
        },
      });
      setAdvanceStatus('Advance completed. Refresh your portfolio to view the update.');
      setAdvanceTrade(trade);
    } catch (err) {
      console.error('[advance] execution failed', err);
      setError(err instanceof Error ? err.message : 'Advance execution failed');
    } finally {
      setProcessingAdvance(false);
    }
  }, [canExecuteAdvance, marketDetail, provider, publicKey, quote]);

  const runBuyback = useCallback(async () => {
    if (!marketDetail || !buyQuote) return;
    if (!canExecuteAdvance) {
      setError('Buyback requires Live devnet mode with an active wallet.');
      return;
    }
    const walletToUse: any = walletAdapter;
    if (!walletToUse?.publicKey) {
      setError('Wallet not connected. Connect from the header and try again.');
      return;
    }
    setProcessingBuyback(true);
    setBuybackStatus('Submitting buyback RFQ...');
    try {
      const trade = await provider.postBuybackYt({
        quoteId: buyQuote.quote_id,
        wallet: walletToUse.publicKey?.toBase58() ?? publicKey?.toBase58() ?? '',
      });
      setBuybackStatus('Buying back YT exposure...');
      await buybackYt({
        wallet: walletToUse,
        trade: {
          quoteId: trade.quote_id,
          priceUsdc: trade.price_usdc,
          sizeYt: trade.size_yt,
          route: trade.route,
          side: 'buyback',
          settlement: {
            lpWallet: trade.settlement.lp_wallet,
          },
        },
        market: {
          pumpMint: marketDetail.summary.pump_mint,
        },
      });
      setBuybackStatus('Buyback submitted. Track progress in your portfolio.');
      setBuyTrade(trade);
    } catch (err) {
      console.error('[advance] buyback failed', err);
      setError(err instanceof Error ? err.message : 'Buyback execution failed');
    } finally {
      setProcessingBuyback(false);
    }
  }, [buyQuote, canExecuteAdvance, marketDetail, provider, publicKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark text-text-primary">
        <Navigation />
        <div className="max-w-3xl mx-auto px-4 py-24 text-center text-text-secondary">
          Loading market advance tools...
        </div>
      </div>
    );
  }

  if (error || !marketDetail) {
    return (
      <div className="min-h-screen bg-dark text-text-primary">
        <Navigation />
        <div className="max-w-3xl mx-auto px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold mb-4">Unable to load market</h1>
          <p className="text-text-secondary">{error ?? 'No market data available.'}</p>
        </div>
      </div>
    );
  }

  const impliedRate = rateFormat(marketDetail.summary.implied_apy);
  const timeToMaturity = getTimeToMaturity(marketDetail.summary.maturity_ts);
  const enablementMessages: string[] = [];
  if (!advancePolicy.enabled) enablementMessages.push('Advance feature disabled for this market.');
  if (advancePolicy.paused) enablementMessages.push('Market is paused by governance.');
  if (!isLiveMode) enablementMessages.push('Switch to Live mode to execute real trades.');
  if (!isDevnet) enablementMessages.push('Advances are limited to devnet for now.');
  if (!isWalletConnected) enablementMessages.push('Connect your wallet to continue.');

  return (
    <div className="min-h-screen bg-dark text-text-primary">
      <Navigation />
      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-text-secondary">Market Detail</p>
          <h1 className="text-3xl font-bold">{marketDetail.summary.market}</h1>
          <p className="text-text-secondary">
            Get a <strong>15-day advance</strong> on your upcoming yield. We sell your next 15 days of YT for upfront USDC — no loan, buy back anytime.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-3 bg-dark-card border border-gray-700 rounded-xl p-6">
          <div>
            <p className="text-xs text-text-secondary">Time to maturity</p>
            <p className="text-lg font-semibold mt-1">{timeToMaturity}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">Implied rate</p>
            <p className="text-lg font-semibold mt-1">{impliedRate}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">YT supply</p>
            <p className="text-lg font-semibold mt-1">{formatNumber(marketDetail.summary.yt_supply)}</p>
          </div>
        </section>

        <section className="bg-dark-card border border-gray-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Get 15-day advance</h2>
              <p className="text-sm text-text-secondary">We sell your next 15 days of yield. No loan. Buy back anytime.</p>
            </div>
            <Tooltip content="Mints PT/YT, sells YT for upfront USDC. Early buyback unwinds the trade.">
              <span className="text-xs text-primary cursor-help">More info</span>
            </Tooltip>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col">
              <span className="text-xs text-text-secondary mb-1">Amount (SY)</span>
              <input
                value={amountUi}
                onChange={(event) => setAmountUi(event.target.value)}
                className="bg-dark border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
                placeholder="e.g. 100"
                inputMode="decimal"
              />
            </label>
            <div className="flex flex-col justify-center text-sm text-text-secondary">
              <span>Wallet: {publicKey?.toBase58() ?? 'Not connected'}</span>
              <span>Mode: {mode.toUpperCase()} • Cluster: {cluster}</span>
            </div>
          </div>

          <button
            className="w-full sm:w-auto bg-primary text-dark font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
            onClick={getQuote}
            disabled={isQuoting}
          >
            {isQuoting ? 'Fetching quote...' : 'Get quote'}
          </button>

          {quote && (
            <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Upfront USDC</span>
                <span className="font-mono">{formatNumber(quote.price_usdc, 4)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Size (YT)</span>
                <span className="font-mono">{formatNumber(quote.size_yt, 4)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Estimated slippage</span>
                <span>{(quote.est_slippage * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Expires</span>
                <span>{new Date(quote.expires_at).toLocaleTimeString()}</span>
              </div>
            </div>
          )}

          <button
            className="w-full sm:w-auto bg-secondary text-dark font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
            onClick={runAdvance}
            disabled={!quote || processingAdvance}
          >
            {processingAdvance ? 'Processing advance...' : 'Confirm advance'}
          </button>

          {advanceStatus && (
            <p className="text-sm text-text-secondary">{advanceStatus}</p>
          )}

          {advanceTrade && (
            <div className="border border-secondary/30 bg-secondary/5 rounded-lg p-4 text-sm space-y-1">
              <p className="font-semibold text-secondary">Advance recorded</p>
              <p>Wallet cap used: {formatNumber(advanceTrade.caps.wallet_used_usdc ?? 0)} USDC</p>
              <p>Epoch cap used: {formatNumber(advanceTrade.caps.epoch_used_usdc ?? 0)} USDC</p>
            </div>
          )}

          {enablementMessages.length > 0 && (
            <ul className="text-xs text-warning space-y-1">
              {enablementMessages.map((message) => (
                <li key={message}>• {message}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-dark-card border border-gray-700 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Admin controls</h2>
              <p className="text-sm text-text-secondary">
                Markets can only be closed in Live devnet mode when both admin and creator authority signers match the connected wallet.
              </p>
            </div>
            <div className="text-xs text-text-secondary space-y-1">
              <div>Creator authority: {marketSummary?.creator_authority ?? '—'}</div>
              <div>Admin: {marketSummary?.admin ?? '—'}</div>
            </div>
          </div>

          {closeError && <p className="text-sm text-warning">{closeError}</p>}
          {closeStatus && <p className="text-sm text-text-secondary">{closeStatus}</p>}

          <button
            className="w-full sm:w-auto bg-error text-dark font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
            onClick={handleCloseMarket}
            disabled={!canCloseMarket || closing}
          >
            {closing ? 'Closing market...' : 'Close market'}
          </button>

          <ul className="text-xs text-text-secondary space-y-1">
            {hasOutstandingSupply && (
              <li>• Burn remaining PT and YT supply before closing.</li>
            )}
            {!matchesDualRole && (
              <li>• Connect the wallet that controls both the creator authority and admin roles.</li>
            )}
            {!isLiveMode && (
              <li>• Enable Live devnet mode to submit admin transactions.</li>
            )}
          </ul>
        </section>

        <section className="bg-dark-card border border-gray-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Early buyback</h2>
              <p className="text-sm text-text-secondary">Repurchase YT to close your advance ahead of maturity.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col">
              <span className="text-xs text-text-secondary mb-1">YT to buy back</span>
              <input
                value={buyAmountUi}
                onChange={(event) => setBuyAmountUi(event.target.value)}
                className="bg-dark border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-secondary"
                placeholder="e.g. 50"
                inputMode="decimal"
              />
            </label>
            <div className="flex flex-col justify-center text-xs text-text-secondary">
              <span>Select a size equal to your remaining YT shortfall.</span>
              <span>Quote expires in roughly 30 seconds.</span>
            </div>
          </div>

          <button
            className="w-full sm:w-auto bg-primary text-dark font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
            onClick={getBuyQuote}
            disabled={isBuyQuoting}
          >
            {isBuyQuoting ? 'Fetching buyback quote...' : 'Get buyback quote'}
          </button>

          {buyQuote && (
            <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>USDC required</span>
                <span className="font-mono">{formatNumber(buyQuote.price_usdc, 4)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>YT recovered</span>
                <span className="font-mono">{formatNumber(buyQuote.size_yt, 4)}</span>
              </div>
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Expires</span>
                <span>{new Date(buyQuote.expires_at).toLocaleTimeString()}</span>
              </div>
            </div>
          )}

          <button
            className="w-full sm:w-auto bg-secondary text-dark font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
            onClick={runBuyback}
            disabled={!buyQuote || processingBuyback}
          >
            {processingBuyback ? 'Processing buyback...' : 'Confirm buyback'}
          </button>

          {buybackStatus && (
            <p className="text-sm text-text-secondary">{buybackStatus}</p>
          )}

          {buyTrade && (
            <div className="border border-secondary/30 bg-secondary/5 rounded-lg p-4 text-sm space-y-1">
              <p className="font-semibold text-secondary">Buyback trade recorded</p>
              <p>Wallet usage: {formatNumber(buyTrade.caps.wallet_used_usdc ?? 0)} USDC</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
