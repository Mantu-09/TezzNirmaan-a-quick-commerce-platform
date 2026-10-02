// ─────────────────────────────────────────────────────────────
// web/src/app/shop/[slug]/page.jsx — Shop + Category Listing
// TezzNirmaan web storefront
//
// Fetches products for a category slug from the public API.
// Supports search, sort, and pagination.
// Server component with generateMetadata for SEO.
// ─────────────────────────────────────────────────────────────
import Link from 'next/link';
import { notFound } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || '';

const CATEGORY_META = {
  'cement-concrete': { name: 'Cement & Concrete',  icon: '🏗️', desc: 'Portland cement, ready-mix concrete, construction chemicals and additives.' },
  paints:            { name: 'Paints & Primers',    icon: '🎨', desc: 'Interior, exterior, enamel, wood polish and waterproofing paints.' },
  tiles:             { name: 'Tiles & Flooring',    icon: '🟫', desc: 'Vitrified tiles, ceramic, mosaic and anti-skid flooring solutions.' },
  plumbing:          { name: 'Plumbing',             icon: '🔧', desc: 'CPVC pipes, fittings, valves, taps, water tanks and drainage.' },
  electrical:        { name: 'Electrical',           icon: '⚡', desc: 'Wires, switchgear, MCBs, LED lights, fans and fixtures.' },
  hardware:          { name: 'Hardware',             icon: '🔩', desc: 'Fasteners, tools, locks, hinges and construction hardware.' },
  aggregates:        { name: 'Sand & Aggregates',    icon: '🪨', desc: 'River sand, crusher sand, aggregates and stone chips.' },
  wood:              { name: 'Wood & Plywood',       icon: '🪵', desc: 'Plywood, MDF, hardwood, veneer and timber sections.' },
};

export async function generateMetadata({ params }) {
  const slug = (await params).slug;
  const meta = CATEGORY_META[slug];
  if (!meta) return { title: 'TezzNirmaan' };
  return {
    title: `${meta.name} — TezzNirmaan Patna`,
    description: meta.desc,
    alternates: { canonical: `https://tezznirmaan.in/shop/${slug}` },
  };
}

async function getProducts(slug, { search, sort, page } = {}) {
  try {
    const qs = new URLSearchParams({ category: slug, page: page || 1, limit: 24 });
    if (search) qs.set('search', search);
    if (sort)   qs.set('sort', sort);
    const res = await fetch(`${API_URL}/api/v1/public/products?${qs.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { products: [], total: 0 };
    const data = await res.json();
    return { products: data.data || data.products || [], total: data.pagination?.total || 0 };
  } catch {
    return { products: [], total: 0 };
  }
}

export default async function CategoryPage({ params, searchParams }) {
  const slug = (await params).slug;
  const sp   = await searchParams;
  const meta = CATEGORY_META[slug];

  if (!meta) notFound();

  const { products, total } = await getProducts(slug, {
    search: sp.q,
    sort:   sp.sort,
    page:   sp.page,
  });

  const currentPage = parseInt(sp.page || '1');
  const totalPages  = Math.ceil(total / 24);

  const SORT_OPTIONS = [
    { value: '',            label: 'Relevance'     },
    { value: 'price_asc',  label: 'Price: Low–High' },
    { value: 'price_desc', label: 'Price: High–Low' },
    { value: 'newest',     label: 'Newest First'  },
  ];

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      {/* Breadcrumb */}
      <nav style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        <Link href="/" style={{ color: '#f97316', textDecoration: 'none' }}>Home</Link>
        <span style={{ margin: '0 8px' }}>/</span>
        <span style={{ color: '#111827', fontWeight: 600 }}>{meta.name}</span>
      </nav>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <span style={{ fontSize: 40 }}>{meta.icon}</span>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>{meta.name}</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>{meta.desc}</p>
        </div>
      </div>

      {/* Search + Sort row */}
      <form method="get" style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <input
          name="q"
          defaultValue={sp.q || ''}
          placeholder={`Search in ${meta.name}…`}
          style={{ flex: '1 1 220px', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none' }}
        />
        <select
          name="sort"
          defaultValue={sp.sort || ''}
          style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#fff' }}
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" style={{ padding: '10px 20px', background: '#f97316', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, color: '#fff', cursor: 'pointer' }}>
          Search
        </button>
      </form>

      {/* Result count */}
      {sp.q && (
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          {total} results for "<strong>{sp.q}</strong>"
        </p>
      )}

      {/* Product grid */}
      {products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#6b7280' }}>No products found</div>
          <p style={{ fontSize: 14 }}>Try a different search term or browse other categories.</p>
          <Link href="/" style={{ display: 'inline-block', marginTop: 16, padding: '10px 24px', background: '#f97316', color: '#fff', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>
            Browse All
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {products.map(p => (
            <Link
              key={p.id}
              href={`/shop/${slug}/${p.id}`}
              style={{ display: 'block', background: '#fff', borderRadius: 12, border: '1px solid #f3f4f6', overflow: 'hidden', textDecoration: 'none', transition: 'box-shadow 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
            >
              {/* Product image */}
              <div style={{ aspectRatio: '4/3', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span>{meta.icon}</span>
                )}
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4, lineHeight: 1.4, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {p.name}
                </div>
                {p.brand && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>{p.brand}</div>}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#f97316' }}>
                    ₹{Math.floor((p.price_paise || 0) / 100)}
                  </span>
                  {p.original_price_paise && p.original_price_paise > p.price_paise && (
                    <span style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through' }}>
                      ₹{Math.floor(p.original_price_paise / 100)}
                    </span>
                  )}
                </div>
                {p.unit && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>per {p.unit}</div>}
                <div style={{ marginTop: 10, padding: '8px', background: '#fff7ed', borderRadius: 8, textAlign: 'center', color: '#f97316', fontWeight: 700, fontSize: 12 }}>
                  Order via App →
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32 }}>
          {currentPage > 1 && (
            <Link href={`/shop/${slug}?${new URLSearchParams({ ...sp, page: currentPage - 1 }).toString()}`}
              style={{ padding: '8px 16px', background: '#f1f5f9', borderRadius: 8, fontWeight: 600, fontSize: 13, color: '#374151', textDecoration: 'none' }}>
              ← Prev
            </Link>
          )}
          <span style={{ padding: '8px 16px', fontSize: 13, color: '#6b7280' }}>
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link href={`/shop/${slug}?${new URLSearchParams({ ...sp, page: currentPage + 1 }).toString()}`}
              style={{ padding: '8px 16px', background: '#f97316', borderRadius: 8, fontWeight: 700, fontSize: 13, color: '#fff', textDecoration: 'none' }}>
              Next →
            </Link>
          )}
        </div>
      )}

      {/* App CTA */}
      <div style={{ marginTop: 40, background: 'linear-gradient(135deg, #f97316, #ea580c)', borderRadius: 16, padding: '28px 24px', textAlign: 'center', color: '#fff' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Order Faster on the App</h2>
        <p style={{ fontSize: 14, opacity: 0.9, margin: '0 0 18px' }}>Real-time tracking, faster checkout, exclusive app discounts.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="https://play.google.com/store/apps/details?id=com.tezznirmaan" target="_blank" rel="noreferrer"
            style={{ padding: '10px 20px', background: '#fff', color: '#f97316', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            ▶ Google Play
          </a>
          <a href="https://apps.apple.com/app/tezznirmaan" target="_blank" rel="noreferrer"
            style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
             App Store
          </a>
        </div>
      </div>
    </main>
  );
}
