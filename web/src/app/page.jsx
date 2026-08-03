// ─────────────────────────────────────────────────────────────
// web/src/app/page.jsx — Homepage
// P9-5: TezzNirmaan web storefront
//
// Sections:
//   1. Hero banner with CTA
//   2. Category grid (construction, paints, tiles, etc.)
//   3. "How it works" (3 steps)
//   4. Download CTA section
// ─────────────────────────────────────────────────────────────
import Link from 'next/link';

export const metadata = {
  title: 'TezzNirmaan — Fast Delivery of Cement, Paint & Hardware in Patna',
  description: 'Order construction materials, paint, tiles, plumbing, electrical, and hardware online. Fast delivery in Patna by TezzNirmaan.',
  alternates: { canonical: 'https://tezznirmaan.in' },
};

const CATEGORIES = [
  { name: 'Cement & Concrete', icon: '🏗️', slug: 'cement-concrete', count: '50+ products' },
  { name: 'Paints & Primers', icon: '🎨', slug: 'paints',           count: '100+ products' },
  { name: 'Tiles & Flooring', icon: '🟫', slug: 'tiles',            count: '80+ products' },
  { name: 'Plumbing',          icon: '🔧', slug: 'plumbing',         count: '60+ products' },
  { name: 'Electrical',        icon: '⚡', slug: 'electrical',       count: '70+ products' },
  { name: 'Hardware',          icon: '🔩', slug: 'hardware',         count: '120+ products' },
  { name: 'Sand & Aggregates', icon: '🪨', slug: 'aggregates',       count: '20+ products' },
  { name: 'Wood & Plywood',    icon: '🪵', slug: 'wood',             count: '40+ products' },
];

const STEPS = [
  { step: '1', title: 'Browse & Order', desc: 'Find what you need from local shops in Patna.', icon: '🛒' },
  { step: '2', title: 'We Pick Up',     desc: 'Our rider collects your order from the shop.',  icon: '🏍️' },
  { step: '3', title: 'Fast Delivery',  desc: 'Delivered to your site — no waiting.',           icon: '⚡' },
];

export default function HomePage() {
  return (
    <>
      {/* ── JSON-LD structured data ──────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type':    'Organization',
            name:       'TezzNirmaan',
            url:        'https://tezznirmaan.in',
            logo:       'https://tezznirmaan.in/logo.png',
            description: 'Quick delivery of construction materials in Patna',
            address: {
              '@type':           'PostalAddress',
              addressLocality:   'Patna',
              addressRegion:     'Bihar',
              addressCountry:    'IN',
            },
            areaServed: { '@type': 'City', name: 'Patna' },
          }),
        }}
      />

      {/* ── Hero ─────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(135deg, #1a0a02 0%, #2d1207 40%, #4a1e0a 100%)',
        padding: 'clamp(48px, 10vw, 120px) 0 clamp(64px, 12vw, 140px)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Background pattern */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(232,82,26,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(232,82,26,0.1) 0%, transparent 40%)',
        }} aria-hidden="true" />

        <div className="container" style={{ position: 'relative' }}>
          {/* City pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            backgroundColor: 'rgba(232,82,26,0.2)', color: '#f97316',
            padding: '6px 14px', borderRadius: 'var(--r-full)',
            fontSize: 13, fontWeight: 700, marginBottom: 24,
            border: '1px solid rgba(232,82,26,0.3)',
          }}>
            📍 Now serving Patna, Bihar
          </div>

          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 56px)',
            fontWeight: 900, color: '#fff',
            lineHeight: 1.15, letterSpacing: '-0.02em',
            maxWidth: 700, marginBottom: 20,
          }}>
            Construction materials,<br />
            <span style={{ color: '#f97316' }}>delivered fast</span> in Patna
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: 'rgba(255,255,255,0.7)',
            maxWidth: 500, marginBottom: 36, lineHeight: 1.7,
          }}>
            Order cement, paint, tiles, hardware, and more from local shops — delivered to your site.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a
              href="https://play.google.com/store/apps/details?id=in.tezznirmaan.app"
              className="btn btn-primary"
              style={{ fontSize: 15, padding: '14px 28px' }}
              target="_blank" rel="noopener noreferrer"
            >
              📱 Download App (Free)
            </a>
            <Link href="#categories" className="btn btn-outline" style={{ fontSize: 15, padding: '14px 28px', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>
              Browse Products →
            </Link>
          </div>

          {/* Trust badges */}
          <div style={{ display: 'flex', gap: 24, marginTop: 48, flexWrap: 'wrap' }}>
            {['⚡ 30-min delivery', '🔒 Secure payments', '📦 1,000+ products'].map(badge => (
              <span key={badge} style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Categories ───────────────────────────── */}
      <section id="categories" style={{ padding: 'clamp(48px, 8vw, 80px) 0' }}>
        <div className="container">
          <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>
            Shop by Category
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 32 }}>
            Everything for construction and home improvement — from local Patna shops
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 16,
          }}>
            {CATEGORIES.map(cat => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="card"
                style={{ padding: '20px 16px', textAlign: 'center', display: 'block', cursor: 'pointer' }}
                aria-label={`Browse ${cat.name}`}
              >
                <div style={{ fontSize: 32, marginBottom: 10 }}>{cat.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                  {cat.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{cat.count}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────── */}
      <section style={{ backgroundColor: 'var(--surface-2)', padding: 'clamp(48px, 8vw, 80px) 0' }}>
        <div className="container">
          <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em', textAlign: 'center' }}>
            How TezzNirmaan Works
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 48, textAlign: 'center' }}>
            Order in under 2 minutes. Delivered to your site.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            {STEPS.map(s => (
              <div key={s.step} style={{ textAlign: 'center', padding: '32px 24px' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>{s.icon}</div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '50%',
                  backgroundColor: '#E8521A', color: '#fff',
                  fontSize: 14, fontWeight: 900, marginBottom: 12,
                }}>
                  {s.step}
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Download CTA ─────────────────────────── */}
      <section style={{ padding: 'clamp(48px, 8vw, 80px) 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <div style={{
            background: 'linear-gradient(135deg, #E8521A, #C4400F)',
            borderRadius: 'var(--r-xl)',
            padding: 'clamp(40px, 6vw, 64px) clamp(24px, 5vw, 80px)',
            color: '#fff',
          }}>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 900, marginBottom: 12, letterSpacing: '-0.02em' }}>
              Get TezzNirmaan — It's Free
            </h2>
            <p style={{ fontSize: 16, opacity: 0.85, marginBottom: 32, maxWidth: 420, margin: '0 auto 32px' }}>
              Download the app for the full experience: real-time tracking, exclusive offers, and faster checkout.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href="https://play.google.com/store/apps/details?id=in.tezznirmaan.app"
                className="btn"
                style={{ backgroundColor: '#fff', color: '#E8521A', fontSize: 15, padding: '14px 28px' }}
                target="_blank" rel="noopener noreferrer"
              >
                📱 Android (Google Play)
              </a>
              <a
                href="https://apps.apple.com/in/app/tezznirmaan/id0000000000"
                className="btn"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 15, padding: '14px 28px', border: '2px solid rgba(255,255,255,0.3)' }}
                target="_blank" rel="noopener noreferrer"
              >
                🍎 iOS (App Store) — Coming Soon
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
