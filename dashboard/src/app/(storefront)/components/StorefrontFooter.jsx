// ─────────────────────────────────────────────────────────────
// StorefrontFooter.jsx — P9-5 (Server component)
// ─────────────────────────────────────────────────────────────
import Link from 'next/link';

const CATEGORIES = [
  'Construction', 'Paints', 'Tiles', 'Electrical',
  'Plumbing', 'Hardware', 'Decor', 'Fittings',
];

const CITIES = ['Patna', 'Muzaffarpur', 'Bhagalpur', 'Gaya'];

export default function StorefrontFooter() {
  return (
    <footer className="sf-footer">
      <div className="sf-footer-inner">
        <div className="sf-footer-grid">
          {/* Brand */}
          <div>
            <div className="sf-footer-logo">Tezz<span>Nirmaan</span></div>
            <p className="sf-footer-desc">
              Hardware, construction materials & home improvement supplies
              from local shops — delivered in 60 minutes across Bihar.
            </p>
            <div className="sf-app-badges" style={{ marginTop: 16 }}>
              <a href="https://play.google.com/store" className="sf-app-badge" target="_blank" rel="noopener">
                ▶ Google Play
              </a>
              <a href="https://apps.apple.com" className="sf-app-badge" target="_blank" rel="noopener">
                 App Store
              </a>
            </div>
          </div>

          {/* Categories */}
          <div>
            <div className="sf-footer-col-title">Categories</div>
            {CATEGORIES.map(c => (
              <Link key={c} href={`/storefront/category/${c.toLowerCase()}`} className="sf-footer-link">
                {c}
              </Link>
            ))}
          </div>

          {/* Cities */}
          <div>
            <div className="sf-footer-col-title">Cities</div>
            {CITIES.map(city => (
              <Link key={city} href={`/storefront/city/${city.toLowerCase()}`} className="sf-footer-link">
                {city}
              </Link>
            ))}
          </div>

          {/* Company */}
          <div>
            <div className="sf-footer-col-title">Company</div>
            <Link href="/privacy" className="sf-footer-link">Privacy Policy</Link>
            <Link href="/terms"   className="sf-footer-link">Terms of Service</Link>
            <Link href="/shop-signup" className="sf-footer-link">Partner with Us</Link>
            <a href="mailto:support@tezznirmaan.in" className="sf-footer-link">Contact Support</a>
          </div>
        </div>

        <div className="sf-footer-bottom">
          <span>© {new Date().getFullYear()} TezzNirmaan. All rights reserved.</span>
          <span>Made in Bihar 🇮🇳</span>
        </div>
      </div>
    </footer>
  );
}
