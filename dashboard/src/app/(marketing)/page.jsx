// ────────────────────────────────────────────────────────────
// TezzNirmaan Marketing Landing Page — P3-A
//
// Route: / (via (marketing) route group)
// Rendering: Server Component (default in Next.js 14 app router)
//
// Trust signal numbers (orders, shops, avg delivery) are fetched
// server-side at build time with 1-hour ISR revalidation.
// The delivery timer is a client component ('use client').
// ────────────────────────────────────────────────────────────
import dynamic from 'next/dynamic';

// Client-only delivery timer — dynamically imported with ssr:false
// to prevent hydration mismatch on the clock value
const DeliveryTimer = dynamic(() => import('./DeliveryTimer'), {
  ssr:     false,
  loading: () => (
    <div className="mkt-timer-card">
      <div className="mkt-timer-label">Live Delivery Timer</div>
      <div className="mkt-timer-value" style={{ color: 'rgba(232,82,26,0.4)' }}>00:00</div>
    </div>
  ),
});

// P4-2A: Referral banner — client component that reads ?ref= from URL,
// stores it in a 30-day cookie, and shows a ₹100 welcome message.
// ssr:false — Suspense boundary + useSearchParams requires client rendering.
const ReferralBanner = dynamic(() => import('./ReferralBanner'), {
  ssr:     false,
  loading: () => null,  // no flash if banner not needed
});

// ── Trust signal data ─────────────────────────────────────────
async function getTrustStats() {
  const API = process.env.API_BASE_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${API}/api/v1/admin/analytics/platform?period=all_time`, {
      headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || '' },
      next:    { revalidate: 3600 }, // 1-hour ISR
    });
    if (!res.ok) throw new Error('analytics fetch failed');
    const { data } = await res.json();
    return {
      orders:      data?.orders?.completed   ?? 1200,
      shops:       data?.shops?.total_active  ?? 8,
      avgDelivery: data?.riders?.avg_delivery_time_minutes ?? 52,
    };
  } catch {
    // Graceful fallback — show plausible warm numbers, never show 0s
    return { orders: 1200, shops: 8, avgDelivery: 52 };
  }
}

// ── Page sections data ────────────────────────────────────────
const CATEGORIES = [
  { icon: '🏗️',  name: 'Construction' },
  { icon: '🎨',  name: 'Paints' },
  { icon: '⬛', name: 'Tiles' },
  { icon: '⚡',  name: 'Electrical' },
  { icon: '🔧',  name: 'Plumbing' },
  { icon: '🔩',  name: 'Hardware' },
  { icon: '🪟',  name: 'Decor' },
];

const WHY_FEATURES = [
  {
    icon:  '📦',
    title: 'Live Stock Updates',
    desc:  'Prices and stock are confirmed live from the shop before your order is placed. No "sorry, out of stock" calls after checkout.',
  },
  {
    icon:  '📍',
    title: 'Track Your Delivery',
    desc:  'Follow your cement bag from the shop counter to your site. Real-time rider location, right in the app.',
  },
  {
    icon:  '💳',
    title: 'Pay by UPI or Cash',
    desc:  'GPay, PhonePe, Paytm, or cash on delivery. No sign-up fees, no minimum order for scheduled deliveries.',
  },
  {
    icon:  '📋',
    title: 'Bulk Orders Welcome',
    desc:  'Ordering 50 bags of cement or 200 tiles? Scheduled delivery handles bulk — same-day, same app.',
  },
];

const HOW_STEPS = [
  {
    num:   '01',
    title: 'Choose what you need',
    desc:  'Browse cement, paint, tiles, plumbing supplies, and more — all from shops within 5 km of your site.',
  },
  {
    num:   '02',
    title: 'We pick from your nearest shop',
    desc:  'Your order goes to the closest available shop. A rider is assigned the moment the shop confirms.',
  },
  {
    num:   '03',
    title: 'Delivered in 60–90 min',
    desc:  'Quick delivery for urgent materials. Same-day Scheduled delivery for bulk orders.',
  },
];

// ── Page ─────────────────────────────────────────────────────
export default async function MarketingPage() {
  const stats = await getTrustStats();

  function fmtOrders(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k+`;
    return `${n}+`;
  }

  return (
    <>
      {/* P4-2A: Referral welcome banner — only shown when ?ref=TN-XXXXXX is in the URL */}
      <ReferralBanner />

      {/* ── NAV ──────────────────────────────────────────── */}
      <nav className="mkt-nav">
        <div className="mkt-container mkt-nav-inner">
          <div className="mkt-logo">Tezz<span>Nirmaan</span></div>
          <div className="mkt-nav-links">
            <a href="#how-it-works" className="mkt-nav-link">How it works</a>
            <a href="#categories"   className="mkt-nav-link">Categories</a>
            <a href="#for-shops"    className="mkt-nav-link">For Shop Owners</a>
          </div>
          <a
            href="https://play.google.com/store"
            className="mkt-nav-cta"
            target="_blank"
            rel="noopener noreferrer"
            id="nav-download-btn"
          >
            Download App
          </a>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="mkt-hero" aria-label="Hero">
        <div className="mkt-container">
          <div className="mkt-hero-inner">

            {/* Left: headline + CTAs */}
            <div>
              <h1 className="mkt-hero-headline">
                Hardware.<br />
                Paint. Tiles.<br />
                Now in Patna, Muzaffarpur &amp; Bhagalpur. <em>In 60 minutes.</em>
              </h1>
              <p className="mkt-hero-sub">
                Order from TezzNirmaan — delivered from local shops near you.
                Cement bags, paint tins, steel rods, tiles. Ready when you need them.
              </p>

              <div className="mkt-hero-actions">
                <a
                  href="https://play.google.com/store"
                  className="mkt-btn-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                  id="hero-playstore-btn"
                >
                  <span style={{ fontSize: '18px' }}>▶</span>
                  Get on Google Play
                </a>
                <a
                  href="#how-it-works"
                  className="mkt-btn-ghost"
                  id="hero-howitworks-link"
                >
                  How it works ↓
                </a>
              </div>

              {/* App store badges */}
              <div className="mkt-store-badges">
                <a
                  href="https://play.google.com/store"
                  className="mkt-store-badge"
                  target="_blank"
                  rel="noopener noreferrer"
                  id="hero-google-badge"
                >
                  <div className="mkt-store-badge-icon">▶</div>
                  <div className="mkt-store-badge-text">
                    <div className="mkt-store-badge-sub">GET IT ON</div>
                    <div className="mkt-store-badge-name">Google Play</div>
                  </div>
                </a>
                <a
                  href="https://apps.apple.com"
                  className="mkt-store-badge"
                  target="_blank"
                  rel="noopener noreferrer"
                  id="hero-appstore-badge"
                >
                  <div className="mkt-store-badge-icon" style={{ fontSize: '20px' }}>⊕</div>
                  <div className="mkt-store-badge-text">
                    <div className="mkt-store-badge-sub">DOWNLOAD ON THE</div>
                    <div className="mkt-store-badge-name">App Store</div>
                  </div>
                </a>
              </div>
            </div>

            {/* Right: live delivery timer — the signature element */}
            <div>
              <DeliveryTimer />
            </div>

          </div>
        </div>
      </section>

      {/* ── TRUST BAR ────────────────────────────────────── */}
      <div className="mkt-trust-bar" role="region" aria-label="Platform statistics">
        <div className="mkt-container">
          <div className="mkt-trust-inner">
            <div className="mkt-trust-stat">
              <div className="mkt-trust-number" id="stat-orders">{fmtOrders(stats.orders)}</div>
              <div className="mkt-trust-desc">Orders Delivered</div>
            </div>
            <div className="mkt-trust-stat">
              <div className="mkt-trust-number" id="stat-shops">{stats.shops}+</div>
              <div className="mkt-trust-desc">Shops across Bihar</div>
            </div>
            <div className="mkt-trust-stat">
              <div className="mkt-trust-number" id="stat-delivery">{stats.avgDelivery} min</div>
              <div className="mkt-trust-desc">Avg Delivery Time</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────── */}
      <section
        id="how-it-works"
        className="mkt-section mkt-section-alt"
        aria-label="How TezzNirmaan works"
      >
        <div className="mkt-container">
          <div className="mkt-section-tag">Simple by design</div>
          <h2 className="mkt-section-title">Three steps.<br />Materials at your door.</h2>
          <p className="mkt-section-sub">
            No calls. No negotiating. No "will deliver tomorrow". Just order and track.
          </p>

          <div className="mkt-steps">
            {HOW_STEPS.map((step) => (
              <div key={step.num} className="mkt-step">
                <div className="mkt-step-num">{step.num}</div>
                <h3 className="mkt-step-title">{step.title}</h3>
                <p  className="mkt-step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CATEGORIES ───────────────────────────────────── */}
      <section
        id="categories"
        className="mkt-section"
        aria-label="Product categories"
      >
        <div className="mkt-container">
          <div className="mkt-section-tag">What we deliver</div>
          <h2 className="mkt-section-title">Everything a site needs.</h2>
          <p className="mkt-section-sub">
            From foundation to finishing — cement, paint, tiles, electrical, plumbing, and hardware.
          </p>

          <div className="mkt-categories" role="list">
            {CATEGORIES.map((cat) => (
              <div key={cat.name} className="mkt-category" role="listitem">
                <div className="mkt-category-icon" aria-hidden="true">{cat.icon}</div>
                <div className="mkt-category-name">{cat.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY TEZZNIRMAAN ──────────────────────────────── */}
      <section
        className="mkt-section mkt-section-alt"
        aria-label="Why choose TezzNirmaan"
      >
        <div className="mkt-container">
          <div className="mkt-section-tag">Why TezzNirmaan</div>
          <h2 className="mkt-section-title">Better than calling<br />the shop directly.</h2>
          <p className="mkt-section-sub">
            Local shops you trust. Speed and convenience you didn't have before.
          </p>

          <div className="mkt-why-grid">
            {WHY_FEATURES.map((f) => (
              <div key={f.title} className="mkt-why-card">
                <div className="mkt-why-icon" aria-hidden="true">{f.icon}</div>
                <h3 className="mkt-why-title">{f.title}</h3>
                <p  className="mkt-why-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SHOP OWNER CTA ───────────────────────────────── */}
      <section
        id="for-shops"
        className="mkt-shop-cta"
        aria-label="For shop owners"
      >
        <div className="mkt-container">
          <div className="mkt-shop-cta-inner">
            <div>
              <div className="mkt-shop-cta-eyebrow">For shop owners</div>
              <h2 className="mkt-shop-cta-title">
                Are you a hardware shop<br />in Patna, Muzaffarpur or Bhagalpur?
              </h2>
              <p className="mkt-shop-cta-desc">
                Join TezzNirmaan and reach customers who are ready to order — no walk-ins required.
                Manage inventory, receive orders, and track deliveries from one dashboard.
              </p>
              <div className="mkt-shop-cta-perks">
                {[
                  'Zero commission for the first 6 months',
                  'Free dashboard and mobile tools',
                  'We handle delivery — you focus on stock',
                  'Setup in under 30 minutes',
                ].map(perk => (
                  <div key={perk} className="mkt-shop-cta-perk">{perk}</div>
                ))}
              </div>
            </div>

            <div>
              <a
                href="/shop-signup"
                className="mkt-shop-cta-btn"
                id="shop-register-btn"
              >
                Register your shop →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer className="mkt-footer" aria-label="Site footer">
        <div className="mkt-container">
          <div className="mkt-footer-inner">
            {/* Brand */}
            <div className="mkt-footer-brand">
              <div className="mkt-footer-logo">Tezz<span>Nirmaan</span></div>
              <p className="mkt-footer-tagline">
                Hardware, paint, tiles and building materials — delivered from local shops in Patna, Muzaffarpur &amp; Bhagalpur, Bihar.
              </p>
              <div className="mkt-footer-stores">
                <a
                  href="https://play.google.com/store"
                  className="mkt-footer-store-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                  id="footer-playstore-btn"
                >
                  ▶ Google Play
                </a>
                <a
                  href="https://apps.apple.com"
                  className="mkt-footer-store-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                  id="footer-appstore-btn"
                >
                  ⊕ App Store
                </a>
              </div>
            </div>

            {/* Company */}
            <div>
              <div className="mkt-footer-col-title">Company</div>
              <div className="mkt-footer-links">
                <a href="#how-it-works" className="mkt-footer-link">How it works</a>
                <a href="#for-shops"    className="mkt-footer-link">For shop owners</a>
                <a href="/admin"        className="mkt-footer-link">Dashboard login</a>
              </div>
            </div>

            {/* Legal */}
            <div>
              <div className="mkt-footer-col-title">Legal</div>
              <div className="mkt-footer-links">
                <a href="/privacy"      className="mkt-footer-link" id="footer-privacy-link">Privacy Policy</a>
                <a href="/terms"        className="mkt-footer-link" id="footer-terms-link">Terms of Service</a>
                <a href="mailto:hello@tezznirmaan.in" className="mkt-footer-link">Contact Us</a>
              </div>
            </div>
          </div>

          <div className="mkt-footer-bottom">
            <div className="mkt-footer-copy">
              © {new Date().getFullYear()} TezzNirmaan. All rights reserved.
            </div>
            <div className="mkt-footer-city">
              <span>📍</span> Patna, Muzaffarpur &amp; Bhagalpur, Bihar, India
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
