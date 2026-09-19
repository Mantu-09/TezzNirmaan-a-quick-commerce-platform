import { NextResponse } from 'next/server';

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

  // Always allow login page and Next.js internals
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('tn_token')?.value;

  // Not logged in → redirect to partner login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const payload = decodeJwt(token);
  if (!payload) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const role = payload?.app_metadata?.role || payload?.user_metadata?.role || payload?.role;

  // STRICT: Only shop_owner and shop_staff can access this app
  if (role !== 'shop_owner' && role !== 'shop_staff') {
    const loginUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('tn_token');
    response.cookies.delete('tn_refresh');
    return response;
  }

  // Root → orders dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard/summary', request.url));
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
