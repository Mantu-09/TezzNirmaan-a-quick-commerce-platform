// ─────────────────────────────────────────────────────────────
// (storefront)/search/page.jsx — P12-2 Supercharged Search
//
// Hybrid: server component for SSR/SEO + client island for
// instant search (250ms debounce), filters, and voice input.
//
// Layout:
//   • Instant search bar (client) — refines without full page reload
//   • Filter sidebar/bar — category, sort, in-stock, price range
//   • Voice search button (Web Speech API)
//   • Server-rendered initial results (SSR for SEO)
//   • Popular searches on empty query
// ─────────────────────────────────────────────────────────────
import Link                from 'next/link';
import { cookies }         from 'next/headers';
import ProductCard         from '../components/ProductCard';
import SearchClient        from './SearchClient';

const API = process.env.API_BASE_URL || 'http://localhost:3000';

const POPULAR_SEARCHES = [
  'cement', 'paint', 'tiles', 'bathroom fittings',
  'electrical wire', 'plumbing pipe', 'door', 'window',
  'steel rod', 'waterproof paint', 'PVC pipe', 'wire',
];

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const q  = (sp?.q || '').trim();
  return {
    title: q ? `"${q}" — Search TezzNirmaan` : 'Search — TezzNirmaan',
    description: q
      ? `Find ${q} and more construction materials delivered in Patna, Muzaffarpur, Bhagalpur & Gaya in 60-90 minutes.`
      : 'Search cement, paint, tiles, electrical, plumbing and more on TezzNirmaan.',
    robots: { index: !!q, follow: true },
  };
}

async function fetchSearchResults(q, citySlug, page = 1, category = '', sort = 'popular', inStock = false) {
  try {
    let url = `${API}/api/v1/public/catalog?city=${encodeURIComponent(citySlug)}&page=${page}&limit=24&sort=${sort}`;
    if (q)        url += `&q=${encodeURIComponent(q)}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    if (inStock)  url += `&in_stock=true`;
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return { products: [], total: 0, hasMore: false, city: null, didYouMean: null };
    const json = await res.json();
    const data = json.data || {};
    return {
      products:   data.products    || [],
      total:      data.total       || 0,
      hasMore:    data.hasMore     || false,
      city:       data.city        || null,
      didYouMean: data.did_you_mean || null, // P19-6: typo correction suggestion
    };
  } catch {
    return { products: [], total: 0, hasMore: false, city: null, didYouMean: null };
  }
}

function buildLink(q, citySlug, page, category, sort, inStock) {
  const params = new URLSearchParams();
  if (q)        params.set('q', q);
  if (citySlug) params.set('city', citySlug);
  if (page > 1) params.set('page', String(page));
  if (category) params.set('category', category);
  if (sort && sort !== 'popular') params.set('sort', sort);
  if (inStock)  params.set('in_stock', '1');
  return `/search?${params.toString()}`;
}

// ── Filter bar (server-rendered, URL-driven) ──────────────────
const CATEGORIES = [
  { slug: '',             label: 'All'          },
  { slug: 'construction', label: '🏗️ Construction' },
  { slug: 'paints',       label: '🎨 Paints'    },
  { slug: 'tiles',        label: '🟫 Tiles'     },
  { slug: 'electrical',   label: '⚡ Electrical' },
  { slug: 'plumbing',     label: '🔧 Plumbing'  },
  { slug: 'hardware',     label: '🔩 Hardware'  },
  { slug: 'decor',        label: '🏠 Decor'     },
  { slug: 'fittings',     label: '🔌 Fittings'  },
];
const SORT_OPTIONS = [
  { value: 'popular',   label: 'Popular'       },
  { value: 'price_asc', label: 'Price: Low→High' },
  { value: 'price_desc',label: 'Price: High→Low' },
  { value: 'newest',    label: 'Newest First'   },
  { value: 'rating',    label: 'Top Rated'      },
];

function FilterBar({ q, citySlug, category, sort, inStock, total }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      marginBottom: 20, padding: '12px 0', borderBottom: '1px solid var(--sf-border,#e5e7eb)',
    }}>
      {/* Category pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
        {CATEGORIES.map(cat => (
          <Link key={cat.slug}
            href={buildLink(q, citySlug, 1, cat.slug, sort, inStock)}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              textDecoration: 'none', whiteSpace: 'nowrap',
              background: category === cat.slug ? 'var(--sf-primary,#f97316)' : 'var(--sf-surface,#fff)',
              color:      category === cat.slug ? '#fff' : 'var(--sf-text-2,#6b7280)',
              border:     '1px solid var(--sf-border,#e5e7eb)',
            }}
          >{cat.label}</Link>
        ))}
      </div>

      {/* Sort dropdown */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--sf-text-2,#6b7280)', whiteSpace: 'nowrap' }}>Sort:</span>
        {SORT_OPTIONS.map(opt => (
          <Link key={opt.value}
            href={buildLink(q, citySlug, 1, category, opt.value, inStock)}
            style={{
              padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              textDecoration: 'none', whiteSpace: 'nowrap',
              background: sort === opt.value ? '#f3f4f6' : 'transparent',
              color: sort === opt.value ? 'var(--sf-text,#111827)' : 'var(--sf-text-2,#6b7280)',
              border: sort === opt.value ? '1px solid var(--sf-border,#e5e7eb)' : '1px solid transparent',
            }}
          >{opt.label}</Link>
        ))}

        {/* In-stock toggle */}
        <Link href={buildLink(q, citySlug, 1, category, sort, !inStock)}
          style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap',
            background: inStock ? '#dcfce7' : 'var(--sf-surface,#fff)',
            color:      inStock ? '#166534' : 'var(--sf-text-2,#6b7280)',
            border:     `1px solid ${inStock ? '#86efac' : 'var(--sf-border,#e5e7eb)'}`,
          }}
        >
          {inStock ? '✅ In Stock' : '📦 In Stock'}
        </Link>
      </div>
    </div>
  );
}

function PaginationLinks({ current, q, citySlug, category, sort, inStock, hasMore }) {
  if (current <= 1 && !hasMore) return null;
  return (
    <nav style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 40 }}>
      {current > 1 && (
        <Link href={buildLink(q, citySlug, current - 1, category, sort, inStock)}
          style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--sf-border,#e5e7eb)', fontWeight: 700, fontSize: 14, textDecoration: 'none', color: 'var(--sf-text,#111827)', background: 'var(--sf-surface,#fff)' }}>
          ← Prev
        </Link>
      )}
      <span style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--sf-primary,#f97316)', color: '#fff', fontWeight: 700, fontSize: 14 }}>
        {current}
      </span>
      {hasMore && (
        <Link href={buildLink(q, citySlug, current + 1, category, sort, inStock)}
          style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--sf-border,#e5e7eb)', fontWeight: 700, fontSize: 14, textDecoration: 'none', color: 'var(--sf-text,#111827)', background: 'var(--sf-surface,#fff)' }}>
          Next →
        </Link>
      )}
    </nav>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default async function SearchPage({ searchParams }) {
  const sp       = await searchParams;
  const q        = (sp?.q       || '').trim();
  const page     = Math.max(1, parseInt(sp?.page     || '1',  10));
  const category = (sp?.category || '').trim();
  const sort     = sp?.sort     || 'popular';
  const inStock  = sp?.in_stock === '1' || sp?.in_stock === 'true';

  const cookieStore = await cookies();
  const citySlug    = sp?.city || cookieStore.get('tn_city')?.value || 'patna';

  const { products, total, hasMore, city, didYouMean } = await fetchSearchResults(q, citySlug, page, category, sort, inStock);

  return (
    <div className="sf-wrap" style={{ paddingTop: 24 }}>
      {/* Breadcrumb */}
      <nav style={{ fontSize: 13, color: 'var(--sf-text-2,#6b7280)', marginBottom: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Link href={`/?city=${citySlug}`} style={{ color: 'var(--sf-primary,#f97316)' }}>Home</Link>
        <span>›</span>
        <span>Search</span>
        {q && <><span>›</span><span style={{ fontWeight: 700, color: 'var(--sf-text,#111827)' }}>"{q}"</span></>}
      </nav>

      {/* P12-2: Instant search client island — handles live typing without SSR */}
      <SearchClient
        initialQuery={q}
        citySlug={citySlug}
        category={category}
        sort={sort}
        inStock={inStock}
      />

      {/* Filter bar — server-rendered, URL-driven (works without JS) */}
      {(q || category) && (
        <FilterBar
          q={q} citySlug={citySlug} category={category}
          sort={sort} inStock={inStock} total={total}
        />
      )}

      {/* P19-6: Did you mean? banner */}
      {didYouMean && didYouMean.toLowerCase() !== q.toLowerCase() && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 14, color: '#1e40af' }}>
          🔍 Did you mean:{' '}
          <Link
            href={buildLink(didYouMean, citySlug, 1, category, sort, inStock)}
            style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline' }}
          >
            {didYouMean}
          </Link>
          ?
        </div>
      )}

      {/* Result heading */}
      {q && (
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 'clamp(1.1rem,3vw,1.6rem)', fontWeight: 800, marginBottom: 4 }}>
            {total > 0
              ? `${total.toLocaleString('en-IN')} result${total === 1 ? '' : 's'} for "${q}"`
              : `No results for "${q}"`}
          </h1>
          {city && <p style={{ fontSize: 13, color: 'var(--sf-text-2,#6b7280)' }}>📍 {city.name}</p>}
        </div>
      )}

      {/* No results state */}
      {q && total === 0 && (
        <div style={{ marginBottom: 40 }}>
          <p style={{ color: 'var(--sf-text-2,#6b7280)', marginBottom: 20, fontSize: 14 }}>
            We couldn't find "{q}" in {city?.name || citySlug}. Try one of these popular searches:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {POPULAR_SEARCHES.map(term => (
              <Link key={term}
                href={`/search?q=${encodeURIComponent(term)}&city=${citySlug}`}
                style={{
                  display: 'inline-block', padding: '6px 14px', borderRadius: 20, fontSize: 13,
                  color: 'var(--sf-text,#111827)', textDecoration: 'none',
                  background: 'var(--sf-surface,#fff)', border: '1px solid var(--sf-border,#e5e7eb)',
                }}>
                {term}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty query — popular searches */}
      {!q && !category && (
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 20 }}>
            What are you looking for?
          </h1>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--sf-text-2,#6b7280)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Popular Searches
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
            {POPULAR_SEARCHES.map(term => (
              <Link key={term}
                href={`/search?q=${encodeURIComponent(term)}&city=${citySlug}`}
                style={{
                  display: 'inline-block', padding: '8px 16px', borderRadius: 20, fontSize: 13,
                  color: 'var(--sf-text,#111827)', textDecoration: 'none', fontWeight: 600,
                  background: 'var(--sf-surface,#fff)', border: '1px solid var(--sf-border,#e5e7eb)',
                }}>
                🔍 {term}
              </Link>
            ))}
          </div>

          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--sf-text-2,#6b7280)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Browse by Category
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10 }}>
            {CATEGORIES.slice(1).map(cat => (
              <Link key={cat.slug}
                href={`/category/${cat.slug}?city=${citySlug}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '14px 8px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                  color: 'var(--sf-text,#111827)', textDecoration: 'none',
                  background: 'var(--sf-surface,#fff)', border: '1px solid var(--sf-border,#e5e7eb)',
                  textAlign: 'center',
                }}>
                {cat.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Product grid */}
      {products.length > 0 && (
        <>
          <div className="sf-product-grid">
            {products.map(item => (
              <ProductCard
                key={item.inventory_id}
                product={item}
                shopSlug={item.shop?.slug}
                citySlug={citySlug}
              />
            ))}
          </div>
          <PaginationLinks
            current={page} q={q} citySlug={citySlug}
            category={category} sort={sort} inStock={inStock} hasMore={hasMore}
          />
        </>
      )}
    </div>
  );
}
