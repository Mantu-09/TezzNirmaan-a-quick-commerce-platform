// ─────────────────────────────────────────────────────────────
// (storefront)/page.jsx — P9-5 Storefront Home
//
// Server component — SSR with 60s revalidation.
// Fetches: cities, featured products (first 8 of each key category)
// Renders: hero, category pills, product grid sections
// ─────────────────────────────────────────────────────────────
import Link        from 'next/link';
import ProductCard from './components/ProductCard';

const API = process.env.API_BASE_URL || 'http://localhost:3000';

// Categories shown in the pill row
const CATEGORIES = [
  { slug: 'construction', label: 'Construction', emoji: '🏗️' },
  { slug: 'paints',       label: 'Paints',       emoji: '🎨' },
  { slug: 'tiles',        label: 'Tiles',        emoji: '🟫' },
  { slug: 'electrical',   label: 'Electrical',   emoji: '⚡' },
  { slug: 'plumbing',     label: 'Plumbing',     emoji: '🔧' },
  { slug: 'hardware',     label: 'Hardware',     emoji: '🔩' },
  { slug: 'decor',        label: 'Decor',        emoji: '🏠' },
  { slug: 'fittings',     label: 'Fittings',     emoji: '🔌' },
];

// Fetch bestseller products (uses first active shop for now)
async function fetchFeaturedProducts() {
  try {
    // Try to get products from a public catalog endpoint
    // Falls back to empty array if backend not reachable during build
    const res = await fetch(
      `${API}/api/v1/public/shops/sharma-hardware-patna/products?limit=8`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data?.products || [];
  } catch {
    return [];
  }
}

export const metadata = {
  title: 'Order Hardware & Building Materials Online — TezzNirmaan',
  description: 'Order cement, paint, tiles, plumbing and electrical supplies from local shops in Patna, Muzaffarpur, Bhagalpur & Gaya. Delivered in 60-90 minutes.',
};

export default async function StorefrontHomePage() {
  const products = await fetchFeaturedProducts();

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="sf-hero">
        <div className="sf-hero-inner">
          <div className="sf-hero-tag">⚡ 60-90 Minute Delivery</div>
          <h1 className="sf-hero-title">
            Hardware & Materials,<br />
            <span className="hl">Delivered Fast</span>
          </h1>
          <p className="sf-hero-sub">
            Cement, paint, tiles, electrical fittings and more — from local shops
            straight to your site. Patna, Muzaffarpur, Bhagalpur & Gaya.
          </p>

          {/* Search — client interaction via form */}
          <form className="sf-hero-search-wrap" action="/storefront/search" method="get">
            <input
              className="sf-hero-search-input"
              name="q"
              type="search"
              placeholder="Search cement, paint, tiles, pipes…"
              autoComplete="off"
              aria-label="Search products"
            />
            <button type="submit" className="sf-hero-search-btn">Search</button>
          </form>

          <div className="sf-hero-stats">
            <div className="sf-hero-stat"><strong>4</strong> cities covered</div>
            <div className="sf-hero-stat"><strong>500+</strong> products</div>
            <div className="sf-hero-stat"><strong>60 min</strong> avg delivery</div>
          </div>
        </div>
      </section>

      {/* ── Category pills ────────────────────────────────── */}
      <div className="sf-cat-scroll">
        <div className="sf-cat-row">
          {CATEGORIES.map(cat => (
            <Link
              key={cat.slug}
              href={`/storefront/category/${cat.slug}`}
              className="sf-cat-pill"
            >
              <span className="sf-cat-pill-icon">{cat.emoji}</span>
              <span className="sf-cat-pill-label">{cat.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Best sellers ──────────────────────────────────── */}
      <div className="sf-wrap">
        <section className="sf-section">
          <h2 className="sf-section-title">Best Sellers</h2>
          <p className="sf-section-sub">Most ordered construction & home improvement products</p>

          {products.length > 0
            ? (
              <div className="sf-product-grid">
                {products.map(p => (
                  <ProductCard key={p.inventory_id} product={p} shopSlug="sharma-hardware-patna" />
                ))}
              </div>
            )
            : (
              <div className="sf-empty">
                <div className="sf-empty-icon">🏗️</div>
                <div className="sf-empty-title">Coming Soon in Your Area</div>
                <div className="sf-empty-sub">
                  We're onboarding shops in your city.<br />
                  <Link href="/shop-signup" style={{ color: 'var(--sf-primary)' }}>Partner with us →</Link>
                </div>
              </div>
            )
          }

          {products.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              {CATEGORIES.map(cat => (
                <Link
                  key={cat.slug}
                  href={`/storefront/category/${cat.slug}`}
                  className="sf-btn sf-btn-ghost"
                  style={{ margin: 4 }}
                >
                  {cat.emoji} {cat.label}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── Value props ──────────────────────────────────── */}
        <section className="sf-section" style={{ paddingTop: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {[
              { icon: '⚡', title: 'Quick Delivery', sub: '60–90 min from local shops' },
              { icon: '🏪', title: 'Local Shops',    sub: 'Trusted hardware stores near you' },
              { icon: '💰', title: 'Best Prices',    sub: 'Wholesale pricing, retail convenience' },
              { icon: '📦', title: 'Bulk Orders',    sub: 'Perfect for contractors & builders' },
            ].map(v => (
              <div key={v.title} style={{
                background: 'var(--sf-surface)',
                border: '1px solid var(--sf-border)',
                borderRadius: 'var(--sf-radius)',
                padding: '20px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>{v.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: 4 }}>{v.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--sf-text-2)' }}>{v.sub}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
