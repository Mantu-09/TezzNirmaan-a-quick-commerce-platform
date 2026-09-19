// ─────────────────────────────────────────────────────────────
// (storefront)/components/PostHogProvider.jsx — P13-4
//
// Wraps storefront with PostHog analytics.
// Tracks: page_view (auto), product_viewed, add_to_cart,
// checkout_started, order_placed, search_performed.
//
// Set NEXT_PUBLIC_POSTHOG_KEY in Vercel environment variables.
// Get free key at: posthog.com (2 min signup, no credit card)
//
// Gracefully no-ops when NEXT_PUBLIC_POSTHOG_KEY is not set.
// ─────────────────────────────────────────────────────────────
'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

const PH_KEY  = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const PH_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

// Singleton init guard
let initialized = false;

function initPostHog() {
  if (!PH_KEY || initialized || typeof window === 'undefined') return;
  initialized = true;

  posthog.init(PH_KEY, {
    api_host:              PH_HOST,
    capture_pageview:      false, // We capture manually below for SPA
    capture_pageleave:     true,
    autocapture:           false, // Controlled events only — keep data clean
    persistence:           'localStorage',
    disable_session_recording: false,
  });
}

// ── PostHogProvider — wrap in storefront layout ───────────────
export default function PostHogProvider({ children }) {
  const pathname      = usePathname();
  const searchParams  = useSearchParams();

  useEffect(() => {
    initPostHog();
  }, []);

  // Track page views on route change
  useEffect(() => {
    if (!PH_KEY || !initialized) return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return children;
}

// ── Exported event helpers (call from any component) ─────────
export function trackEvent(event, properties = {}) {
  if (!PH_KEY || !initialized) return;
  posthog.capture(event, properties);
}

export function identifyUser(userId, traits = {}) {
  if (!PH_KEY || !initialized) return;
  posthog.identify(userId, traits);
}

export function resetUser() {
  if (!PH_KEY || !initialized) return;
  posthog.reset();
}
