import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../app/api/bridge/[...path]/route';

describe('Bridge proxy route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE = 'https://attn-api.test';
    process.env.NEXT_PUBLIC_ATTN_API_KEY = 'test-api-key';
    process.env.NEXT_PUBLIC_CSRF_TOKEN = 'test-csrf';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('forwards POST bodies with duplex half and attn headers', async () => {
    const upstreamResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    const fetchMock = vi.fn().mockResolvedValue(upstreamResponse);
    vi.stubGlobal('fetch', fetchMock);

    const bodyPayload = JSON.stringify({ creator_wallet: 'Creator1111111111111111111111111111111' });
    const request = new Request('https://prod.attn.markets/api/bridge/v1/squads/safes/nonce', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bodyPayload,
    });

    const response = await POST(request, {
      params: { path: ['v1', 'squads', 'safes', 'nonce'] },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [targetUrl, init] = fetchMock.mock.calls[0];
    expect(targetUrl).toBe('https://attn-api.test/v1/squads/safes/nonce');
    expect(init?.method).toBe('POST');
    expect((init as any)?.duplex).toBe('half');
    expect(init?.body).toBeInstanceOf(ReadableStream);

    const forwardedHeaders = new Headers(init?.headers as HeadersInit);
    expect(forwardedHeaders.get('x-api-key')).toBe('test-api-key');
    expect(forwardedHeaders.get('x-attn-client')).toBe('test-csrf');
    expect(forwardedHeaders.get('content-type')).toBe('application/json');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
