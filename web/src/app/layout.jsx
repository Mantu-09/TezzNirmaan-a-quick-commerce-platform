// ─────────────────────────────────────────────────────────────
// web/src/app/layout.jsx — Root layout
// P9-5: TezzNirmaan web storefront
// ─────────────────────────────────────────────────────────────
import '../styles/globals.css';
import AppDownloadBanner from '../components/AppDownloadBanner';
import Link from 'next/link';

export const metadata = {
  metadataBase: new URL('https://tezznirmaan.in'),
  title: {
    default:  'TezzNirmaan — Fast Delivery of Construction Materials in Patna',
    template: '%s | TezzNirmaan',
  },
  description: 'Order cement, paint, tiles, plumbing, electrical, and hardware online in Patna. Fast delivery by TezzNirmaan — the quick-commerce platform for construction and home decor.',
  keywords:    ['cement delivery Patna', 'hardware store Patna', 'construction material delivery', 'TezzNirmaan', 'tezz nirmaan'],
  openGraph: {
    type:        'website',
    locale:      'en_IN',
    url:         'https://tezznirmaan.in',
    siteName:    'TezzNirmaan',
    title:       'TezzNirmaan — Fast Delivery of Construction Materials in Patna',
    description: 'Order cement, paint, tiles, and more. Fast delivery in Patna.',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'TezzNirmaan' }],
  },
  twitter: {
    card: 'summary_large_image',
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
  alternates: {
    canonical: 'https://tezznirmaan.in',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN">
      <head>
        {/* Preconnect to CDN for faster image loads */}
        <link rel="preconnect" href="https://images.tezznirmaan.in" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {/* Sticky "Download the App" banner — mobile only */}
        <AppDownloadBanner />

        {/* ── Header ──────────────────────────────── */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 50,
          backgroundColor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--border)',
          height: 'var(--header-h)',
        }}>
          <div className="container" style={{
            height: '100%', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
          }}>
            {/* Logo */}
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <rect width="28" height="28" rx="8" fill="#E8521A" />
                <text x="14" y="20" textAnchor="middle" fill="white" fontSize="16" fontWeight="900" fontFamily="Inter, sans-serif">T</text>
              </svg>
              <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                TezzNirmaan
              </span>
            </Link>

            {/* City indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, color: 'var(--text-2)',
              backgroundColor: 'var(--surface-2)',
              padding: '6px 12px', borderRadius: 'var(--r-full)',
            }}>
              <span>📍</span>
              <span style={{ fontWeight: 600 }}>Patna</span>
              <span style={{ color: 'var(--text-3)', fontSize: 11 }}>(Pilot city)</span>
            </div>

            {/* Download CTA — desktop */}
            <a
              href="https://play.google.com/store/apps/details?id=in.tezznirmaan.app"
              className="btn btn-primary"
              style={{ fontSize: 13, padding: '8px 16px' }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download App
            </a>
          </div>
        </header>

        {/* ── Page Content ──────────────────────── */}
        <main>
          {children}
        </main>

        {/* ── Footer ──────────────────────────────── */}
        <footer style={{
          backgroundColor: 'var(--text)', color: 'rgba(255,255,255,0.7)',
          padding: '48px 0 32px',
          marginTop: 80,
        }}>
          <div className="container">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 32, marginBottom: 40 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                    <rect width="28" height="28" rx="8" fill="#E8521A" />
                    <text x="14" y="20" textAnchor="middle" fill="white" fontSize="16" fontWeight="900" fontFamily="Inter, sans-serif">T</text>
                  </svg>
                  <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>TezzNirmaan</span>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.8 }}>
                  Quick delivery of construction materials, paint, tiles, and hardware in Patna.
                </p>
              </div>

              <div>
                <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Company</h3>
                <nav aria-label="Footer company links">
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li><Link href="/about" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', transition: 'color 0.1s' }}>About Us</Link></li>
                    <li><Link href="/careers" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Careers</Link></li>
                    <li><Link href="/blog" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Blog</Link></li>
                  </ul>
                </nav>
              </div>

              <div>
                <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>For Shops</h3>
                <nav aria-label="Footer shop links">
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li><a href="https://dashboard.tezznirmaan.in" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Shop Dashboard</a></li>
                    <li><Link href="/list-your-shop" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>List Your Shop</Link></li>
                  </ul>
                </nav>
              </div>

              <div>
                <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Legal</h3>
                <nav aria-label="Footer legal links">
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li><Link href="/legal/terms" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Terms of Service</Link></li>
                    <li><Link href="/legal/privacy" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Privacy Policy</Link></li>
                    <li><Link href="/legal/refund" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Refund Policy</Link></li>
                  </ul>
                </nav>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                © {new Date().getFullYear()} TezzNirmaan. All rights reserved. CIN: U74999BR2025PTC000001
              </p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                Registered in Bihar, India. GSTIN: 10XXXXX0000X1ZX
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
