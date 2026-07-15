// B7: Client-side Sentry shim for dashboard
// The dashboard is a Next.js app — Sentry for Next.js uses
// @sentry/nextjs. We provide a thin wrapper so error.jsx components
// can call captureError without importing a heavy SDK directly.
//
// To enable real Sentry in production:
//   npm install @sentry/nextjs
//   Then run: npx @sentry/wizard@latest -i nextjs
//   This generates sentry.client.config.js, sentry.server.config.js etc.
//
// Until that's done, this no-op shim keeps the error boundaries working.
// ────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Capture a client-side error. In production, sends to Sentry.
 * In development, logs to console.
 */
export function captureError(error, context = {}) {
  if (isDev) {
    console.error('[Sentry shim] Captured error:', error, context);
    return;
  }

  // In production, use the window.__SENTRY_SDK__ if @sentry/nextjs is installed
  try {
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.withScope(scope => {
        Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
        window.Sentry.captureException(error);
      });
    }
  } catch {
    // Fail silently — never let monitoring break the app
  }
}
