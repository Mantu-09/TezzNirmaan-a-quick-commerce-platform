// ─────────────────────────────────────────────────────────────
// (storefront)/order-confirmed/page.jsx — P10-2
//
// Order confirmation page shown after successful order placement.
// Reads order_number from ?num= query param.
//
// Shows:
//   • Animated success icon
//   • Order number (human-readable short code, e.g. TN-2026-XY4Z)
//   • Track Order link → /storefront/track?num=<order_number>
//   • Continue Shopping CTA
//   • App download promo (for real-time GPS tracking)
//
// Server component — uses searchParams for order number.
// No auth required (order_number is the publicly-shareable reference).
// ─────────────────────────────────────────────────────────────

// NOTE: metadata must live in a server component.
export async function generateMetadata() {
  return {
    title: 'Order Confirmed | TezzNirmaan',
    description: 'Your order has been placed successfully.',
    robots: { index: false, follow: false },
  };
}

export default function OrderConfirmedPage({ searchParams }) {
  const orderNumber = searchParams?.num || searchParams?.id || '';
  // H5: savings from first-order discount (WELCOME10) passed as ?saved=<paise>
  const savedPaise  = parseInt(searchParams?.saved || '0', 10);
  const savedRupees = savedPaise > 0 ? Math.round(savedPaise / 100) : 0;
  const earnedStamp = searchParams?.stamp === '1'; // loyalty stamp earned

  return (
    <div className="sf-wrap">
      <div className="sf-confirmed-wrap">

        {/* Animated checkmark */}
        <div className="sf-confirmed-icon-wrap">
          <div className="sf-confirmed-check">
            <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="26" cy="26" r="25" stroke="#16a34a" strokeWidth="2" fill="none" className="sf-check-circle" />
              <path d="M14 26 L22 34 L38 18" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sf-check-tick" fill="none" />
            </svg>
          </div>
        </div>

        <h1 className="sf-confirmed-title">Order Placed! 🎉</h1>

        {orderNumber ? (
          <p className="sf-confirmed-num">
            Order <strong>#{orderNumber}</strong>
          </p>
        ) : null}

        <p className="sf-confirmed-sub">
          Your order is confirmed. You'll receive an SMS with updates as it progresses.
          Delivery in <strong>60–90 minutes</strong> for quick-delivery items.
        </p>

        {/* Status steps */}
        <div className="sf-confirmed-steps">
          <div className="sf-step done">
            <div className="sf-step-dot">✓</div>
            <div className="sf-step-label">Order Placed</div>
          </div>
          <div className="sf-step-line" />
          <div className="sf-step">
            <div className="sf-step-dot">2</div>
            <div className="sf-step-label">Confirmed</div>
          </div>
          <div className="sf-step-line" />
          <div className="sf-step">
            <div className="sf-step-dot">3</div>
            <div className="sf-step-label">Out for Delivery</div>
          </div>
          <div className="sf-step-line" />
          <div className="sf-step">
            <div className="sf-step-dot">4</div>
            <div className="sf-step-label">Delivered</div>
          </div>
        </div>

        {/* Actions */}
        <div className="sf-confirmed-actions">
          {orderNumber && (
            <a href={`/track?num=${orderNumber}`} className="sf-checkout-btn sf-btn-lg" style={{ display: 'inline-flex', justifyContent: 'center', textDecoration: 'none' }}>
              🚴 Track Order →
            </a>
          )}
          <a href="/" className="sf-btn sf-btn-ghost sf-btn-lg" style={{ textDecoration: 'none', display: 'inline-flex', justifyContent: 'center' }}>
            ← Continue Shopping
          </a>
        </div>

        {/* P12-6 + H5: Cashback + referral + first-order savings nudge */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, margin: '24px 0' }}>
          {/* H5: First-order savings — shown when ?saved= > 0 */}
          {savedRupees > 0 && (
            <div style={{ padding: '16px 18px', borderRadius: 14, background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '1.5px solid #f59e0b', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 28 }}>🎁</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#92400e' }}>You saved ₹{savedRupees}!</div>
                <div style={{ fontSize: 12, color: '#78350f', marginTop: 2 }}>First order 10% welcome discount applied automatically.</div>
              </div>
            </div>
          )}
          {/* Loyalty stamp earned */}
          {earnedStamp && (
            <div style={{ padding: '16px 18px', borderRadius: 14, background: '#ede9fe', border: '1px solid #c4b5fd', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 28 }}>🎟️</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#5b21b6' }}>Loyalty Stamp Earned!</div>
                <div style={{ fontSize: 12, color: '#6d28d9', marginTop: 2 }}>5 stamps = free delivery on your next order.</div>
                <a href="/loyalty" style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>View Stamp Card →</a>
              </div>
            </div>
          )}
          <div style={{ padding: '16px 18px', borderRadius: 14, background: '#dcfce7', border: '1px solid #86efac', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 28 }}>🎁</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#166534' }}>Cashback Credited!</div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>Check your wallet for cashback from this order.</div>
              <a href="/wallet" style={{ fontSize: 12, fontWeight: 700, color: '#15803d', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>View Wallet →</a>
            </div>
          </div>
          <div style={{ padding: '16px 18px', borderRadius: 14, background: '#fff1ec', border: '1px solid #fed7aa', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 28 }}>🤝</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#9a3412' }}>Refer & Earn ₹50</div>
              <div style={{ fontSize: 12, color: '#9a3412', marginTop: 2 }}>Share your code. Friend gets ₹50, you get ₹50.</div>
              <a href="/referral" style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}>Get My Code →</a>
            </div>
          </div>
        </div>

        {/* App promo */}
        <div className="sf-app-promo-card">
          <div className="sf-app-promo-icon">📱</div>
          <div>
            <div className="sf-app-promo-title">Get real-time GPS tracking</div>
            <div className="sf-app-promo-sub">Download the TezzNirmaan app to track your rider live.</div>
            <div className="sf-app-badges" style={{ marginTop: 10 }}>
              <a
                href="https://play.google.com/store/apps/details?id=in.tezznirmaan.app"
                className="sf-app-badge"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5v-17c0-.83 1-.98 1.45-.47l16 8.5c.43.23.43.87 0 1.1l-16 8.5C3.98 21.48 3 21.33 3 20.5z"/></svg>
                Google Play
              </a>
              <a
                href="https://apps.apple.com/in/app/tezznirmaan/id0000000000"
                className="sf-app-badge"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                App Store
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
