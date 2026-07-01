import { NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login'];

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Always allow public paths and Next.js internals
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('tn_token')?.value;

  // Not logged in — redirect to login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Decode JWT (signature verified by backend — we just read role here)
  const payload = decodeJwt(token);
  if (!payload) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const role = payload.role;

  // Root path → redirect based on role
  if (pathname === '/') {
    if (role === 'rider') return NextResponse.redirect(new URL('/rider', request.url));
    return NextResponse.redirect(new URL('/dashboard/orders', request.url));
  }

  // Rider tries to access dashboard → send to rider view
  if (pathname.startsWith('/dashboard') && role === 'rider') {
    return NextResponse.redirect(new URL('/rider', request.url));
  }

  // Non-rider tries to access rider route → send to dashboard
  if (pathname.startsWith('/rider') && role !== 'rider') {
    return NextResponse.redirect(new URL('/dashboard/orders', request.url));
  }

  // Shop staff can only access orders and inventory
  if (role === 'shop_staff') {
    const allowed = ['/dashboard/orders', '/dashboard/inventory'];
    if (!allowed.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/dashboard/orders', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
