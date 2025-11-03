#!/usr/bin/env node

/**
 * Minimal HTTP stub for attn-api endpoints used in Playwright tests.
 * Provides reset/config endpoints so tests can set up scenarios without hitting real infrastructure.
 */

const http = require('http');
const { URL } = require('url');

const DEFAULT_PORT = 3999;
const portArg = Number.parseInt(process.argv[2], 10);
const portEnv = Number.parseInt(process.env.MOCK_API_PORT ?? '', 10);
const PORT = Number.isFinite(portArg) ? portArg : Number.isFinite(portEnv) ? portEnv : DEFAULT_PORT;

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

const noContent = (res) => {
  res.writeHead(204).end();
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('request too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

const buildDefaultSafe = (wallet) => ({
  request_id: 'req-existing-safe-123',
  status: 'ready',
  safe_address: 'Safe111111111111111111111111111111111111111',
  transaction_url:
    'https://explorer.solana.com/address/Safe111111111111111111111111111111111111111?cluster=devnet',
  status_url: `https://attn.dev/status/req-existing-safe-123`,
  cluster: 'devnet',
  threshold: 2,
  members: [wallet, 'Attn111111111111111111111111111111111111111'],
  creator_wallet: wallet,
  attn_wallet: 'Attn111111111111111111111111111111111111111',
  mode: 'http',
  raw_response: {},
  idempotency_key: 'imported-idempotency-key',
  attempt_count: 1,
  last_attempt_at: new Date().toISOString(),
  next_retry_at: null,
  status_last_checked_at: new Date().toISOString(),
  status_sync_error: null,
  status_last_response_hash: null,
  creator_vault: 'CreatorVault1111111111111111111111111111111',
  governance_linked_at: new Date().toISOString(),
  import_source: 'mock-api',
  import_metadata: null,
  imported_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const state = {
  nonceCounter: 0,
  creatorSequences: new Map(), // wallet -> { sequence: string[], index: 0 }
  safePayloads: new Map(), // wallet -> safe payload
  duplicateMode: new Map(), // wallet -> boolean
  creatorRequestLog: new Map(), // wallet -> { count, clusters: string[] }
};

const resetState = () => {
  state.nonceCounter = 0;
  state.creatorSequences.clear();
  state.safePayloads.clear();
  state.duplicateMode.clear();
  state.creatorRequestLog.clear();
};

const recordCreatorRequest = (wallet, cluster) => {
  const entry = state.creatorRequestLog.get(wallet) ?? { count: 0, clusters: [] };
  entry.count += 1;
  entry.clusters.push(cluster ?? null);
  state.creatorRequestLog.set(wallet, entry);
};

const nextSequenceResult = (wallet) => {
  const entry = state.creatorSequences.get(wallet);
  if (!entry || entry.sequence.length === 0) {
    return 'ready';
  }
  const idx = Math.min(entry.index, entry.sequence.length - 1);
  const result = entry.sequence[idx];
  if (entry.index < entry.sequence.length - 1) {
    entry.index += 1;
  }
  return result;
};

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const { pathname, searchParams } = parsed;

  try {
    if (req.method === 'POST' && pathname === '/__reset') {
      resetState();
      noContent(res);
      return;
    }

    if (req.method === 'POST' && pathname === '/__config') {
      const raw = await readBody(req);
      const config = raw ? JSON.parse(raw) : {};
      const wallet = config.wallet;

      if (wallet) {
        if (Array.isArray(config.creatorSequence)) {
          state.creatorSequences.set(wallet, { sequence: config.creatorSequence, index: 0 });
        }
        if (config.safe) {
          state.safePayloads.set(wallet, config.safe);
        }
        if (typeof config.duplicate === 'boolean') {
          state.duplicateMode.set(wallet, config.duplicate);
        }
      }
      noContent(res);
      return;
    }

    if (req.method === 'GET' && pathname === '/__state') {
      json(res, 200, {
        nonceCounter: state.nonceCounter,
        creatorRequests: Array.from(state.creatorRequestLog.entries()).map(([wallet, info]) => ({
          wallet,
          count: info.count,
          clusters: info.clusters,
        })),
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/__health') {
      json(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'GET' && pathname === '/readyz') {
      json(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'GET' && pathname === '/version') {
      json(res, 200, { version: 'test', git_sha: 'test', built_at_unix: 0 });
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/overview') {
      json(res, 200, {
        total_creator_vaults: 1,
        total_markets: 1,
        total_fees_collected_sol: 1,
        attnusd_supply: 1,
        attnusd_nav: 1,
        updated_at: new Date().toISOString(),
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/attnusd') {
      json(res, 200, {
        total_supply: 1,
        nav_sol: 1,
        price_per_share: 1,
        seven_day_apy: 0.1,
        last_rebalance_slot: 1,
        updated_at: new Date().toISOString(),
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/markets') {
      json(res, 200, []);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/governance') {
      json(res, 200, { creator_vaults: [], rewards_pools: [], stable_vault: null });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/v1/portfolio/')) {
      json(res, 200, {
        wallet: pathname.split('/').pop(),
        deposits: [],
        positions: [],
        total_value_usdc: 0,
        updated_at: new Date().toISOString(),
      });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/v1/squads/safes/creator/')) {
      const wallet = pathname.split('/').pop();
      const cluster = searchParams.get('cluster');
      recordCreatorRequest(wallet, cluster);
      const outcome = nextSequenceResult(wallet);
      if (outcome === 'not_found' || outcome === '404') {
        json(res, 404, { error: 'not_found', message: 'Safe not found' });
        return;
      }
      const safe = state.safePayloads.get(wallet) ?? buildDefaultSafe(wallet);
      json(res, 200, safe);
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/v1/squads/safes/')) {
      const requestId = pathname.split('/').pop();
      for (const safe of state.safePayloads.values()) {
        if (safe.request_id === requestId) {
          json(res, 200, safe);
          return;
        }
      }
      json(res, 404, { error: 'not_found', message: 'Safe not recorded' });
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/squads/safes/nonce') {
      const nonceValue = `nonce-${++state.nonceCounter}`;
      json(res, 200, {
        nonce: nonceValue,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        ttl_seconds: 600,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/squads/safes') {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const wallet = payload.creator_wallet;
      if (wallet && state.duplicateMode.get(wallet)) {
        json(res, 409, {
          code: 'duplicate_request',
          message: 'A request for this creator already exists on the selected cluster (duplicate_request)',
        });
        return;
      }
      const safe = state.safePayloads.get(wallet) ?? buildDefaultSafe(wallet ?? 'unknown');
      json(res, 201, safe);
      return;
    }

    json(res, 404, { error: 'not_found', path: pathname });
  } catch (error) {
    console.error('[mock-api] handler failed', error);
    json(res, 500, { error: 'internal_error', message: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.info(`[mock-api] listening on http://127.0.0.1:${PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
