'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, SVGProps } from 'react';
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
  creator_wallet: string;
  attn_wallet: string;
  import_source?: string | null;
  import_metadata?: unknown;
  imported_at?: string | null;
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

interface SuccessNotice {
  type: 'new' | 'existing';
  message: string;
  cluster: string;
  requestId: string;
  safeAddress?: string | null;
  squadsUrl?: string | null;
  explorerUrl?: string | null;
  statusUrl?: string | null;
}

const LIVE_TOUR_STORAGE_KEY = 'attn.liveSponsorTour';
const PUMPFUN_CTO_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScCMDx2x2ewqaWvQ4JHs-hahEscqFKsV1NPoCTCIomil88AGA/viewform';

const CLUSTER_LABELS: Record<string, string> = {
  'mainnet-beta': 'Mainnet',
  mainnet: 'Mainnet',
  devnet: 'Devnet',
  testnet: 'Testnet',
  localnet: 'Localnet',
};

const normalizeCluster = (cluster?: string | null): string => {
  if (!cluster) {
    return 'devnet';
  }
  const trimmed = cluster.trim().toLowerCase();
  if (trimmed === 'mainnet-beta') return 'mainnet';
  if (trimmed === 'mainnet') return 'mainnet';
  if (trimmed === 'devnet') return 'devnet';
  if (trimmed === 'testnet') return 'testnet';
  if (trimmed === 'localnet') return 'devnet';
  return trimmed;
};

const formatClusterLabel = (cluster?: string | null): string => {
  const normalized = normalizeCluster(cluster);
  return CLUSTER_LABELS[normalized] ?? normalized;
};

const buildSquadsUiUrl = (cluster: string | undefined, safeAddress: string): string => {
  const normalizedCluster = normalizeCluster(cluster);
  const clusterSuffix = normalizedCluster === 'mainnet' ? '' : `?cluster=${normalizedCluster}`;
  return `https://app.squads.so/squad/${safeAddress}${clusterSuffix}`;
};

const buildSolanaExplorerUrl = (cluster: string | undefined, safeAddress: string): string => {
  const normalizedCluster = normalizeCluster(cluster);
  const clusterSuffix = normalizedCluster === 'mainnet' ? '' : `?cluster=${normalizedCluster}`;
  return `https://explorer.solana.com/address/${safeAddress}${clusterSuffix}`;
};

const sanitizeClusterValue = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : '';
};

const resolveCluster = (
  formCluster?: string,
  runtimeCluster?: string | null,
  configuredCluster?: string | null
): string => {
  const fromForm = sanitizeClusterValue(formCluster);
  if (fromForm) {
    return fromForm;
  }
  const fromRuntime = sanitizeClusterValue(runtimeCluster);
  if (fromRuntime) {
    return fromRuntime;
  }
  const fromConfigured = sanitizeClusterValue(configuredCluster);
  if (fromConfigured) {
    return fromConfigured;
  }
  return 'devnet';
};

const composeSuccessNotice = (record: CreatedSafe, type: 'new' | 'existing'): SuccessNotice => {
  const rawCluster = record.cluster ?? 'devnet';
  const clusterLabel = formatClusterLabel(rawCluster);
  const safeAddress = record.safe_address ?? null;
  const hasAddress = Boolean(safeAddress);
  const message =
    type === 'new'
      ? hasAddress
        ? `Squads safe is live on ${clusterLabel}.`
        : `Safe request submitted on ${clusterLabel}. We'll surface the address once Squads finishes deployment.`
      : hasAddress
      ? `Existing Squads safe detected on ${clusterLabel}.`
      : `A Squads safe request already exists on ${clusterLabel}.`;

  return {
    type,
    message,
    cluster: rawCluster,
    requestId: record.request_id,
    safeAddress,
    squadsUrl: hasAddress ? buildSquadsUiUrl(rawCluster, safeAddress as string) : null,
    explorerUrl: hasAddress ? buildSolanaExplorerUrl(rawCluster, safeAddress as string) : null,
    statusUrl: record.status_url ?? null,
  };
};

const ShieldIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    className={clsx('h-5 w-5', className)}
    {...props}
  >
    <path
      d="M12 3 5 6v5c0 4.8 3.1 8.8 7 9.5 3.9-.7 7-4.7 7-9.5V6l-7-3Z"
      strokeLinejoin="round"
    />
    <path d="m9.5 12.5 1.8 1.8 3.7-3.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChainIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    className={clsx('h-4 w-4', className)}
    {...props}
  >
    <path d="M9 7H7a4 4 0 0 0 0 8h2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 17h2a4 4 0 1 0 0-8h-2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 12h6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ExternalArrowIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    className={clsx('h-4 w-4', className)}
    {...props}
  >
    <path d="M13 5h6v6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m11 13 8-8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 13v6H5V5h6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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

const bridgePath = (path: string): string => `/api/bridge${path.startsWith('/') ? path : `/${path}`}`;

const SUBMIT_COOLDOWN_MS = 1200;

const SquadsSafeOnboarding: React.FC = () => {
  const { mode, apiBaseUrl, cluster: configuredCluster, apiKey, csrfToken, isAdmin } = useDataMode();
  const { currentUserWallet, currentUserCreator } = useAppContext();
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
  const [successNotice, setSuccessNotice] = useState<SuccessNotice | null>(null);
  const [prefetchState, setPrefetchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [prefetchKey, setPrefetchKey] = useState<string | null>(null);
  const [showFormGuide, setShowFormGuide] = useState(false);
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
  const [apiHealth, setApiHealth] = useState<'unknown' | 'checking' | 'healthy' | 'error'>('unknown');
  const [healthTick, setHealthTick] = useState(0);
  const [signing, setSigning] = useState(false);
  const [autoSigning, setAutoSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const tourDismissedRef = useRef(false);
  const submitCooldownRef = useRef(0);
  const submitCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitCoolingDown, setSubmitCoolingDown] = useState(false);
  const fetchingSafeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<NonceResponse>;
      const detail = customEvent.detail;
      if (!detail || typeof detail.nonce !== 'string' || detail.nonce.length === 0) {
        return;
      }
      setNonce(detail);
      setNonceError(null);
      try {
        (window as typeof window & { __attnLastNonce?: NonceResponse }).__attnLastNonce = detail;
      } catch (err) {
        console.warn('Failed to cache test nonce detail', err);
      }
    };
    window.addEventListener('attn:test:set-nonce', handler as EventListener);
    return () => {
      window.removeEventListener('attn:test:set-nonce', handler as EventListener);
    };
  }, []);


  const signatureComplete = useMemo(
    () =>
      Boolean(
        !signError &&
          nonce &&
          form.creatorSignature &&
          BASE58_SIGNATURE_REGEX.test(form.creatorSignature)
      ),
    [form.creatorSignature, nonce, signError]
  );

const markTourComplete = useCallback(() => {
    if (tourDismissedRef.current) {
      return;
    }
    tourDismissedRef.current = true;
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(LIVE_TOUR_STORAGE_KEY, 'seen');
      window.dispatchEvent(new CustomEvent('attn:squads-safe-created'));
    } catch (err) {
      console.warn('Failed to persist Squads tour dismissal', err);
    }
  }, []);

  const canCallApi =
    mode === 'live' && Boolean(apiBaseUrl && apiKey && csrfToken && runtimeEnv.attnSquadsMember);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    (window as typeof window & {
      __attnSquadsDebug?: {
        canCallApi: boolean;
        creatorWallet: string;
        hasNonce: boolean;
        submitting: boolean;
        error: string | null;
        creatorSignature: string;
      };
    }).__attnSquadsDebug = {
      canCallApi,
      creatorWallet: form.creatorWallet,
      hasNonce: Boolean(nonce?.nonce),
      submitting,
      error,
      creatorSignature: form.creatorSignature,
    };
  }, [canCallApi, form.creatorSignature, form.creatorWallet, nonce?.nonce, submitting, error]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ record: CreatedSafe; type?: 'existing' | 'new' }>;
      const detail = customEvent.detail;
      if (!detail || !detail.record) {
        return;
      }
      const record = detail.record;
      setResult(record);
      setSuccessNotice(composeSuccessNotice(record, detail.type ?? 'existing'));
      markTourComplete();
      try {
        window.dispatchEvent(new CustomEvent('attn:squads-safe-created'));
      } catch (err) {
        console.warn('Failed to emit Squads safe created test event', err);
      }
    };
    window.addEventListener('attn:test:set-result', handler as EventListener);
    return () => window.removeEventListener('attn:test:set-result', handler as EventListener);
  }, [markTourComplete]);

  const updateForm = useCallback((next: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...next }));
  }, []);

  const buildHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }
    if (csrfToken) {
      headers['X-ATTN-Client'] = csrfToken;
    }
    return headers;
  }, [apiKey, csrfToken]);

  const sanitizedCreatorWallet = sanitize(form.creatorWallet);
  const preferredCluster = useMemo(
    () => resolveCluster(form.cluster, runtimeEnv.cluster, configuredCluster),
    [configuredCluster, form.cluster]
  );

  const fetchExistingSafe = useCallback(
    async (
      walletAddress: string,
      { force, cluster }: { force?: boolean; cluster?: string } = {}
    ) => {
      if (!canCallApi || !walletAddress) {
        return false;
      }
      const targetCluster = sanitizeClusterValue(cluster) || preferredCluster;
      const fetchKey = `${targetCluster || 'default'}::${walletAddress}`;
      if (!force && fetchingSafeKeyRef.current === fetchKey) {
        return false;
      }
      if (!force && prefetchState === 'loading' && prefetchKey === fetchKey) {
        return false;
      }
      if (!force && prefetchState === 'done' && prefetchKey === fetchKey) {
        return true;
      }

      const querySuffix = targetCluster ? `?cluster=${encodeURIComponent(targetCluster)}` : '';

      fetchingSafeKeyRef.current = fetchKey;
      setPrefetchState('loading');
      setPrefetchKey(fetchKey);
      try {
        const response = await fetch(
          `${bridgePath(`/v1/squads/safes/creator/${walletAddress}`)}${querySuffix}`,
          {
            method: 'GET',
            headers: buildHeaders(),
            cache: 'no-store',
          }
        );
        if (response.status === 404) {
          setPrefetchState('done');
          setPrefetchKey(fetchKey);
          return false;
        }
        if (!response.ok) {
          const message = await response.text().catch(() => response.statusText);
          throw new Error(message || 'Failed to load existing Squads safe');
        }
        const data = (await response.json()) as CreatedSafe;
        setResult(data);
        setSuccessNotice(composeSuccessNotice(data, 'existing'));
        markTourComplete();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('attn:squads-safe-created'));
        }
        setPrefetchState('done');
        setPrefetchKey(fetchKey);
        return true;
      } catch (err) {
        console.warn('Failed to fetch existing safe metadata', err);
        setPrefetchState('error');
        setPrefetchKey(fetchKey);
        return false;
      } finally {
        if (fetchingSafeKeyRef.current === fetchKey) {
          fetchingSafeKeyRef.current = null;
        }
      }
    },
    [buildHeaders, canCallApi, markTourComplete, preferredCluster, prefetchKey, prefetchState]
  );

  const handleCreatorWalletChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      if (value === (connectedWalletAddress ?? '')) {
        setCreatorWalletManuallyEdited(false);
      } else {
        setCreatorWalletManuallyEdited(true);
      }
      updateForm({ creatorWallet: value });
      const trimmed = value.trim();
      if (canCallApi && BASE58_WALLET_REGEX.test(trimmed)) {
        void fetchExistingSafe(trimmed, { force: true, cluster: preferredCluster });
      }
    },
    [canCallApi, connectedWalletAddress, fetchExistingSafe, preferredCluster, updateForm]
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

  const syncResult = useCallback((updated: CreatedSafe) => {
    setResult((prev) => (prev && prev.request_id === updated.request_id ? updated : prev));
    setAdminRequests((prev) =>
      prev.length > 0
        ? prev.map((entry) => (entry.request_id === updated.request_id ? updated : entry))
        : prev
    );
  }, []);

  useEffect(() => {
    if (!result) {
      return;
    }
    setSuccessNotice((prev) => {
      if (!prev || prev.requestId !== result.request_id) {
        return prev;
      }
      return composeSuccessNotice(result, prev.type);
    });
    markTourComplete();
    setShowFormGuide(false);
  }, [markTourComplete, result]);

  useEffect(() => {
    if (!canCallApi || !sanitizedCreatorWallet) {
      if (prefetchState !== 'idle' || prefetchKey !== null) {
        setPrefetchState('idle');
        setPrefetchKey(null);
      }
      return;
    }
    if (!BASE58_WALLET_REGEX.test(sanitizedCreatorWallet)) {
      return;
    }

    const targetCluster = preferredCluster;
    const fetchKey = `${targetCluster || 'default'}::${sanitizedCreatorWallet}`;
    if (prefetchKey === fetchKey) {
      if (prefetchState === 'loading' || prefetchState === 'done') {
        return;
      }
    }

    if (
      result &&
      result.creator_wallet === sanitizedCreatorWallet &&
      sanitizeClusterValue(result.cluster) === sanitizeClusterValue(targetCluster)
    ) {
      if (prefetchKey !== fetchKey || prefetchState !== 'done') {
        setPrefetchState('done');
        setPrefetchKey(fetchKey);
      }
      return;
    }

    void fetchExistingSafe(sanitizedCreatorWallet, { cluster: targetCluster });
  }, [
    canCallApi,
    fetchExistingSafe,
    preferredCluster,
    prefetchKey,
    prefetchState,
    result,
    sanitizedCreatorWallet,
  ]);

  const isNonceExpired = useCallback((value: NonceResponse | null) => {
    if (!value) return true;
    const expiry = Date.parse(value.expires_at);
    if (Number.isNaN(expiry)) {
      return false;
    }
    // Give ourselves a small buffer so signatures do not race an expiry.
    return expiry <= Date.now() + 2000;
  }, []);

  const issueNonce = useCallback(async (): Promise<NonceResponse | null> => {
    setNonceError(null);
    const creatorWallet = sanitize(form.creatorWallet);

    if (!canCallApi) {
      setNonceError('Switch to live mode with API credentials to request a nonce.');
      return null;
    }
    if (!creatorWallet) {
      setNonceError('Enter the sponsor wallet (Builder, DAO, Creator) before requesting a nonce.');
      return null;
    }
    if (!BASE58_WALLET_REGEX.test(creatorWallet)) {
      setNonceError('Sponsor wallet must be a valid Solana address (base58, 32-44 chars).');
      return null;
    }
    if (!apiBaseUrl) {
      setNonceError('API base URL is not configured.');
      return null;
    }

    setRequestingNonce(true);
    try {
      const response = await fetch(bridgePath('/v1/squads/safes/nonce'), {
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
      return data;
    } catch (err) {
      console.error('Failed to request nonce', err);
      setNonceError(err instanceof Error ? err.message : 'Failed to request nonce.');
      return null;
    } finally {
      setRequestingNonce(false);
    }
  }, [apiBaseUrl, buildHeaders, canCallApi, form.creatorWallet]);

  const handleRequestNonce = useCallback(async () => {
    await issueNonce();
  }, [issueNonce]);

  const ensureActiveNonce = useCallback(async (): Promise<NonceResponse | null> => {
    if (nonce && !isNonceExpired(nonce)) {
      return nonce;
    }
    return issueNonce();
  }, [nonce, isNonceExpired, issueNonce]);

  const recoverFromExistingSafe = useCallback(
    async (creatorWallet: string, options: { cluster?: string; message?: string } = {}) => {
      const { cluster, message } = options;
      const loaded = await fetchExistingSafe(creatorWallet, { force: true, cluster });
      if (!loaded) {
        console.warn('Recovery flow could not load existing safe metadata');
      }
      updateForm({ creatorSignature: '' });
      setNonce(null);
      const refreshed = await issueNonce();
      if (!refreshed) {
        setNonceError('Generated a fresh nonce, but it failed to load automatically. Request another one.');
      }
      if (message) {
        setError(message);
      } else {
        setError(null);
      }
    },
    [fetchExistingSafe, issueNonce, updateForm]
  );

  useEffect(() => {
    return () => {
      if (submitCooldownTimerRef.current) {
        clearTimeout(submitCooldownTimerRef.current);
      }
    };
  }, []);

  const startSubmitCooldown = useCallback(() => {
    const expiresAt = Date.now() + SUBMIT_COOLDOWN_MS;
    submitCooldownRef.current = expiresAt;
    setSubmitCoolingDown(true);
    if (submitCooldownTimerRef.current) {
      clearTimeout(submitCooldownTimerRef.current);
    }
    submitCooldownTimerRef.current = setTimeout(() => {
      submitCooldownRef.current = 0;
      submitCooldownTimerRef.current = null;
      setSubmitCoolingDown(false);
    }, SUBMIT_COOLDOWN_MS);
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setSuccessNotice(null);

      const creatorWallet = sanitize(form.creatorWallet);
      const attnWallet = sanitize(form.attnWallet) || runtimeEnv.attnSquadsMember;
      const signature = sanitize(form.creatorSignature);

      const errors: string[] = [];
      if (!creatorWallet) {
        errors.push('Sponsor wallet is required.');
      } else if (!BASE58_WALLET_REGEX.test(creatorWallet)) {
        errors.push('Sponsor wallet must be a valid Solana address (base58, 32-44 chars).');
      }
      if (!BASE58_WALLET_REGEX.test(attnWallet)) {
        errors.push('attn wallet must be a valid Solana address.');
      }
      if (!nonce) {
        errors.push('Request a nonce before submitting the safe creation request.');
      }
      if (!signature) {
        errors.push('Provide the sponsor signature for the nonce.');
      } else if (!BASE58_SIGNATURE_REGEX.test(signature)) {
        errors.push('Sponsor signature must be base58 encoded.');
      }
      if (form.threshold !== 2) {
        errors.push('Threshold must be 2 for a 2-of-2 Squads safe.');
      }
      if (!canCallApi) {
        errors.push('Switch to live mode with API credentials to submit.');
      }
      if (errors.length > 0) {
        setError(errors.join(' '));
        return;
      }
      if (submitCoolingDown) {
        setError('Give attn a moment to respond before trying again.');
        return;
      }

      startSubmitCooldown();
      setSubmitting(true);
      try {
        if (!apiBaseUrl) {
          setError('API base URL is not configured.');
          return;
        }
        const normalizedThreshold = 2;
        if (form.threshold !== normalizedThreshold) {
          updateForm({ threshold: normalizedThreshold });
        }
        const bodyPayload = {
          creator_wallet: creatorWallet,
          attn_wallet: attnWallet,
          safe_name: sanitize(form.safeName) || undefined,
          cluster: sanitize(form.cluster) || undefined,
          threshold: normalizedThreshold,
          contact_email: sanitize(form.contactEmail) || undefined,
          note: sanitize(form.notes) || undefined,
          nonce: nonce?.nonce,
          creator_signature: signature,
          idempotency_key: idempotencyKey,
        };

        const response = await fetch(bridgePath('/v1/squads/safes'), {
          method: 'POST',
          headers: {
            ...buildHeaders(),
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(bodyPayload),
        });

        if (!response.ok) {
          const raw = await response.text().catch(() => '');
          let parsed: { message?: string; error?: string; code?: string } | null = null;
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = null;
            }
          }
          const message = parsed?.message || parsed?.error || response.statusText;
          const code = parsed?.code;
          const combined = code ? `${message} (${code})` : message;
          throw new Error(combined || 'Failed to create Squads safe');
        }

        const data = (await response.json()) as CreatedSafe;
        setResult(data);
        const submissionType = response.status === 201 ? 'new' : 'existing';
        setSuccessNotice(composeSuccessNotice(data, submissionType));
        if (data.safe_address) {
          markTourComplete();
        }
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
        if (err instanceof Error && /duplicate_request/i.test(err.message)) {
          const clusterOverride = sanitizeClusterValue(form.cluster) || preferredCluster;
          setIdempotencyKey(generateIdempotencyKey());
          await recoverFromExistingSafe(creatorWallet, {
            cluster: clusterOverride,
            message: 'Existing Squads safe detected. Generated a fresh nonce so you can copy your safe details.',
          });
          return;
        }
        if (err instanceof Error && /nonce_invalid/i.test(err.message)) {
          await recoverFromExistingSafe(creatorWallet, {
            cluster: sanitizeClusterValue(form.cluster) || preferredCluster,
            message: 'Nonce expired or already used. Generated a new code—sign again to continue.',
          });
          return;
        }
        const baseMessage = err instanceof Error ? err.message : 'Failed to create Squads safe.';
        const enhancedMessage = (() => {
          if (/squads_create_failed/i.test(baseMessage)) {
            return `${baseMessage} — Squads returned an error. Check attn-api logs or the admin console, then retry once resolved.`;
          }
          if (/unexpected server error/i.test(baseMessage)) {
            return `${baseMessage} — inspect the attn-api Cloud Run revision logs for the corresponding request and retry after the upstream issue clears.`;
          }
          return baseMessage;
        })();
        setError(enhancedMessage);
      } finally {
        setSubmitting(false);
      }
    },
    [
      apiBaseUrl,
      buildHeaders,
      canCallApi,
      fetchExistingSafe,
      form,
      idempotencyKey,
      issueNonce,
      markTourComplete,
      nonce,
      preferredCluster,
      recoverFromExistingSafe,
      startSubmitCooldown,
      submitCoolingDown,
      updateForm,
    ]
  );

  const handleRefreshStatus = useCallback(async () => {
    if (!result || !apiBaseUrl || !canCallApi) return;
    setPolling(true);
    try {
      const response = await fetch(bridgePath(`/v1/squads/safes/${result.request_id}`), {
        method: 'GET',
        headers: buildHeaders(),
      });
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
      const response = await fetch(bridgePath(`/v1/squads/safes/${result.request_id}/governance`), {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          creator_vault: creatorVault,
          creator_signature: creatorSignature,
          attn_signature: attnSignature,
        }),
      });
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
        const response = await fetch(bridgePath(`/v1/squads/safes${query ? `?${query}` : ''}`), {
          method: 'GET',
          headers: buildHeaders(),
        });
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
        const response = await fetch(bridgePath(`/v1/squads/safes/${requestId}/resubmit`), {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({ force }),
        });
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
        const response = await fetch(bridgePath(`/v1/squads/safes/${requestId}/status`), {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({
            status: statusPrompt,
            safe_address: safeAddress,
            transaction_url: transactionUrl || undefined,
            note: note && note.length > 0 ? note : undefined,
          }),
        });
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
    setSuccessNotice(null);
    setCopiedField(null);
    setNonceError(null);
    setShowRaw(false);
    setIdempotencyKey(generateIdempotencyKey());
  }, [defaultFormState]);

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

  const safeIsReady = (result?.status ?? '').toLowerCase() === 'ready';
  const pumpMint = currentUserCreator?.pump_mint ?? '';
  const coinName = currentUserCreator?.market ?? currentUserCreator?.wallet ?? '';
  const defaultContactEmail = form.contactEmail || 'Use a reachable contact email';

  const GuideOverlay = () => {
    if (!result || !showFormGuide) {
      return null;
    }
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-primary/50 bg-gray-950/95 p-6 shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-white">Pump.fun CTO Form Helper</h3>
              <p className="mt-1 text-sm text-gray-300">
                Keep this open while you fill the Google Form. Copy each answer into the matching prompt to avoid hunting
                for details mid-application.
              </p>
            </div>
            <button
              type="button"
              className="rounded-md border border-primary/40 px-3 py-1 text-sm text-primary hover:bg-primary/10"
              onClick={() => setShowFormGuide(false)}
            >
              Close
            </button>
          </div>

          <ol className="space-y-4 text-sm text-gray-200">
            <li className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-wide text-primary/70">Provide your email</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="break-all text-sm text-gray-100">{defaultContactEmail}</span>
                {form.contactEmail && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => copyToClipboard(form.contactEmail, 'pumpfunEmail')}
                  >
                    {copiedField === 'pumpfunEmail' ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Use an inbox you check often—pump.fun&rsquo;s response will land there.
              </p>
            </li>

            <li className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-wide text-primary/70">X username</p>
              <p className="mt-2 text-xs text-gray-400">
                Paste the project&rsquo;s X handle (for example {coinName || '@yourcoin'}). The form expects the handle, not a
                full URL.
              </p>
            </li>

            <li className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-wide text-primary/70">Coin contract address</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="break-all font-mono text-sm text-gray-100">
                  {pumpMint || 'Paste the SOL contract address from pump.fun'}
                </span>
                {pumpMint && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => copyToClipboard(pumpMint, 'pumpfunMint')}
                  >
                    {copiedField === 'pumpfunMint' ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
            </li>

            <li className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-wide text-primary/70">Wallet to receive CTO fees</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="break-all font-mono text-sm text-gray-100">{result.creator_wallet}</span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => copyToClipboard(result.creator_wallet, 'pumpfunCreatorWallet')}
                >
                  {copiedField === 'pumpfunCreatorWallet' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Pump.fun currently supports single-signature payouts. This is the sponsor wallet that co-owns the Squads
                safe.
              </p>
            </li>

            <li className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-primary/70">attn co-signer</p>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => copyToClipboard(result.attn_wallet, 'pumpfunAttnWalletGuide')}
                >
                  {copiedField === 'pumpfunAttnWalletGuide' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="break-all font-mono text-sm text-gray-100">{result.attn_wallet}</p>
              <p className="text-xs text-gray-400">
                Mention this signer in the free-response section so reviewers understand attn co-signs every sweep.
              </p>
            </li>

            {result.safe_address && (
              <li className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-primary/70">Squads safe address</p>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => copyToClipboard(result.safe_address ?? '', 'pumpfunSafeGuide')}
                  >
                    {copiedField === 'pumpfunSafeGuide' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="break-all font-mono text-sm text-gray-100">{result.safe_address}</p>
                <p className="text-xs text-gray-400">
                  Include this in the “Provide social proof” upload or description so pump.fun can verify the multisig on
                  chain.
                </p>
              </li>
            )}

            <li className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-wide text-primary/70">Verification tweet</p>
              <p className="mt-2 text-xs text-gray-400">
                Tweet “@pumpdotfun verify CTO” from the project&rsquo;s X account and paste the tweet URL. Keep it pinned
                until support confirms the upgrade.
              </p>
            </li>

            <li className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-wide text-primary/70">Upload supporting evidence</p>
              <p className="mt-2 text-xs text-gray-400">
                Attach screenshots or links showing you operate the communities (Telegram admin panel, Discord roles, X
                analytics, etc.). The more context, the faster pump.fun can approve the switch.
              </p>
            </li>
          </ol>
        </div>
      </div>
    );
  };

  const governanceMessage = useMemo(() => {
    if (!result) return '';
    const vault = sanitize(governanceForm.creatorVault) || '<creator-vault>';
    return `${GOVERNANCE_MESSAGE_PREFIX}:${result.request_id}:${vault}`;
  }, [governanceForm.creatorVault, result]);

  const canUseWalletSigner =
    Boolean(wallet.signMessage) &&
    Boolean(connectedWalletAddress) &&
    sanitizedCreatorWallet.length > 0 &&
    connectedWalletAddress === sanitizedCreatorWallet &&
    canCallApi;
  const signingButtonLabel = signing
    ? 'Signing…'
    : autoSigning
    ? 'Requesting nonce…'
    : 'Request & sign with connected wallet';
  const signButtonDisabled = !canUseWalletSigner || signing || autoSigning || requestingNonce;
  const submitButtonDisabled = submitting || !canCallApi || submitCoolingDown || requestingNonce;
  const submitButtonLabel = submitting
    ? 'Submitting…'
    : submitCoolingDown
    ? 'Cooling down…'
    : requestingNonce
    ? 'Requesting nonce…'
    : 'Submit safe request to attn';

  const handleSignWithWallet = useCallback(async () => {
    if (!wallet?.signMessage) {
      setSignError('Connected wallet cannot sign messages in this context.');
      return;
    }
    if (!connectedWalletAddress || connectedWalletAddress !== sanitizedCreatorWallet) {
      setSignError('Use the same wallet you entered above to sign this message.');
      return;
    }
    if (!canCallApi) {
      setSignError('Switch to live mode with API credentials before signing.');
      return;
    }
    try {
      setSigning(true);
      setAutoSigning(true);
      setSignError(null);
      const activeNonce = await ensureActiveNonce();
      if (!activeNonce) {
        setSignError('Unable to request a nonce. Resolve the highlighted issue and try again.');
        return;
      }
      const message = `${SIGNATURE_MESSAGE_PREFIX}:${activeNonce.nonce}:${sanitizedCreatorWallet}`;
      const signatureBytes = await wallet.signMessage(new TextEncoder().encode(message));
      const signature = bs58.encode(signatureBytes);
      updateForm({ creatorSignature: signature });
    } catch (err) {
      console.error('Wallet message signing failed', err);
      setSignError(err instanceof Error ? err.message : 'Failed to sign message.');
    } finally {
      setSigning(false);
      setAutoSigning(false);
    }
  }, [wallet, connectedWalletAddress, sanitizedCreatorWallet, canCallApi, ensureActiveNonce, updateForm]);

  const handleResetSignature = useCallback(() => {
    setSignError(null);
    updateForm({ creatorSignature: '' });
  }, [updateForm]);

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

      if (!cancelled) {
        setApiHealth('checking');
      }
      try {
        const response = await fetch('/api/bridge/readyz', {
          headers: buildHeaders(),
          cache: 'no-store',
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
    void checkHealth();
    const interval = setInterval(() => {
      void checkHealth();
    }, 30000);
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
    <>
      <GuideOverlay />
      <section className="mb-12 rounded-2xl border border-primary/20 bg-gray-900/40 p-6 shadow-lg">
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Squads Safe Onboarding</h2>
          <p className="text-sm text-gray-300">
            Generate a 2-of-2 safe (sponsor + attn) and capture the request metadata required for Pump.fun CTO
            submissions.
          </p>
        </div>
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
            'bg-yellow-400': apiHealth === 'checking',
            'bg-red-400': apiHealth === 'error',
            'bg-gray-600': apiHealth === 'unknown',
          })}
        />
        <span>
          {apiHealth === 'healthy'
            ? 'attn API ready for live submissions.'
            : apiHealth === 'error'
            ? 'attn API readiness check failed. Verify your devnet API base, key, and CSRF token.'
            : apiHealth === 'checking'
            ? 'Checking attn API readiness…'
            : 'API readiness unavailable in demo mode.'}
        </span>
        {mode === 'live' && canCallApi && (
          <button
            type="button"
            onClick={() => {
              setApiHealth('checking');
              setHealthTick((tick) => tick + 1);
            }}
            disabled={apiHealth === 'checking'}
            className="rounded-md border border-primary/40 px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {apiHealth === 'checking' ? 'Rechecking…' : 'Recheck'}
          </button>
        )}
      </div>

      {successNotice && (
        <div className="mb-6 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <div className="flex items-start gap-3">
            <ShieldIcon className="mt-1 flex-shrink-0 text-emerald-300" />
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-sm font-semibold text-emerald-200">
                  {successNotice.type === 'new'
                    ? 'Squads safe request submitted'
                    : 'Existing Squads safe found'}
                </p>
                <p className="mt-1 text-emerald-100/90">{successNotice.message}</p>
                <p className="mt-1 text-xs text-emerald-200/80">
                  Cluster: {formatClusterLabel(successNotice.cluster)}
                </p>
              </div>
              {successNotice.safeAddress ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
                  <ChainIcon className="text-emerald-300" />
                  <span className="font-mono">{formatAddress(successNotice.safeAddress)}</span>
                  <button
                    type="button"
                    className="text-xs text-emerald-200 hover:underline"
                    onClick={() =>
                      copyToClipboard(successNotice.safeAddress ?? '', 'successSafeAddress')
                    }
                  >
                    {copiedField === 'successSafeAddress' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {successNotice.squadsUrl && (
                  <a
                    href={successNotice.squadsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/10"
                  >
                    <ShieldIcon className="h-4 w-4 text-emerald-300" />
                    <span>Open in Squads</span>
                    <ExternalArrowIcon className="h-3 w-3 text-emerald-300" />
                  </a>
                )}
                {successNotice.explorerUrl && (
                  <a
                    href={successNotice.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/10"
                  >
                    <ChainIcon className="h-4 w-4 text-emerald-300" />
                    <span>View on Solana explorer</span>
                    <ExternalArrowIcon className="h-3 w-3 text-emerald-300" />
                  </a>
                )}
                {successNotice.statusUrl && (
                  <a
                    href={successNotice.statusUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-emerald-400/40 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/10"
                  >
                    <ExternalArrowIcon className="h-4 w-4 text-emerald-300" />
                    <span>Check attn status</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {safeIsReady && result && (
        <div className="mb-6 rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm text-gray-100">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Pump.fun CTO submission</h3>
              <p className="text-sm text-primary/90">
                Pump.fun will ask for proof that you co-own this safe. Copy the details below before opening the
                verification form.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={PUMPFUN_CTO_FORM_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-black hover:bg-primary/90"
              >
                Open Pump.fun form
                <ExternalArrowIcon className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-3 py-2 text-sm text-primary hover:bg-primary/10"
                onClick={() => setShowFormGuide(true)}
              >
                View field-by-field guide
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-primary/30 bg-gray-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-primary/70">Creator wallet</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="break-all font-mono text-sm text-white">{result.creator_wallet}</span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => copyToClipboard(result.creator_wallet, 'pumpfunCreator')}
                >
                  {copiedField === 'pumpfunCreator' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-primary/30 bg-gray-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-primary/70">attn co-signer</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="break-all font-mono text-sm text-white">{result.attn_wallet}</span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => copyToClipboard(result.attn_wallet, 'pumpfunAttn')}
                >
                  {copiedField === 'pumpfunAttn' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            {result.safe_address && (
              <div className="rounded-lg border border-primary/30 bg-gray-950/60 p-3">
                <p className="text-xs uppercase tracking-wide text-primary/70">Squads safe address</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="break-all font-mono text-sm text-white">{result.safe_address}</span>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => copyToClipboard(result.safe_address ?? '', 'pumpfunSafe')}
                  >
                    {copiedField === 'pumpfunSafe' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-primary/30 bg-gray-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-primary/70">Squads request ID</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="break-all font-mono text-sm text-white">{result.request_id}</span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => copyToClipboard(result.request_id, 'pumpfunRequestId')}
                >
                  {copiedField === 'pumpfunRequestId' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-xs text-primary/80">
            <li>Tweet “@pumpdotfun verify CTO” from your project&rsquo;s X account before submitting.</li>
            <li>Attach screenshots or links proving you administer the coin&rsquo;s community channels.</li>
            <li>Paste the wallets above when the form asks for the CTO payout destination.</li>
          </ul>
        </div>
      )}

      {!safeIsReady && (
        <form className="space-y-6" data-testid="sponsor-safe-form" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col text-sm text-gray-200">
            Your sponsor wallet (Builder, DAO, Creator)
            <input
              className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white placeholder:text-gray-500 focus:border-primary focus:outline-none"
              value={form.creatorWallet}
              onChange={handleCreatorWalletChange}
              placeholder="Enter the wallet that will own the safe"
              required
            />
            <span className="mt-1 text-xs text-gray-400">
              Sponsors default to your connected wallet. <br />
              Builders and DAOs can enter any signer that will co-own the Squads safe.<br />
              Pump.fun creators should use the wallet currently receiving fee payouts.
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
              Optional, lets the attn team reach you if the safe creation needs follow-up.
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

        <div
          className={clsx(
            'rounded-lg border p-4 text-sm transition-colors',
            signatureComplete
              ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-50'
              : 'border-primary/30 bg-gray-900/60 text-gray-200'
          )}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className={clsx('text-base font-medium', signatureComplete ? 'text-emerald-100' : 'text-white')}>
                Step 1. Verify and sign your wallet
              </h3>
              <p className={clsx('text-xs', signatureComplete ? 'text-emerald-200/80' : 'text-gray-300')}>
                We&apos;ll request a one-time nonce from the attn devnet API and sign it with your connected sponsor wallet to prove ownership.
              </p>
            </div>
            <a
              href="https://t.me/twentyOne2x"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              Chat with the team
            </a>
          </div>

          {signatureComplete && (
            <div className="mt-3 flex flex-col gap-2 rounded-md border border-emerald-500/40 bg-emerald-900/40 p-3 text-xs text-emerald-100 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-semibold">Signature captured — Step 1 complete.</div>
              <button
                type="button"
                onClick={handleResetSignature}
                className="inline-flex items-center justify-center rounded-md border border-emerald-400/60 px-3 py-1 text-[11px] font-medium text-emerald-50 transition hover:bg-emerald-800/60"
              >
                Update signature
              </button>
            </div>
          )}

          <div className={clsx('mt-4 space-y-4', signatureComplete && 'pointer-events-none opacity-40')}>
            <div className="flex flex-wrap items-center gap-3">
              {wallet?.signMessage ? (
                <button
                  type="button"
                  onClick={handleSignWithWallet}
                  disabled={signButtonDisabled}
                  className={clsx(
                    'rounded-xl border-2 px-4 py-3 text-sm sm:text-base font-semibold transition-all duration-200 shadow-lg focus:outline-none focus:ring-2 focus:ring-secondary/60 disabled:cursor-not-allowed disabled:opacity-60',
                    signButtonDisabled
                      ? 'border-gray-700 text-gray-500'
                      : 'border-secondary bg-secondary/10 text-secondary hover:bg-secondary/20 hover:-translate-y-0.5'
                  )}
                >
                  {signingButtonLabel}
                </button>
              ) : (
                <span className="text-xs text-gray-500">
                  Connect a wallet that supports message signing to autofill the signature automatically.
                </span>
              )}
              <button
                type="button"
                className="rounded-md border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={handleRequestNonce}
                disabled={requestingNonce || !canCallApi}
                title={
                  !canCallApi
                    ? 'Switch the app to Live (devnet) mode and configure the attn API credentials to enable this.'
                    : 'Generate a nonce if you need to sign manually or refresh an expired code.'
                }
              >
                {requestingNonce ? 'Requesting…' : 'Generate nonce for manual signing'}
              </button>
            </div>

            {!canCallApi && (
              <p className="rounded-md bg-yellow-500/10 p-2 text-xs text-yellow-200">
                Toggle Live mode (devnet) and provide NEXT_PUBLIC_API_BASE + attn API keys so this step can run.
              </p>
            )}

            {nonce && (
              <div className="grid gap-2 md:grid-cols-2" data-attn-testid="nonce-block">
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
            </div>
            {signError && <span className="text-xs text-red-400">{signError}</span>}
            {!signError && canUseWalletSigner && form.creatorSignature && (
              <span className="text-xs text-green-400">Signature filled from the connected wallet.</span>
            )}

            <label className="flex flex-col text-sm text-gray-200">
              Manual signature (optional)
              <input
                className="mt-1 rounded-md border border-primary/40 bg-gray-950/60 p-2 text-white focus:border-primary focus:outline-none"
                data-testid="manual-signature-input"
                value={form.creatorSignature}
                onChange={(event) => updateForm({ creatorSignature: event.target.value })}
                placeholder="Base58 signature"
              />
              <span className="mt-1 text-xs text-gray-400">
                Only needed if your wallet cannot sign automatically. Wallets such as Phantom show this under “Copy signature” after you sign.
              </span>
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-primary/30 bg-gray-900/60 p-4 text-sm text-gray-200">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-medium text-white">Step 2. Send the Squads safe request</h3>
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
              disabled={submitButtonDisabled}
              aria-label="Submit safe request to attn"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              title="Send this safe creation request to the attn devnet API."
            >
              {submitButtonLabel}
            </button>
            <button
              type="button"
              className="rounded-md border border-primary/40 px-4 py-2 text-sm text-primary hover:bg-primary/10"
              onClick={resetAndClear}
            >
              Reset form
            </button>
          </div>
          {submitCoolingDown && (
            <p className="text-xs text-primary/70">
              Hold tight—we&apos;re refreshing your Squads request state. Try again in a second.
            </p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            Submissions are idempotent: reuse the same key to avoid duplicates. Only generate a new key if you intentionally want a fresh payload.
          </p>
        </div>
      </form>
      )}

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
                    Both sponsor (Builder, DAO, Creator) and attn must sign the message below to associate the safe with the CreatorVault.
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
    </>
  );
};

export default SquadsSafeOnboarding;
