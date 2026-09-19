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

  // Not logged in → redirect to admin login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const payload = decodeJwt(token);
  if (!payload) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const role = payload?.app_metadata?.role || payload?.user_metadata?.role || payload?.role;

  // STRICT: Only platform_admin can access this app
  if (role !== 'platform_admin') {
    // Clear the bad token and redirect to login with an error
    const loginUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('tn_token');
    response.cookies.delete('tn_refresh');
    return response;
  }

  // Root → admin analytics
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/admin/analytics', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
