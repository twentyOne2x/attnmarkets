// apps/dapp/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  const legacyRedirects: Record<string, string> = {
    '/creator': '/user',
    '/creators': '/user',
    '/users': '/user',
    '/sponasor': '/user',
  };

  if (normalizedPath in legacyRedirects) {
    const url = request.nextUrl.clone();
    url.pathname = legacyRedirects[normalizedPath];
    return NextResponse.redirect(url);
  }

  // Define the valid app routes
  const allowedPaths = [
    '/',
    '/user',
    '/leaderboard',
    '/deposit',
    '/_next',
    '/api',
    '/mock',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/manifest.json'
  ];
  
  // Check if the path starts with any allowed path
  const isAllowedPath = allowedPaths.some(allowedPath => 
    pathname === allowedPath || pathname.startsWith(`${allowedPath}/`)
  );
  
  // If it's not an allowed path, redirect to root (dashboard)
  if (!isAllowedPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
