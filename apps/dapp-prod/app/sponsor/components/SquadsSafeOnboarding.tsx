'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import clsx from 'clsx';
import bs58 from 'bs58';
import { useWallet } from '@solana/wallet-adapter-react';
import { runtimeEnv } from '../../config/runtime';
import { useDataMode } from '../../context/DataModeContext';
import { useAppContext } from '../../context/AppContext';

const BASE58_WALLET_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{64,120}$/;
const SIGNATURE_MESSAGE_PREFIX = 'attn:squads:create';
const GOVERNANCE_MESSAGE_PREFIX = 'attn:squads:govern';

interface FormState {
  creatorWallet: string;
  attnWallet: string;
  safeName: string;
  cluster: string;
  threshold: number;
  contactEmail: string;
  notes: string;
  creatorSignature: string;
}

interface CreatedSafe {
  request_id: string;
  status: string;
  safe_address?: string | null;
  transaction_url?: string | null;
  status_url?: string | null;
  cluster: string;
  threshold: number;
  members: string[];
  mode: string;
  raw_response?: unknown;
  idempotency_key?: string | null;
  attempt_count: number;
  last_attempt_at: string;
  next_retry_at?: string | null;
  status_last_checked_at?: string | null;
  status_sync_error?: string | null;
  status_last_response_hash?: string | null;
  creator_vault?: string | null;
  governance_linked_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface NonceResponse {
  nonce: string;
  expires_at: string;
  ttl_seconds: number;
}

const sanitize = (value: string): string => value.trim();

const formatAddress = (address: string): string => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  return new Date(value).toLocaleString();
};

const generateIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const SquadsSafeOnboarding: React.FC = () => {
  const { mode, apiBaseUrl, cluster: configuredCluster, apiKey, csrfToken, isAdmin } = useDataMode();
  const { currentUserWallet } = useAppContext();
  const wallet = useWallet();
  const connectedWalletAddress = useMemo(() => wallet.publicKey?.toBase58() ?? null, [wallet.publicKey]);
  const defaultFormState = useMemo<FormState>(
    () => ({
      creatorWallet: '',
      attnWallet: runtimeEnv.attnSquadsMember,
      safeName: '',
      cluster: runtimeEnv.cluster || configuredCluster,
      threshold: 2,
      contactEmail: '',
      notes: '',
      creatorSignature: '',
    }),
    [configuredCluster]
  );
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(generateIdempotencyKey);
  const [nonce, setNonce] = useState<NonceResponse | null>(null);
  const [requestingNonce, setRequestingNonce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonceError, setNonceError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedSafe | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [creatorWalletManuallyEdited, setCreatorWalletManuallyEdited] = useState(false);
  const [governanceForm, setGovernanceForm] = useState({
    creatorVault: '',
    creatorSignature: '',
    attnSignature: '',
    submitting: false,
    error: null as string | null,
    success: null as string | null,
  });
  const [adminFilters, setAdminFilters] = useState({ status: '', creatorWallet: '', cluster: '' });
  const [adminRequests, setAdminRequests] = useState<CreatedSafe[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState<'unknown' | 'healthy' | 'error'>('unknown');
  const [healthTick, setHealthTick] = useState(0);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const canCallApi =
    mode === 'live' && Boolean(apiBaseUrl && apiKey && csrfToken && runtimeEnv.attnSquadsMember);

  const updateForm = useCallback((next: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...next }));
  }, []);

  const handleCreatorWalletChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      if (value === (connectedWalletAddress ?? '')) {
        setCreatorWalletManuallyEdited(false);
      } else {
        setCreatorWalletManuallyEdited(true);
      }
      updateForm({ creatorWallet: value });
    },
    [connectedWalletAddress, updateForm]
  );

  const copyToClipboard = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 1500);
    } catch (err) {
      console.warn('Failed to copy text', err);
    }
  }, []);

  const buildHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }
    if (csrfToken) {
      headers['X-ATTN-Client'] = csrfToken;
    }
    return headers;
  }, [apiKey, csrfToken]);

  const syncResult = useCallback((updated: CreatedSafe) => {
    setResult((prev) => (prev && prev.request_id === updated.request_id ? updated : prev));
    setAdminRequests((prev) =>
      prev.length > 0
        ? prev.map((entry) => (entry.request_id === updated.request_id ? updated : entry))
        : prev
    );
  }, []);

  const handleRequestNonce = useCallback(async () => {
    setNonceError(null);
    setNonce(null);
    const creatorWallet = sanitize(form.creatorWallet);

    if (!canCallApi) {
      setNonceError('Switch to live mode with API credentials to request a nonce.');
      return;
    }
    if (!creatorWallet) {
      setNonceError('Enter the creator wallet before requesting a nonce.');
      return;
    }
    if (!BASE58_WALLET_REGEX.test(creatorWallet)) {
      setNonceError('Creator wallet must be a valid Solana address (base58, 32-44 chars).');
      return;
    }

    if (!apiBaseUrl) {
      setNonceError('API base URL is not configured.');
      return;
    }

    setRequestingNonce(true);
    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/v1/squads/safes/nonce`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ creator_wallet: creatorWallet }),
      });
      if (!response.ok) {
        const message = await response
          .json()
          .then((body) => body?.message || body?.error || response.statusText)
          .catch(() => response.statusText);
        throw new Error(message || 'Failed to request nonce');
      }
      const data = (await response.json()) as NonceResponse;
      setNonce(data);
      setNonceError(null);
    } catch (err) {
      console.error('Failed to request nonce', err);
      setNonceError(err instanceof Error ? err.message : 'Failed to request nonce.');
    } finally {
      setRequestingNonce(false);
    }
  }, [apiBaseUrl, buildHeaders, canCallApi, form.creatorWallet]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      const creatorWallet = sanitize(form.creatorWallet);
      const attnWallet = sanitize(form.attnWallet) || runtimeEnv.attnSquadsMember;
      const signature = sanitize(form.creatorSignature);

      const errors: string[] = [];
      if (!creatorWallet) {
        errors.push('Creator wallet is required.');
      } else if (!BASE58_WALLET_REGEX.test(creatorWallet)) {
        errors.push('Creator wallet must be a valid Solana address (base58, 32-44 chars).');
      }
      if (!BASE58_WALLET_REGEX.test(attnWallet)) {
        errors.push('attn wallet must be a valid Solana address.');
      }
      if (!nonce) {
        errors.push('Request a nonce before submitting the safe creation request.');
      }
      if (!signature) {
        errors.push('Provide the creator signature for the nonce.');
      } else if (!BASE58_SIGNATURE_REGEX.test(signature)) {
        errors.push('Creator signature must be base58 encoded.');
      }
      if (form.threshold < 1 || form.threshold > 10) {
        errors.push('Threshold must be between 1 and 10.');
      }
      if (!canCallApi) {
        errors.push('Switch to live mode with API credentials to submit.');
      }
      if (errors.length > 0) {
        setError(errors.join(' '));
        return;
      }

      setSubmitting(true);
      try {
        if (!apiBaseUrl) {
          setError('API base URL is not configured.');
          return;
        }
        const normalizedApiBase = apiBaseUrl.replace(/\/$/, '');
        const response = await fetch(`${normalizedApiBase}/v1/squads/safes`, {
          method: 'POST',
          headers: {
            ...buildHeaders(),
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            creator_wallet: creatorWallet,
            attn_wallet: attnWallet,
            safe_name: sanitize(form.safeName) || undefined,
            cluster: sanitize(form.cluster) || undefined,
            threshold: form.threshold,
            contact_email: sanitize(form.contactEmail) || undefined,
            note: sanitize(form.notes) || undefined,
            nonce: nonce?.nonce,
            creator_signature: signature,
          }),
        });

        if (!response.ok) {
          const message = await response
            .json()
            .then((body) => body?.message || body?.error || response.statusText)
            .catch(() => response.statusText);
          throw new Error(message || 'Failed to create Squads safe');
        }

        const data = (await response.json()) as CreatedSafe;
        setResult(data);
        setGovernanceForm({
          creatorVault: '',
          creatorSignature: '',
          attnSignature: '',
          submitting: false,
          error: null,
          success: null,
        });
        setError(null);
      } catch (err) {
        console.error('Failed to create Squads safe', err);
        setError(err instanceof Error ? err.message : 'Failed to create Squads safe.');
      } finally {
        setSubmitting(false);
      }
    },
    [apiBaseUrl, buildHeaders, canCallApi, form, idempotencyKey, nonce]
  );

  const handleRefreshStatus = useCallback(async () => {
    if (!result || !apiBaseUrl || !canCallApi) return;
    setPolling(true);
    try {
      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, '')}/v1/squads/safes/${result.request_id}`,
        {
          method: 'GET',
          headers: buildHeaders(),
        }
      );
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      const data = (await response.json()) as CreatedSafe;
      syncResult(data);
    } catch (err) {
      console.error('Failed to refresh safe status', err);
      setError('Failed to refresh safe status.');
    } finally {
      setPolling(false);
    }
  }, [apiBaseUrl, buildHeaders, canCallApi, result, syncResult]);

  const handleLinkGovernance = useCallback(async () => {
    if (!result || !apiBaseUrl || !canCallApi) return;
    const creatorVault = sanitize(governanceForm.creatorVault);
    const creatorSignature = sanitize(governanceForm.creatorSignature);
    const attnSignature = sanitize(governanceForm.attnSignature);
    const messages: string[] = [];
    if (!creatorVault) {
      messages.push('Creator vault is required.');
    } else if (!BASE58_WALLET_REGEX.test(creatorVault)) {
      messages.push('Creator vault must be a valid Solana address (base58, 32-44 chars).');
    }
    if (!creatorSignature) {
      messages.push('Creator governance signature is required.');
    } else if (!BASE58_SIGNATURE_REGEX.test(creatorSignature)) {
      messages.push('Creator governance signature must be base58 encoded.');
    }
    if (!attnSignature) {
      messages.push('attn governance signature is required.');
    } else if (!BASE58_SIGNATURE_REGEX.test(attnSignature)) {
      messages.push('attn governance signature must be base58 encoded.');
    }
    if (messages.length > 0) {
      setGovernanceForm((prev) => ({ ...prev, error: messages.join(' '), success: null }));
      return;
    }

    setGovernanceForm((prev) => ({ ...prev, submitting: true, error: null, success: null }));
    try {
      const response = await fetch(
        `${apiBaseUrl.replace(/\/$/, '')}/v1/squads/safes/${result.request_id}/governance`,
        {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({
            creator_vault: creatorVault,
            creator_signature: creatorSignature,
            attn_signature: attnSignature,
          }),
        }
      );
      if (!response.ok) {
        const message = await response
          .json()
          .then((body) => body?.message || body?.error || response.statusText)
          .catch(() => response.statusText);
        throw new Error(message || 'Failed to link governance');
      }
      const data = (await response.json()) as CreatedSafe;
      syncResult(data);
      setGovernanceForm({
        creatorVault: '',
        creatorSignature: '',
        attnSignature: '',
        submitting: false,
        error: null,
        success: 'Governance linked successfully.',
      });
    } catch (err) {
      console.error('Failed to link governance', err);
      setGovernanceForm((prev) => ({
        ...prev,
        submitting: false,
        error: err instanceof Error ? err.message : 'Failed to link governance.',
        success: null,
      }));
    }
  }, [apiBaseUrl, buildHeaders, canCallApi, governanceForm.attnSignature, governanceForm.creatorSignature, governanceForm.creatorVault, result, syncResult]);

  const handleAdminFetch = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (!isAdmin || !apiBaseUrl || !canCallApi) {
        setAdminError('Admin tools require live mode credentials.');
        return;
      }
      setAdminLoading(true);
      setAdminError(null);
      try {
        const params = new URLSearchParams();
        const status = sanitize(adminFilters.status).toLowerCase();
        if (status) params.set('status', status);
        const creatorWallet = sanitize(adminFilters.creatorWallet);
        if (creatorWallet) params.set('creator_wallet', creatorWallet);
        const cluster = sanitize(adminFilters.cluster);
        if (cluster) params.set('cluster', cluster);
        const query = params.toString();
        const response = await fetch(
          `${apiBaseUrl.replace(/\/$/, '')}/v1/squads/safes${query ? `?${query}` : ''}`,
          {
            method: 'GET',
            headers: buildHeaders(),
          }
        );
        if (!response.ok) {
          const message = await response
            .json()
            .then((body) => body?.message || body?.error || response.statusText)
            .catch(() => response.statusText);
          throw new Error(message || 'Failed to load safe requests');
        }
        const data = (await response.json()) as CreatedSafe[];
        setAdminRequests(data);
      } catch (err) {
        console.error('Failed to fetch admin safes', err);
        setAdminError(err instanceof Error ? err.message : 'Failed to load safe requests.');
      } finally {
        setAdminLoading(false);
      }
    },
    [adminFilters.cluster, adminFilters.creatorWallet, adminFilters.status, apiBaseUrl, buildHeaders, canCallApi, isAdmin]
  );

  const handleAdminResubmit = useCallback(
    async (requestId: string, force = false) => {
      if (!isAdmin || !apiBaseUrl || !canCallApi) {
        setAdminError('Live credentials required for admin actions.');
        return;
      }
      setAdminLoading(true);
      try {
        const response = await fetch(
          `${apiBaseUrl.replace(/\/$/, '')}/v1/squads/safes/${requestId}/resubmit`,
          {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify({ force }),
          }
        );
        if (!response.ok) {
          const message = await response
            .json()
            .then((body) => body?.message || body?.error || response.statusText)
            .catch(() => response.statusText);
          throw new Error(message || 'Failed to resubmit safe');
        }
        const data = (await response.json()) as CreatedSafe;
        syncResult(data);
        setAdminRequests((prev) =>
          prev.map((entry) => (entry.request_id === data.request_id ? data : entry))
        );
        setAdminError(null);
      } catch (err) {
        console.error('Failed to resubmit safe', err);
        setAdminError(err instanceof Error ? err.message : 'Failed to resubmit safe.');
      } finally {
        setAdminLoading(false);
      }
    },
    [apiBaseUrl, buildHeaders, canCallApi, isAdmin, syncResult]
  );

  const handleAdminOverride = useCallback(
    async (requestId: string) => {
      if (!isAdmin || !apiBaseUrl || !canCallApi) {
        setAdminError('Live credentials required for admin actions.');
        return;
      }
      const statusPrompt = window
        .prompt('Enter new status (pending | submitted | ready | failed):', 'ready')
        ?.trim()
        .toLowerCase();
      if (!statusPrompt) {
        return;
      }
      if (!['pending', 'submitted', 'ready', 'failed'].includes(statusPrompt)) {
        setAdminError('Status must be pending, submitted, ready, or failed.');
        return;
      }
      let safeAddress: string | undefined;
      if (statusPrompt === 'ready') {
        const rawAddress = window.prompt('Safe address (base58 required):', '')?.trim() || '';
        if (!BASE58_WALLET_REGEX.test(rawAddress)) {
          setAdminError('Safe address must be base58 (32-44 chars).');
          return;
        }
        safeAddress = rawAddress;
      }
      const transactionUrl = window.prompt('Transaction URL (optional):', '')?.trim() || undefined;
      const note = window.prompt('Note override (optional):', '')?.trim() || undefined;

      try {
        setAdminLoading(true);
        const response = await fetch(
          `${apiBaseUrl.replace(/\/$/, '')}/v1/squads/safes/${requestId}/status`,
          {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify({
              status: statusPrompt,
              safe_address: safeAddress,
              transaction_url: transactionUrl || undefined,
              note: note && note.length > 0 ? note : undefined,
            }),
          }
        );
        if (!response.ok) {
          const message = await response
            .json()
            .then((body) => body?.message || body?.error || response.statusText)
            .catch(() => response.statusText);
          throw new Error(message || 'Failed to override status');
        }
        const data = (await response.json()) as CreatedSafe;
        syncResult(data);
        setAdminRequests((prev) =>
          prev.map((entry) => (entry.request_id === data.request_id ? data : entry))
        );
        setAdminError(null);
      } catch (err) {
        console.error('Failed to override status', err);
        setAdminError(err instanceof Error ? err.message : 'Failed to override status.');
      } finally {
        setAdminLoading(false);
      }
    },
    [apiBaseUrl, buildHeaders, canCallApi, isAdmin, syncResult]
  );

  const resetAndClear = useCallback(() => {
    setForm(defaultFormState);
    setResult(null);
    setError(null);
    setNonce(null);
    setIdempotencyKey(generateIdempotencyKey());
  }, [defaultFormState]);

  const sanitizedCreatorWallet = sanitize(form.creatorWallet);
  const normalizedContextWallet = useMemo(
    () => (currentUserWallet ? sanitize(currentUserWallet) : ''),
    [currentUserWallet]
  );
  const autoFilledFromWallet =
    !creatorWalletManuallyEdited &&
    sanitizedCreatorWallet.length > 0 &&
    (sanitizedCreatorWallet === (connectedWalletAddress ?? '') ||
      (normalizedContextWallet && sanitizedCreatorWallet === normalizedContextWallet));
  const signMessage = useMemo(() => {
    const creatorWallet = sanitizedCreatorWallet || '<creator-wallet>';
    const currentNonce = nonce?.nonce || '<nonce>';
    return `${SIGNATURE_MESSAGE_PREFIX}:${currentNonce}:${creatorWallet}`;
  }, [sanitizedCreatorWallet, nonce]);

  const governanceMessage = useMemo(() => {
    if (!result) return '';
    const vault = sanitize(governanceForm.creatorVault) || '<creator-vault>';
    return `${GOVERNANCE_MESSAGE_PREFIX}:${result.request_id}:${vault}`;
  }, [governanceForm.creatorVault, result]);

  const encodedSignMessage = useMemo(() => new TextEncoder().encode(signMessage), [signMessage]);
  const canUseWalletSigner =
    Boolean(wallet.signMessage) &&
    Boolean(connectedWalletAddress) &&
    Boolean(nonce?.nonce) &&
    sanitizedCreatorWallet.length > 0 &&
    connectedWalletAddress === sanitizedCreatorWallet;

  const handleSignWithWallet = useCallback(async () => {
    if (!wallet?.signMessage) {
      setSignError('Connected wallet cannot sign messages in this context.');
      return;
    }
    if (!nonce?.nonce) {
      setSignError('Request a nonce first.');
      return;
    }
    if (!connectedWalletAddress || connectedWalletAddress !== sanitizedCreatorWallet) {
      setSignError('Use the same wallet you entered above to sign this message.');
      return;
    }
    try {
      setSigning(true);
      setSignError(null);
      const signatureBytes = await wallet.signMessage(encodedSignMessage);
      const signature = bs58.encode(signatureBytes);
      updateForm({ creatorSignature: signature });
    } catch (err) {
      console.error('Wallet message signing failed', err);
      setSignError(err instanceof Error ? err.message : 'Failed to sign message.');
    } finally {
      setSigning(false);
    }
  }, [wallet, nonce?.nonce, connectedWalletAddress, sanitizedCreatorWallet, encodedSignMessage, updateForm]);

  useEffect(() => {
    setSignError(null);
  }, [sanitizedCreatorWallet, nonce?.nonce]);

  useEffect(() => {
    if (!connectedWalletAddress) {
      if (!creatorWalletManuallyEdited && form.creatorWallet !== '') {
        updateForm({ creatorWallet: '' });
      }
      if (creatorWalletManuallyEdited) {
        setCreatorWalletManuallyEdited(false);
      }
      return;
    }

    if (!creatorWalletManuallyEdited && form.creatorWallet !== connectedWalletAddress) {
      setCreatorWalletManuallyEdited(false);
      updateForm({ creatorWallet: connectedWalletAddress });
    }
  }, [connectedWalletAddress, creatorWalletManuallyEdited, form.creatorWallet, updateForm]);

  useEffect(() => {
    const normalizedCurrentWallet = currentUserWallet ? sanitize(currentUserWallet) : '';
    if (!normalizedCurrentWallet || creatorWalletManuallyEdited) {
      return;
    }
    if (form.creatorWallet === normalizedCurrentWallet) {
      return;
    }
    updateForm({ creatorWallet: normalizedCurrentWallet });
  }, [currentUserWallet, creatorWalletManuallyEdited, form.creatorWallet, updateForm]);

  useEffect(() => {
    if (creatorWalletManuallyEdited && connectedWalletAddress && form.creatorWallet === connectedWalletAddress) {
      setCreatorWalletManuallyEdited(false);
    }
  }, [creatorWalletManuallyEdited, connectedWalletAddress, form.creatorWallet]);

  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      if (mode !== 'live' || !apiBaseUrl || !canCallApi) {
        if (!cancelled) {
          setApiHealth('unknown');
        }
        return;
      }
      try {
        const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/readyz`, {
          headers: buildHeaders(),
        });
        if (!cancelled) {
          setApiHealth(response.ok ? 'healthy' : 'error');
        }
      } catch (error) {
        console.warn('API readiness check failed', error);
        if (!cancelled) {
          setApiHealth('error');
        }
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiBaseUrl, buildHeaders, canCallApi, mode, healthTick]);

  useEffect(() => {
    if (result?.creator_vault) {
      setGovernanceForm((prev) => ({
        ...prev,
        creatorVault: result.creator_vault ?? '',
      }));
    }
  }, [result?.creator_vault]);

  return (
    <section className="mb-12 rounded-2xl border border-primary/20 bg-gray-900/40 p-6 shadow-lg">
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Squads Safe Onboarding</h2>
          <p className="text-sm text-gray-300">
            Generate a 2-of-2 safe (sponsor + attn) and capture the request metadata required for Pump.fun CTO
            submissions.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-primary/40 px-3 py-1 text-sm text-primary hover:bg-primary/10"
          onClick={() => copyToClipboard(runtimeEnv.attnSquadsMember, 'attnWallet')}
        >
          Copy attn co-signer wallet ({formatAddress(runtimeEnv.attnSquadsMember)})
        </button>
      </header>

      {mode === 'live' && (
        <div className="mb-4 rounded-lg border border-secondary/30 bg-secondary/10 p-3 text-xs text-secondary">
          Set your wallet network to <span className="font-semibold uppercase">{(runtimeEnv.cluster || configuredCluster || 'devnet').toUpperCase()}</span>.
          Phantom: Settings → Change Network → Devnet. Backpack: Avatar → Network → Devnet.
        </div>
      )}

      {!canCallApi && (
        <div className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
          Configure <code className="text-yellow-100">NEXT_PUBLIC_API_BASE</code>,
          <code className="text-yellow-100"> NEXT_PUBLIC_ATTN_API_KEY</code>, and{' '}
          <code className="text-yellow-100">NEXT_PUBLIC_CSRF_TOKEN</code> to enable live submissions.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-gray-300">
        <span
          aria-hidden
          className={clsx('inline-flex h-2 w-2 rounded-full', {
            'bg-green-400': apiHealth === 'healthy',
            'bg-red-400': apiHealth === 'error',
            'bg-gray-600': apiHealth === 'unknown',
          })}
        />
        <span>
          {apiHealth === 'healthy'
            ? 'attn API ready for live submissions.'
            : apiHealth === 'error'
            ? 'attn API readiness check failed. Verify your devnet API base, key, and CSRF token.'
            : 'API readiness unavailable in demo mode.'}
        </span>
        {mode === 'live' && canCallApi && (
          <button
            type="button"
            onClick={() => setHealthTick((tick) => tick + 1)}
            className="rounded-md border border-primary/40 px-2 py-1 text-xs text-primary hover:bg-primary/10"
          >
            Recheck
          </button>
        )}
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col text-sm text-gray-200">
            Your sponsor wallet (creator / builder / DAO)
            <input
              className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white placeholder:text-gray-500 focus:border-primary focus:outline-none"
              value={form.creatorWallet}
              onChange={handleCreatorWalletChange}
              placeholder="Enter the wallet that will own the safe"
              required
            />
            <span className="mt-1 text-xs text-gray-400">
              Sponsors default to your connected wallet. Pump.fun creators should use the wallet currently receiving fee
              payouts; builders and DAOs can enter any signer that will co-own the Squads safe.
            </span>
            <span className="mt-1 text-xs text-gray-400">
              Already operating through an existing Squads safe? Enter the signer that administers it, you can link the
              safe after this request.
            </span>
            {autoFilledFromWallet ? (
              <span className="mt-1 text-xs text-green-400">
                Auto-filled from your connected wallet. Update it if a different signer should own the safe.
              </span>
            ) : null}
          </label>

          <div className="flex flex-col text-sm text-gray-200">
            attn co-signer wallet
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                className="w-full flex-1 rounded-md border border-primary/20 bg-gray-900/80 p-2 text-gray-400 focus:outline-none"
                value={form.attnWallet}
                readOnly
                disabled
              />
              <button
                type="button"
                className="whitespace-nowrap rounded-md border border-primary/40 px-2 py-1 text-xs text-primary hover:bg-primary/10"
                onClick={() => copyToClipboard(form.attnWallet, 'attnWallet')}
              >
                {copiedField === 'attnWallet' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <span className="mt-1 text-xs text-gray-400">
              attn signs alongside you for locked actions. You don&apos;t need to change this value.
            </span>
          </div>

          <label className="flex flex-col text-sm text-gray-200">
            Safe name
            <input
              className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
              value={form.safeName}
              onChange={(event) => updateForm({ safeName: event.target.value })}
              placeholder="Optional label"
            />
          </label>

          <label className="flex flex-col text-sm text-gray-200">
            Contact email
            <input
              type="email"
              className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
              value={form.contactEmail}
              onChange={(event) => updateForm({ contactEmail: event.target.value })}
              placeholder="Optional"
            />
            <span className="mt-1 text-xs text-gray-400">
              Optional — lets the attn team reach you if the safe creation needs follow-up.
            </span>
          </label>
          <label className="md:col-span-2 flex flex-col text-sm text-gray-200">
            Notes
            <textarea
              className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
              rows={3}
              value={form.notes}
              onChange={(event) => updateForm({ notes: event.target.value })}
              placeholder="Additional context for ops"
            />
          </label>
        </div>
        <p className="text-xs text-gray-400">
          Network is set automatically based on the mode you chose ({configuredCluster}).
        </p>

        <div className="rounded-lg border border-primary/30 bg-gray-900/60 p-4 text-sm text-gray-200 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-medium text-white">Step 1. Verify your wallet</h3>
              <p className="text-xs text-gray-300">
                Request a one-time nonce from the attn devnet API, then sign it so we know this submission really came from your wallet.
              </p>
            </div>
            <button
              type="button"
              className="rounded-md border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleRequestNonce}
              disabled={requestingNonce || !canCallApi}
              title={
                !canCallApi
                  ? 'Switch the app to Live (devnet) mode and configure the attn API credentials to enable this.'
                  : 'Send a one-time code from the attn devnet API.'
              }
            >
              {requestingNonce ? 'Requesting…' : 'Request nonce'}
            </button>
          </div>
          {!canCallApi && (
            <p className="rounded-md bg-yellow-500/10 p-2 text-xs text-yellow-200">
              Toggle Live mode (devnet) and provide NEXT_PUBLIC_API_BASE + attn API keys so this step can run.
            </p>
          )}
          {nonce && (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md bg-gray-950/60 p-2">
                <span>Nonce</span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => copyToClipboard(nonce.nonce, 'nonce')}
                >
                  {copiedField === 'nonce' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="rounded-md bg-gray-950/60 p-2 text-xs text-gray-300">
                Expires at: {new Date(nonce.expires_at).toLocaleString()}
              </div>
            </div>
          )}
          {nonceError && <p className="text-xs text-red-400">{nonceError}</p>}

          <hr className="border-gray-800" />

          <div>
            <h3 className="mb-2 text-base font-medium text-white">Step 2. Sign the nonce</h3>
            <p className="text-xs text-gray-300">
              Use your wallet&apos;s &ldquo;Sign Message&rdquo; flow (or click the button below) with the same sponsor wallet. This proves ownership of the address you&apos;re about to register.
            </p>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <pre
              className={clsx(
                'overflow-x-auto rounded-md bg-gray-950/60 p-3 text-xs',
                nonce?.nonce && sanitizedCreatorWallet ? 'text-gray-100' : 'text-gray-500'
              )}
            >
              {signMessage}
            </pre>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-primary/40 px-2 py-1 text-xs text-primary hover:bg-primary/10"
                onClick={() => copyToClipboard(signMessage, 'signMessage')}
              >
                {copiedField === 'signMessage' ? 'Copied message' : 'Copy message'}
              </button>
              {wallet?.signMessage ? (
                <button
                  type="button"
                  onClick={handleSignWithWallet}
                  disabled={!canUseWalletSigner || signing}
                  className={clsx(
                    'rounded-md border px-3 py-1 text-xs font-medium transition-colors',
                    canUseWalletSigner
                      ? 'border-secondary text-secondary hover:bg-secondary/10'
                      : 'border-gray-700 text-gray-500 cursor-not-allowed'
                  )}
                >
                  {signing ? 'Signing…' : 'Sign with connected wallet'}
                </button>
              ) : (
                <span className="text-xs text-gray-500">
                  Connect a wallet that supports message signing to autofill the signature.
                </span>
              )}
            </div>
            {signError && <span className="text-xs text-red-400">{signError}</span>}
            {!signError && canUseWalletSigner && form.creatorSignature && (
              <span className="text-xs text-green-400">Signature filled from the connected wallet.</span>
            )}
          </div>
          <label className="mt-3 flex flex-col text-sm text-gray-200">
            Creator signature
            <input
              className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
              value={form.creatorSignature}
              onChange={(event) => updateForm({ creatorSignature: event.target.value })}
              placeholder="Base58 signature"
            />
            <span className="mt-1 text-xs text-gray-400">
              Wallets such as Phantom show this under “Copy signature” after you sign.
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-primary/30 bg-gray-900/60 p-4 text-sm text-gray-200">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-medium text-white">Step 3. Send the Squads safe request</h3>
              <p className="text-xs text-gray-300">
                This packages your verified wallet into a Squads 2-of-2 request (sponsor + attn). Keep the submission key handy if you need support or have to retry.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Submission key</span>
              <code className="rounded bg-gray-950/60 px-2 py-1 text-xs text-primary">{idempotencyKey}</code>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  const next = generateIdempotencyKey();
                  setIdempotencyKey(next);
                  copyToClipboard(next, 'idempotency');
                }}
              >
                {copiedField === 'idempotency' ? 'Copied' : 'New key'}
              </button>
            </div>
          </div>

          {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting || !canCallApi}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              title="Send this safe creation request to the attn devnet API."
            >
              {submitting ? 'Submitting…' : 'Submit safe request to attn'}
            </button>
            <button
              type="button"
              className="rounded-md border border-primary/40 px-4 py-2 text-sm text-primary hover:bg-primary/10"
              onClick={resetAndClear}
            >
              Reset form
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Submissions are idempotent: reuse the same key to avoid duplicates. Only generate a new key if you intentionally want a fresh payload.
          </p>
        </div>
      </form>

      {result && (
        <div className="mt-8 rounded-xl border border-primary/40 bg-gray-900/70 p-4 text-sm text-gray-200">
          <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Safe request status</h3>
              <p className="text-xs text-gray-400">Request ID: {result.request_id}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-primary/40 px-3 py-1 text-xs text-primary hover:bg-primary/10"
                onClick={() => copyToClipboard(result.request_id, 'requestId')}
              >
                {copiedField === 'requestId' ? 'Copied ID' : 'Copy ID'}
              </button>
              <button
                type="button"
                className="rounded-md border border-primary/40 px-3 py-1 text-xs text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={handleRefreshStatus}
                disabled={polling || !canCallApi}
              >
                {polling ? 'Refreshing…' : 'Refresh status'}
              </button>
            </div>
          </header>
          <dl className="grid gap-3 md:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Status</dt>
              <dd className="text-sm font-medium text-white">{result.status}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Mode</dt>
              <dd className="text-sm text-gray-100">{result.mode}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Cluster</dt>
              <dd className="text-sm text-gray-100">{result.cluster}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Attempts</dt>
              <dd className="text-sm text-gray-100">{result.attempt_count}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Last attempt</dt>
              <dd className="text-sm text-gray-100">{formatDateTime(result.last_attempt_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Next retry window</dt>
              <dd className="text-sm text-gray-100">{formatDateTime(result.next_retry_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Last status check</dt>
              <dd className="text-sm text-gray-100">{formatDateTime(result.status_last_checked_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Status URL</dt>
              <dd className="flex items-center gap-2 text-sm text-gray-100 break-all">
                {result.status_url ?? 'Not provided'}
                {result.status_url && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => copyToClipboard(result.status_url ?? '', 'statusUrl')}
                  >
                    {copiedField === 'statusUrl' ? 'Copied' : 'Copy'}
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Safe address</dt>
              <dd className="flex items-center gap-2 text-sm text-gray-100">
                {result.safe_address ? formatAddress(result.safe_address) : 'Pending'}
                {result.safe_address && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => copyToClipboard(result.safe_address ?? '', 'safeAddress')}
                  >
                    {copiedField === 'safeAddress' ? 'Copied' : 'Copy'}
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Created</dt>
              <dd className="text-sm text-gray-100">{formatDateTime(result.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Updated</dt>
              <dd className="text-sm text-gray-100">{formatDateTime(result.updated_at)}</dd>
            </div>
            {result.status_last_response_hash && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Status payload hash</dt>
                <dd className="flex items-center gap-2 text-sm font-mono text-gray-300">
                  {result.status_last_response_hash}
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() =>
                      copyToClipboard(result.status_last_response_hash ?? '', 'statusHash')
                    }
                  >
                    {copiedField === 'statusHash' ? 'Copied' : 'Copy'}
                  </button>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Members</dt>
              <dd className="text-sm text-gray-100">{result.members.join(', ')}</dd>
            </div>
            {result.transaction_url && (
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-gray-400">Transaction</dt>
                <dd>
                  <a
                    className="text-sm text-primary underline"
                    href={result.transaction_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on explorer
                  </a>
                </dd>
              </div>
            )}
            {result.status_sync_error && (
              <div className="md:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-gray-400">Last sync error</dt>
                <dd className="text-sm text-red-300">{result.status_sync_error}</dd>
              </div>
            )}
            {result.creator_vault && (
              <div className="md:col-span-2 flex items-center gap-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-gray-400">CreatorVault</dt>
                  <dd className="text-sm text-gray-100">{formatAddress(result.creator_vault)}</dd>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => copyToClipboard(result.creator_vault ?? '', 'creatorVault')}
                >
                  {copiedField === 'creatorVault' ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
            {result.governance_linked_at && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-400">Governance linked</dt>
                <dd className="text-sm text-gray-100">{formatDateTime(result.governance_linked_at)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setShowRaw((prev) => !prev)}
            >
              {showRaw ? 'Hide raw response' : 'Show raw response'}
            </button>
            {result.idempotency_key && (
              <span className="text-xs text-gray-400">Idempotency: {result.idempotency_key}</span>
            )}
          </div>
          {showRaw && (
            <pre className="mt-3 max-h-64 overflow-y-auto rounded-md bg-gray-950/60 p-3 text-xs text-gray-100">
              {JSON.stringify(result.raw_response ?? {}, null, 2)}
            </pre>
          )}

          {(result.status === 'ready' || result.creator_vault) && (
            <div className="mt-6 rounded-lg border border-primary/30 bg-gray-900/60 p-4 text-sm text-gray-200">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-base font-medium text-white">Governance linkage</h4>
                  <p className="text-xs text-gray-300">
                    Both creator and attn must sign the message below to associate the safe with the CreatorVault.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => copyToClipboard(governanceMessage, 'governanceMessage')}
                  disabled={!governanceMessage}
                >
                  {copiedField === 'governanceMessage' ? 'Copied message' : 'Copy message'}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-md bg-gray-950/60 p-3 text-xs text-gray-100">{governanceMessage}</pre>
              {governanceForm.error && (
                <p className="mt-3 text-xs text-red-400">{governanceForm.error}</p>
              )}
              {governanceForm.success && (
                <p className="mt-3 text-xs text-emerald-400">{governanceForm.success}</p>
              )}
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="flex flex-col text-xs text-gray-200">
                  CreatorVault address
                  <input
                    className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
                    value={governanceForm.creatorVault}
                    onChange={(event) =>
                      setGovernanceForm((prev) => ({ ...prev, creatorVault: event.target.value }))
                    }
                    placeholder="CreatorVault PDA"
                  />
                </label>
                <label className="flex flex-col text-xs text-gray-200">
                  Creator signature
                  <input
                    className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
                    value={governanceForm.creatorSignature}
                    onChange={(event) =>
                      setGovernanceForm((prev) => ({ ...prev, creatorSignature: event.target.value }))
                    }
                    placeholder="Base58 signature"
                  />
                </label>
                <label className="flex flex-col text-xs text-gray-200">
                  attn signature
                  <input
                    className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
                    value={governanceForm.attnSignature}
                    onChange={(event) =>
                      setGovernanceForm((prev) => ({ ...prev, attnSignature: event.target.value }))
                    }
                    placeholder="Base58 signature"
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={handleLinkGovernance}
                  disabled={governanceForm.submitting || !canCallApi}
                >
                  {governanceForm.submitting ? 'Submitting…' : 'Link governance'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="mt-8 rounded-xl border border-primary/30 bg-gray-900/60 p-4 text-sm text-gray-200">
          <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Admin tools</h3>
              <p className="text-xs text-gray-400">Query, resubmit, or override recorded safe requests.</p>
            </div>
            <span className="text-xs text-gray-500">attn signer: {formatAddress(runtimeEnv.attnSquadsMember)}</span>
          </header>
          <form className="mb-4 grid gap-3 md:grid-cols-4" onSubmit={handleAdminFetch}>
            <label className="flex flex-col text-xs text-gray-200">
              Status
              <select
                className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
                value={adminFilters.status}
                onChange={(event) =>
                  setAdminFilters((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                <option value="">Any</option>
                <option value="pending">Pending</option>
                <option value="submitted">Submitted</option>
                <option value="ready">Ready</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label className="flex flex-col text-xs text-gray-200">
              Creator wallet
              <input
                className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
                value={adminFilters.creatorWallet}
                onChange={(event) =>
                  setAdminFilters((prev) => ({ ...prev, creatorWallet: event.target.value }))
                }
                placeholder="Optional filter"
              />
            </label>
            <label className="flex flex-col text-xs text-gray-200">
              Cluster
              <input
                className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
                value={adminFilters.cluster}
                onChange={(event) =>
                  setAdminFilters((prev) => ({ ...prev, cluster: event.target.value }))
                }
                placeholder={configuredCluster}
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canCallApi || adminLoading}
              >
                {adminLoading ? 'Loading…' : 'Load requests'}
              </button>
              <button
                type="button"
                className="rounded-md border border-primary/40 px-3 py-2 text-xs text-primary hover:bg-primary/10"
                onClick={() => {
                  setAdminFilters({ status: '', creatorWallet: '', cluster: '' });
                  setAdminRequests([]);
                }}
              >
                Clear
              </button>
            </div>
          </form>
          {adminError && <p className="mb-3 text-xs text-red-400">{adminError}</p>}
          {adminRequests.length === 0 ? (
            <p className="text-xs text-gray-400">No requests loaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-primary/20 text-xs text-gray-200">
                <thead className="bg-gray-950/40 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Request</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Attempts</th>
                    <th className="px-3 py-2 text-left">Next retry</th>
                    <th className="px-3 py-2 text-left">Safe</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/10">
                  {adminRequests.map((entry) => (
                    <tr key={entry.request_id}>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[11px] text-gray-100">
                            {formatAddress(entry.request_id)}
                          </span>
                          <button
                            type="button"
                            className="self-start text-[11px] text-primary hover:underline"
                            onClick={() => copyToClipboard(entry.request_id, `admin-${entry.request_id}`)}
                          >
                            {copiedField === `admin-${entry.request_id}` ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-gray-100">
                        <div className="font-medium text-white">{entry.status}</div>
                        <div className="text-[11px] text-gray-400">{entry.cluster}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-gray-100">
                        <div>{entry.attempt_count}</div>
                        <div className="text-[11px] text-gray-400">Last: {formatDateTime(entry.last_attempt_at)}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-gray-100">{formatDateTime(entry.next_retry_at)}</td>
                      <td className="px-3 py-2 align-top text-gray-100">
                        {entry.safe_address ? formatAddress(entry.safe_address) : '—'}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-primary/40 px-2 py-1 text-[11px] text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => handleAdminResubmit(entry.request_id, false)}
                            disabled={adminLoading || !canCallApi}
                          >
                            Resubmit
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-primary/40 px-2 py-1 text-[11px] text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => handleAdminResubmit(entry.request_id, true)}
                            disabled={adminLoading || !canCallApi}
                          >
                            Force
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-primary/40 px-2 py-1 text-[11px] text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => handleAdminOverride(entry.request_id)}
                            disabled={adminLoading || !canCallApi}
                          >
                            Override
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default SquadsSafeOnboarding;
