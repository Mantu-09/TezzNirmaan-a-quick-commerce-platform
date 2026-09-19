import { NextResponse } from 'next/server';

// All storefront routes are PUBLIC - no auth required for browsing
// Auth is only triggered at checkout (handled client-side via OTP bottom sheet)
const PUBLIC_PATHS = [
  '/',
  '/privacy',
  '/terms',
  '/about',
  '/contact',
  '/blog',
  '/category',
  '/product',
  '/search',
  '/city',
  '/join',
  '/b2b',
  '/refund-policy',
];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Always allow Next.js internals and API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Block any attempt to access internal routes that were deleted
  const BLOCKED_PATHS = ['/admin', '/dashboard', '/rider', '/login'];
  if (BLOCKED_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
