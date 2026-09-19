// sentry.client.config.js — P13-4
// Sentry browser error monitoring.
// No webpack plugin — no build-time complications.
// Set NEXT_PUBLIC_SENTRY_DSN in Vercel environment variables.
// Get free DSN at: sentry.io (5K errors/month free)
import * as Sentry from '@sentry/browser';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN && typeof window !== 'undefined') {
  Sentry.init({
    dsn:              SENTRY_DSN,
    environment:      process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    beforeSend(event) {
      if (process.env.NODE_ENV === 'development') return null;
      return event;
    },
  });
}
