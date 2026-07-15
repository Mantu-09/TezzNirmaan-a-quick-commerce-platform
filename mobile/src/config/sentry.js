// ────────────────────────────────────────────────────────────
// Sentry Configuration — B7
//
// Initialise Sentry for crash reporting in production.
// Call initSentry() at the very top of App.jsx before any
// other code, so crashes during startup are also captured.
//
// Environment variables (in app.json extra or .env):
//   EXPO_PUBLIC_SENTRY_DSN — from sentry.io project settings
//
// Usage:
//   import { initSentry } from './src/config/sentry';
//   initSentry();
//   // Then wrap your navigator in Sentry.wrap() (see App.jsx)
// ────────────────────────────────────────────────────────────
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = Constants.expoConfig?.extra?.sentryDsn
  || process.env.EXPO_PUBLIC_SENTRY_DSN;

const isProd = !__DEV__;

export function initSentry() {
  if (!DSN) {
    if (isProd) {
      console.warn('[Sentry] EXPO_PUBLIC_SENTRY_DSN not set — crash reporting disabled in production');
    }
    return;
  }

  Sentry.init({
    dsn: DSN,

    // Only send errors in production; in dev just console.log them
    enabled: isProd,

    // Sample 100% of errors but only 10% of performance transactions
    // (perf tracing is not critical for V1 — keep Sentry costs near free tier)
    tracesSampleRate:     0.1,
    profilesSampleRate:   0.0,  // Profiling disabled until needed

    // Release tracking — helps filter errors by app version
    release: `${Constants.expoConfig?.name}@${Constants.expoConfig?.version}`,

    // Breadcrumb: include navigation transitions so we know the screen at crash time
    integrations: [
      Sentry.reactNativeTracingIntegration({
        routingInstrumentation: Sentry.reactNavigationIntegration(),
      }),
    ],

    // Scrub sensitive data before it leaves the device
    beforeSend(event) {
      // Remove any phone numbers from breadcrumbs (privacy: GDPR)
      if (event.breadcrumbs?.values) {
        event.breadcrumbs.values = event.breadcrumbs.values.map(b => ({
          ...b,
          message: b.message?.replace(/\+91\d{10}/g, '+91XXXXXXXXXX'),
        }));
      }
      return event;
    },
  });
}

/**
 * Capture a handled error manually (e.g., an API error we caught but want to log).
 * Use this instead of console.error for errors that are unexpected but not crashes.
 */
export function captureError(error, context = {}) {
  if (!DSN || !isProd) {
    console.error('[Sentry mock]', error, context);
    return;
  }
  Sentry.withScope(scope => {
    Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
    Sentry.captureException(error);
  });
}

/**
 * Set user context after login so crashes are linked to a user.
 * Only set userId (never PII like name or email) unless consent is obtained.
 */
export function setSentryUser(userId) {
  if (!DSN) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/**
 * Higher-order component for wrapping your root App component.
 * Enables automatic crash boundary + JS error reporting.
 */
export const wrap = Sentry.wrap;
