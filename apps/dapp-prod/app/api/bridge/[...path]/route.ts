import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const LOCALHOST_REGEX = /https?:\/\/(localhost|127\.0\.0\.1)(:\\d+)?/i;
const FORWARDED_HEADERS = ['accept', 'accept-language', 'content-type', 'if-none-match', 'user-agent'];

type RouteParams = {
  params: { path?: string[] };
};

const buildUpstreamUrl = (base: string, pathSegments: string[] | undefined, requestUrl: string): string => {
  const trimmedBase = base.replace(/\/$/, '');
  const pathname = pathSegments && pathSegments.length > 0 ? `/${pathSegments.map(encodeURIComponent).join('/')}` : '';
  const search = new URL(requestUrl).search;
  return `${trimmedBase}${pathname}${search}`;
};

export async function GET(request: Request, context: RouteParams) {
  return proxyRequest(request, context);
}

export async function HEAD(request: Request, context: RouteParams) {
  return proxyRequest(request, context);
}

const proxyRequest = async (request: Request, context: RouteParams) => {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (!apiBase) {
    console.error('[bridge] NEXT_PUBLIC_API_BASE is not configured.');
    return NextResponse.json({ error: 'API base not configured' }, { status: 500 });
  }

  if (process.env.NODE_ENV === 'production' && LOCALHOST_REGEX.test(apiBase)) {
    console.error('[bridge] Refusing to proxy to localhost API in production:', apiBase);
    return NextResponse.json({ error: 'API base misconfigured' }, { status: 500 });
  }

  const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const targetUrl = buildUpstreamUrl(apiBase, context.params.path, request.url);
  const method = request.method.toUpperCase();
  const start = Date.now();

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (FORWARDED_HEADERS.includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const init: RequestInit = {
    method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  };

  if (method !== 'GET' && method !== 'HEAD' && request.body) {
    init.body = request.body;
  }

  try {
    const upstreamResponse = await fetch(targetUrl, init);
    const duration = Date.now() - start;

    if (upstreamResponse.status >= 400) {
      let bodyPreview: string | undefined;
      try {
        bodyPreview = await upstreamResponse.clone().text();
      } catch (err) {
        bodyPreview = undefined;
      }
      console.error(
        `[bridge:${requestId}] ${method} ${targetUrl} -> ${upstreamResponse.status} (${duration}ms)`,
        bodyPreview ? bodyPreview.slice(0, 1024) : '<empty>'
      );
    } else {
      console.info(`[bridge:${requestId}] ${method} ${targetUrl} -> ${upstreamResponse.status} (${duration}ms)`);
    }

    const responseHeaders = new Headers();
    upstreamResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'connection' || key.toLowerCase() === 'transfer-encoding') {
        return;
      }
      responseHeaders.set(key, value);
    });

    if (upstreamResponse.status === 304) {
      return new NextResponse(null, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    }

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[bridge:${requestId}] ${method} ${targetUrl} -> upstream error after ${duration}ms`, error);
    return NextResponse.json({ error: 'Failed to reach upstream API' }, { status: 502 });
  }
};
