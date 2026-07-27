'use client';
// ────────────────────────────────────────────────────────────
// ReferralBanner — P4-2A
//
// Client component (must be 'use client' — uses useSearchParams).
// Shown at the top of the marketing page when ?ref=TN-XXXXXX is
// present in the URL (e.g. from a WhatsApp share link).
//
// Behaviour:
//   1. Reads the ?ref= query param
//   2. Stores it in a 30-day cookie so the mobile app can pre-fill
//      it when the user signs up (after downloading the app)
//   3. Shows a green welcome banner: "You were invited! Get ₹100 off"
//   4. Renders nothing if ?ref is absent
// ────────────────────────────────────────────────────────────
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Suspense } from 'react';

function ReferralBannerInner() {
  const params = useSearchParams();
  const ref    = params.get('ref');

  const [visible, setVisible] = useState(!!ref);

  useEffect(() => {
    if (!ref) return;

    // Validate format (TN- prefix + 4–8 alphanum chars)
    const isValid = /^TN-[A-Z0-9]{4,8}$/.test(ref.toUpperCase());
    if (!isValid) return;

    const normRef = ref.toUpperCase();

    // Store in cookie — 30 days, SameSite=Lax (safe for same-origin form posts)
    document.cookie = `tn_ref=${normRef}; max-age=${30 * 24 * 60 * 60}; path=/; SameSite=Lax`;

    setVisible(true);
  }, [ref]);

  if (!visible || !ref) return null;

  return (
    <div className="mkt-referral-banner" role="banner" aria-live="polite">
      <span className="mkt-referral-banner-emoji">🎁</span>
      <span className="mkt-referral-banner-text">
        You were invited by a friend!{' '}
        <strong>Sign up on TezzNirmaan and get ₹100 off your first order.</strong>
        {' '}Use code <code className="mkt-referral-code">{ref.toUpperCase()}</code> when you sign up.
      </span>
      <button
        className="mkt-referral-banner-close"
        onClick={() => setVisible(false)}
        aria-label="Dismiss referral banner"
      >
        ✕
      </button>
    </div>
  );
}

// Wrap in Suspense — required by Next.js when useSearchParams is used in a
// dynamically-imported client component (avoids the CSR bailout warning).
export default function ReferralBanner() {
  return (
    <Suspense fallback={null}>
      <ReferralBannerInner />
    </Suspense>
  );
}
