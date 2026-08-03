// ─────────────────────────────────────────────────────────────
// (storefront)/category/[slug]/page.jsx — P9-5
//
// Server component — ISR (revalidate 60s).
// Fetches products filtered by category from /public/shops/:slug/products
// ─────────────────────────────────────────────────────────────
import Link        from 'next/link';
import ProductCard from '../../components/ProductCard';

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

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const meta = CATEGORY_META[slug] || { label: slug, desc: `Order ${slug} online — TezzNirmaan` };
  const title = `${meta.label} delivered in Patna | TezzNirmaan`;
  return {
    title,
    description: `Order ${meta.label.toLowerCase()} online. ${meta.desc} Delivered from local shops in Patna, Muzaffarpur, Bhagalpur & Gaya in 60-90 minutes.`,
    openGraph: {
      title:  `Buy ${meta.label} online — TezzNirmaan`,
      images: [`https://images.tezznirmaan.in/categories/${slug}.jpg`],
    },
    alternates: { canonical: `https://tezznirmaan.in/storefront/category/${slug}` },
  };
}

async function fetchCategoryProducts(slug, page = 1) {
  try {
    const res = await fetch(
      `${API}/api/v1/public/shops/sharma-hardware-patna/products?category=${encodeURIComponent(slug)}&page=${page}&limit=24`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return { products: [], total: 0, totalPages: 1 };
    const json = await res.json();
    return {
      products:   json.data?.products   || [],
      total:      json.data?.total      || 0,
      totalPages: json.data?.totalPages || 1,
    };
  } catch {
    return { products: [], total: 0, totalPages: 1 };
  }
}

const SORT_OPTIONS = ['Popular', 'Price: Low to High', 'Price: High to Low', 'Newest'];

export default async function CategoryPage({ params, searchParams }) {
  const { slug }   = await params;
  const sp         = await searchParams;
  const page       = parseInt(sp?.page || '1', 10);
  const meta       = CATEGORY_META[slug] || { label: slug.charAt(0).toUpperCase() + slug.slice(1), emoji: '📦', desc: '' };
  const { products, total, totalPages } = await fetchCategoryProducts(slug, page);

  const CATEGORIES = Object.entries(CATEGORY_META).map(([s, m]) => ({ slug: s, label: m.label, emoji: m.emoji }));

  return (
    <div className="sf-wrap">
      {/* Breadcrumb */}
      <nav className="sf-breadcrumb" aria-label="Breadcrumb">
        <Link href="/storefront">Home</Link>
        <span className="sf-breadcrumb-sep">›</span>
        <span>{meta.label}</span>
      </nav>

      <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 800, marginBottom: 4 }}>
        {meta.emoji} {meta.label}
      </h1>
      <p style={{ color: 'var(--sf-text-2)', fontSize: '0.875rem', marginBottom: 24 }}>
        {total > 0 ? `${total} products` : ''} {meta.desc}
      </p>

      {/* Filter bar (mobile) */}
      <div className="sf-filter-bar">
        {SORT_OPTIONS.map(opt => (
          <span key={opt} className={`sf-filter-chip${opt === 'Popular' ? ' active' : ''}`}>{opt}</span>
        ))}
      </div>

      <div className="sf-category-layout">
        {/* Sidebar — desktop */}
        <aside className="sf-filter-sidebar">
          <div className="sf-filter-title">Categories</div>
          {CATEGORIES.map(cat => (
            <Link
              key={cat.slug}
              href={`/storefront/category/${cat.slug}`}
              className={`sf-filter-option${cat.slug === slug ? ' active' : ''}`}
            >
              <span>{cat.emoji}</span> {cat.label}
            </Link>
          ))}
        </aside>

        {/* Product grid */}
        <div>
          {products.length > 0
            ? (
              <>
                <div className="sf-product-grid">
                  {products.map(p => (
                    <ProductCard key={p.inventory_id} product={p} shopSlug="sharma-hardware-patna" />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <nav className="sf-pagination" aria-label="Pagination">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                      <Link
                        key={pg}
                        href={`/storefront/category/${slug}?page=${pg}`}
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
                <div className="sf-empty-title">No products found</div>
                <div className="sf-empty-sub">We're adding more {meta.label.toLowerCase()} soon. Check back shortly.</div>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}
