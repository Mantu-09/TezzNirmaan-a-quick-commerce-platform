// ─────────────────────────────────────────────────────────────
// (storefront)/category/[slug]/page.jsx — P11-3
//
// Server component — ISR (revalidate 60s).
// City-scoped catalog: /public/catalog?city=...&category=...
//
// P11-3 fixes over P10-0:
//   1. Added generateStaticParams → pre-renders 8 categories at build
//   2. Fixed all /storefront/category/* links → /category/*  (were 404)
//   3. Fixed breadcrumb home link → / (not /storefront)
//   4. Fixed canonical URL prefix
//   5. Added tier (quick/scheduled) filter pill row
//   6. Added local SEO content block at bottom
// ─────────────────────────────────────────────────────────────
import Link        from 'next/link';
import ProductCard from '../../components/ProductCard';
import { cookies } from 'next/headers';

const API = process.env.API_BASE_URL || 'http://localhost:3000';

const CATEGORY_META = {
  construction: { label: 'Construction Materials', emoji: '🏗️', desc: 'Cement, aggregates, steel, bricks and all construction essentials.' },
  paints:       { label: 'Paints & Finishes',       emoji: '🎨', desc: 'Interior, exterior and waterproof paints from top brands.' },
  tiles:        { label: 'Tiles & Flooring',        emoji: '🟫', desc: 'Ceramic, vitrified, mosaic tiles and flooring solutions.' },
  electrical:   { label: 'Electrical Supplies',     emoji: '⚡', desc: 'Wires, switches, MCBs, fans and all electrical fittings.' },
  plumbing:     { label: 'Plumbing',                emoji: '🔧', desc: 'CPVC/PVC pipes, fittings, taps, tanks and bathroom accessories.' },
  hardware:     { label: 'Hardware & Tools',        emoji: '🔩', desc: 'Screws, bolts, hand tools, power tools and safety gear.' },
  decor:        { label: 'Home Decor',              emoji: '🏠', desc: 'Wallpapers, laminates, false ceiling and interior decor.' },
  fittings:     { label: 'Fittings & Fixtures',     emoji: '🔌', desc: 'Sanitaryware, bathroom fittings, door handles and locks.' },
};

// ── Pre-render all 8 categories at build time (ISR) ──────────
export async function generateStaticParams() {
  return Object.keys(CATEGORY_META).map(slug => ({ slug }));
}

export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const sp       = await searchParams;
  const citySlug  = sp?.city || 'patna';
  const cityLabel = citySlug.charAt(0).toUpperCase() + citySlug.slice(1);
  const meta      = CATEGORY_META[slug] || { label: slug, desc: `Order ${slug} online — TezzNirmaan` };
  return {
    title: `${meta.label} delivered in ${cityLabel} | TezzNirmaan`,
    description: `Order ${meta.label.toLowerCase()} online in ${cityLabel}. ${meta.desc} Delivered from local shops in Patna, Muzaffarpur, Bhagalpur & Gaya in 60-90 minutes.`,
    openGraph: {
      title:  `Buy ${meta.label} online — TezzNirmaan`,
      images: [`https://images.tezznirmaan.in/categories/${slug}.jpg`],
    },
    // P11-3: Fixed — was /storefront/category/... (wrong prefix)
    alternates: { canonical: `https://tezznirmaan.in/category/${slug}?city=${citySlug}` },
  };
}

// ── City-scoped category fetch ────────────────────────────────
async function fetchCategoryProducts(categorySlug, citySlug, page = 1, sort = 'popular', tier = '') {
  try {
    let url = `${API}/api/v1/public/catalog?city=${encodeURIComponent(citySlug)}&category=${encodeURIComponent(categorySlug)}&page=${page}&limit=24&sort=${sort}`;
    if (tier) url += `&tier=${encodeURIComponent(tier)}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return { products: [], total: 0, totalPages: 1, hasMore: false };
    const json = await res.json();
    const data = json.data || {};
    const total = data.total || 0;
    return {
      products:   data.products || [],
      total,
      totalPages: Math.ceil(total / 24),
      hasMore:    data.hasMore || false,
      city:       data.city || null,
    };
  } catch {
    return { products: [], total: 0, totalPages: 1, hasMore: false, city: null };
  }
}

const SORT_OPTIONS = [
  { value: 'popular',    label: 'Popular' },
  { value: 'price_asc',  label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'newest',     label: 'Newest' },
];

export default async function CategoryPage({ params, searchParams }) {
  const { slug }  = await params;
  const sp        = await searchParams;
  const page      = parseInt(sp?.page || '1', 10);
  const sort      = sp?.sort || 'popular';
  const tier      = sp?.tier || '';

  // Resolve city: URL param → cookie → default 'patna'
  const cookieStore = cookies();
  const citySlug  = sp?.city || cookieStore.get('tn_city')?.value || 'patna';
  const cityLabel = citySlug.charAt(0).toUpperCase() + citySlug.slice(1);

  const meta = CATEGORY_META[slug] || {
    label: slug.charAt(0).toUpperCase() + slug.slice(1),
    emoji: '📦',
    desc:  '',
  };

  const { products, total, totalPages, city } = await fetchCategoryProducts(slug, citySlug, page, sort, tier);
  const CATEGORIES = Object.entries(CATEGORY_META).map(([s, m]) => ({ slug: s, label: m.label, emoji: m.emoji }));

  return (
    <div className="sf-wrap">
      {/* Breadcrumb — P11-3: fixed / (was /storefront) */}
      <nav className="sf-breadcrumb" aria-label="Breadcrumb">
        <Link href={`/?city=${citySlug}`}>Home</Link>
        <span className="sf-breadcrumb-sep">›</span>
        <span>{meta.label}</span>
      </nav>

      <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 800, marginBottom: 4 }}>
        {meta.emoji} {meta.label}
      </h1>
      <p style={{ color: 'var(--sf-text-2)', fontSize: '0.875rem', marginBottom: 4 }}>
        {total > 0 ? `${total} products` : ''} {meta.desc}
      </p>
      <p style={{ color: 'var(--sf-text-2)', fontSize: '0.8rem', marginBottom: 16 }}>
        📍 Showing results in <strong>{city?.name || cityLabel}</strong>
      </p>

      {/* Sort filter bar — P11-3: links fixed to /category/* (not /storefront/category/*) */}
      <div className="sf-filter-bar">
        {SORT_OPTIONS.map(opt => (
          <a
            key={opt.value}
            href={`/category/${slug}?city=${citySlug}&sort=${opt.value}${tier ? `&tier=${tier}` : ''}`}
            className={`sf-filter-chip${sort === opt.value ? ' active' : ''}`}
          >
            {opt.label}
          </a>
        ))}
      </div>

      {/* Delivery tier pills — P11-3: new filter row */}
      <div className="sf-tier-filter-bar">
        <a
          href={`/category/${slug}?city=${citySlug}&sort=${sort}`}
          className={`sf-filter-chip${!tier ? ' active' : ''}`}
        >
          All
        </a>
        <a
          href={`/category/${slug}?city=${citySlug}&sort=${sort}&tier=quick`}
          className={`sf-filter-chip${tier === 'quick' ? ' active' : ''}`}
        >
          ⚡ Quick (60-90 min)
        </a>
        <a
          href={`/category/${slug}?city=${citySlug}&sort=${sort}&tier=scheduled`}
          className={`sf-filter-chip${tier === 'scheduled' ? ' active' : ''}`}
        >
          📅 Scheduled (Today)
        </a>
      </div>

      <div className="sf-category-layout">
        {/* Sidebar — desktop category nav */}
        {/* P11-3: links fixed to /category/* */}
        <aside className="sf-filter-sidebar">
          <div className="sf-filter-title">Categories</div>
          {CATEGORIES.map(cat => (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}?city=${citySlug}`}
              className={`sf-filter-option${cat.slug === slug ? ' active' : ''}`}
            >
              <span>{cat.emoji}</span> {cat.label}
            </Link>
          ))}
        </aside>

        {/* Product grid + pagination */}
        <div>
          {products.length > 0
            ? (
              <>
                <div className="sf-product-grid">
                  {products.map(p => (
                    <ProductCard
                      key={p.inventory_id}
                      product={p}
                      shopSlug={p.shop?.slug}
                      citySlug={citySlug}
                    />
                  ))}
                </div>

                {/* Pagination — P11-3: links fixed to /category/* */}
                {totalPages > 1 && (
                  <nav className="sf-pagination" aria-label="Pagination">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                      <Link
                        key={pg}
                        href={`/category/${slug}?city=${citySlug}&sort=${sort}${tier ? `&tier=${tier}` : ''}&page=${pg}`}
                        className={`sf-page-btn${pg === page ? ' active' : ''}`}
                        aria-label={`Page ${pg}`}
                        aria-current={pg === page ? 'page' : undefined}
                      >
                        {pg}
                      </Link>
                    ))}
                  </nav>
                )}
              </>
            )
            : (
              <div className="sf-empty">
                <div className="sf-empty-icon">{meta.emoji}</div>
                <div className="sf-empty-title">No products found in {city?.name || cityLabel}</div>
                <div className="sf-empty-sub">
                  We're adding more {meta.label.toLowerCase()} soon.{' '}
                  <Link href={`/category/${slug}?city=${citySlug}`} style={{ color: 'var(--sf-primary)' }}>
                    Clear filters →
                  </Link>
                </div>
              </div>
            )
          }
        </div>
      </div>

      {/* Local SEO content block — P11-3: new */}
      <section style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--sf-border)' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8, color: 'var(--sf-text)' }}>
          {meta.label} delivery in {cityLabel}
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--sf-text-2)', lineHeight: 1.6, maxWidth: 640 }}>
          TezzNirmaan delivers {meta.label.toLowerCase()} from local shops in {cityLabel} within
          60-90 minutes for Quick items, or same-day for heavy Scheduled items like cement and tiles.
          Order via app or web — pay by UPI, card, or cash on delivery.
        </p>
      </section>
    </div>
  );
}
