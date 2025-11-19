// apps/dapp/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Define the valid app routes
  const allowedPaths = [
    '/',
    '/leaderboard',
    '/user',
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