// ─────────────────────────────────────────────────────────────
// (storefront)/page.jsx — P12-3 (updated from P11-3/P10-0)
//
// Server component — ISR 60s.
// P12-3 adds:
//   • Hero banner carousel (fetched from banners table)
//   • Flash deals section (products with discounted_price)
//   • New arrivals section (products added last 14 days)
//   • Category pill row (existing, links fixed)
//   • Best sellers in city (existing)
//   • Value props (existing)
// ─────────────────────────────────────────────────────────────
import { cookies }   from 'next/headers';
import Link          from 'next/link';
import ProductCard   from './components/ProductCard';
import HeroBanner    from './components/HeroBanner';
import { FlashSalesBanner } from './components/FlashSaleTimer'; // P13-5
import dynamic from 'next/dynamic';
const ReferralBanner     = dynamic(() => import('./components/ReferralBanner'), { ssr: false }); // P14-3
const RecommendationsRow = dynamic(() => import('./components/RecommendationsRow'), { ssr: false }); // P19-1


const API = process.env.API_BASE_URL || 'http://localhost:3000';

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

// ── Data fetchers ─────────────────────────────────────────────
async function fetchCityCatalog(citySlug = 'patna', sort = 'popular', limit = 12) {
  try {
    const res = await fetch(
      `${API}/api/v1/public/catalog?city=${encodeURIComponent(citySlug)}&limit=${limit}&sort=${sort}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return { products: [], city: null };
    const json = await res.json();
    return { products: json.data?.products || [], city: json.data?.city || null };
  } catch { return { products: [], city: null }; }
}

async function fetchBanners(citySlug) {
  try {
    // Try to get city-specific + global banners from Supabase via public endpoint
    const res = await fetch(
      `${API}/api/v1/public/banners?city=${encodeURIComponent(citySlug)}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || json.banners || [];
  } catch { return []; } // Gracefully fall to HeroBanner defaults
}

export const metadata = {
  title: 'TezzNirmaan — 60-Min Hardware & Building Material Delivery in Bihar',
  description: 'Order cement, paint, tiles, plumbing, electrical supplies from local shops in Patna, Muzaffarpur, Bhagalpur & Gaya. Delivered in 60-90 minutes.',
  keywords: ['hardware delivery', 'cement delivery patna', 'paint delivery Bihar', 'construction material online', 'tezznirmaan', 'plumbing supplies', 'tiles delivery'],
  openGraph: {
    title:       'TezzNirmaan — 60-Min Hardware Delivery in Bihar',
    description: 'Order cement, paint, tiles and more from local shops. Delivered to your site in 60-90 minutes.',
    url:         'https://tezznirmaan.com',
    siteName:    'TezzNirmaan',
    locale:      'en_IN',
    type:        'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'TezzNirmaan — 60-Min Hardware Delivery',
    description: 'Order construction materials from local shops in Patna, Muzaffarpur, Bhagalpur & Gaya.',
  },
  alternates: {
    canonical: 'https://tezznirmaan.com',
  },
};

export const revalidate = 60;

// ── Section header ────────────────────────────────────────────
function SectionHeader({ title, sub, href, linkLabel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
      <div>
        <h2 className="sf-section-title" style={{ marginBottom: 2 }}>{title}</h2>
        {sub && <p className="sf-section-sub">{sub}</p>}
      </div>
      {href && (
        <Link href={href} style={{ fontSize: 13, fontWeight: 700, color: 'var(--sf-primary,#f97316)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          {linkLabel || 'See all'} →
        </Link>
      )}
    </div>
  );
}

// ── Horizontal product scroll (for flash/new arrivals) ────────
function ProductRow({ products, citySlug }) {
  if (!products.length) return null;
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory' }}>
      {products.map(p => (
        <div key={p.inventory_id} style={{ minWidth: 180, maxWidth: 180, scrollSnapAlign: 'start', flexShrink: 0 }}>
          <ProductCard product={p} shopSlug={p.shop?.slug} citySlug={citySlug} />
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default async function StorefrontHomePage({ searchParams }) {
  const sp          = await searchParams;
  const cookieStore = await cookies();
  const citySlug    = sp?.city || cookieStore.get('tn_city')?.value || 'patna';
  const cityLabel   = citySlug.charAt(0).toUpperCase() + citySlug.slice(1);

  // Parallel data fetches
  const [
    { products: bestSellers, city },
    { products: newestRaw },
    banners,
    flashSalesData,
  ] = await Promise.all([
    fetchCityCatalog(citySlug, 'popular', 12),
    fetchCityCatalog(citySlug, 'newest',  8),
    fetchBanners(citySlug),
    fetch(`${API}/api/v1/public/flash-sales?city=${citySlug}`, { next: { revalidate: 30 } })
      .then(r => r.json()).then(j => j.data?.flash_sales || []).catch(() => []),
  ]);

  // Flash deals = bestsellers that have a discount
  const flashDeals = bestSellers.filter(p => p.discounted_price && p.discounted_price < p.price).slice(0, 8);
  // New arrivals (deduplicated from best sellers)
  const bestIds    = new Set(bestSellers.map(p => p.inventory_id));
  const newArrivals = newestRaw.filter(p => !bestIds.has(p.inventory_id)).slice(0, 8);


  return (
    <>
      {/* P12-9: JSON-LD — LocalBusiness + WebSite schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type':       'Organization',
              '@id':         'https://tezznirmaan.com/#organization',
              name:          'TezzNirmaan',
              url:           'https://tezznirmaan.com',
              description:   'Quick-commerce platform for hardware and construction materials in Bihar',
              areaServed:    ['Patna', 'Muzaffarpur', 'Bhagalpur', 'Gaya'],
              sameAs:        ['https://instagram.com/tezznirmaan'],
            },
            {
              '@type':             'WebSite',
              '@id':               'https://tezznirmaan.com/#website',
              url:                 'https://tezznirmaan.com',
              name:                'TezzNirmaan',
              publisher:           { '@id': 'https://tezznirmaan.com/#organization' },
              potentialAction: {
                '@type':   'SearchAction',
                target:    'https://tezznirmaan.com/search?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            },
          ],
        })}}
      />

      {/* ── Hero banner carousel ──────────────────────────────── */}
      <div className="sf-wrap" style={{ paddingTop: 20 }}>
        <HeroBanner banners={banners} />
        {/* P13-5: Flash sales banner — shown when active flash sales exist */}
        {flashSalesData?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <FlashSalesBanner flashSales={flashSalesData} />
            {/* P14-3: Referral banner (client-only, dismissible) */}
            <ReferralBanner />
          </div>
        )}
      </div>

      {/* ── Category pills ──────────────────────────────────────── */}
      <div className="sf-cat-scroll">
        <div className="sf-cat-row">
          {CATEGORIES.map(cat => (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}?city=${citySlug}`}
              className="sf-cat-pill"
            >
              <span className="sf-cat-pill-icon">{cat.emoji}</span>
              <span className="sf-cat-pill-label">{cat.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="sf-wrap">

        {/* ── Flash Deals ──────────────────────────────────────── */}
        {flashDeals.length > 0 && (
          <section className="sf-section" style={{ paddingTop: 8 }}>
            <SectionHeader
              title="🔥 Flash Deals"
              sub="Limited-time discounts on popular items"
              href={`/search?sort=price_asc&city=${citySlug}`}
              linkLabel="All deals"
            />
            <ProductRow products={flashDeals} citySlug={citySlug} />
          </section>
        )}

        {/* ── New Arrivals ─────────────────────────────────────── */}
        {newArrivals.length > 0 && (
          <section className="sf-section" style={{ paddingTop: 0 }}>
            <SectionHeader
              title="✨ New Arrivals"
              sub="Fresh stock just added in your city"
              href={`/search?sort=newest&city=${citySlug}`}
              linkLabel="See all new"
            />
            <ProductRow products={newArrivals} citySlug={citySlug} />
          </section>
        )}

        {/* ── P19-1: Recommended for You ───────────────────── */}
        {city?.id && (
          <section className="sf-section" style={{ paddingTop: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: '#1f2937', marginBottom: 4, paddingLeft: 4 }}>
              🎯 Recommended for You
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14, paddingLeft: 4 }}>
              Top picks in {city?.name || cityLabel}
            </div>
            <RecommendationsRow
              title=""
              endpoint={`/api/backend/public/recommendations/personalized?city_id=${city.id}`}
            />
          </section>
        )}

        {/* ── Best Sellers ─────────────────────────────────────── */}
        <section className="sf-section" style={{ paddingTop: 0 }}>
          <SectionHeader
            title={`⭐ Best Sellers in ${city?.name || cityLabel}`}
            sub="Most ordered construction & home improvement products"
            href={`/search?sort=popular&city=${citySlug}`}
            linkLabel="See all"
          />

          {bestSellers.length > 0 ? (
            <div className="sf-product-grid">
              {bestSellers.map(p => (
                <ProductCard
                  key={p.inventory_id}
                  product={p}
                  shopSlug={p.shop?.slug}
                  citySlug={citySlug}
                />
              ))}
            </div>
          ) : (
            <div className="sf-empty">
              <div className="sf-empty-icon">🏗️</div>
              <div className="sf-empty-title">Coming Soon in Your Area</div>
              <div className="sf-empty-sub">
                We're onboarding shops in {cityLabel}.<br />
                <Link href="/shop-signup" style={{ color: 'var(--sf-primary)' }}>Partner with us →</Link>
              </div>
            </div>
          )}

          {/* Browse by category */}
          {bestSellers.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              {CATEGORIES.map(cat => (
                <Link
                  key={cat.slug}
                  href={`/category/${cat.slug}?city=${citySlug}`}
                  className="sf-btn sf-btn-ghost"
                  style={{ margin: 4 }}
                >
                  {cat.emoji} {cat.label}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── Value props ──────────────────────────────────────── */}
        <section className="sf-section" style={{ paddingTop: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {[
              { icon: '⚡', title: 'Quick Delivery',   sub: '60–90 min from local shops'          },
              { icon: '🏪', title: 'Local Shops',      sub: 'Trusted hardware stores near you'    },
              { icon: '💰', title: 'Best Prices',      sub: 'Wholesale pricing, retail convenience' },
              { icon: '📦', title: 'Bulk Orders',      sub: 'Perfect for contractors & builders'  },
              { icon: '🔁', title: 'Easy Returns',     sub: '7-day hassle-free return policy'     },
              { icon: '🔒', title: 'Secure Payments',  sub: 'Razorpay · UPI · COD'               },
            ].map(v => (
              <div key={v.title} style={{
                background: 'var(--sf-surface)', border: '1px solid var(--sf-border)',
                borderRadius: 'var(--sf-radius)', padding: '18px', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.75rem', marginBottom: 8 }}>{v.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>{v.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--sf-text-2)' }}>{v.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── App install nudge ─────────────────────────────────── */}
        <section style={{
          background: 'linear-gradient(135deg,var(--sf-primary,#f97316),#fb923c)',
          borderRadius: 20, padding: '28px 24px', marginBottom: 40, color: '#fff',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>📱 Get the TezzNirmaan App</h2>
            <p style={{ opacity: 0.88, fontSize: 14 }}>Track orders live, get push alerts, and order in under 30 seconds.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <a href="#" style={{ padding: '10px 18px', borderRadius: 10, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              🤖 Android
            </a>
            <a href="#" style={{ padding: '10px 18px', borderRadius: 10, background: '#fff', color: 'var(--sf-primary,#f97316)', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              🍎 iOS
            </a>
          </div>
        </section>

        {/* P13-6: Shop owner CTA ────────────────────────────── */}
        <section style={{
          background: 'var(--sf-bg)', border: '1.5px solid var(--sf-border)',
          borderRadius: 20, padding: '28px 24px', marginBottom: 40,
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, marginBottom: 6 }}>🏪 Are you a shop owner?</h2>
            <p style={{ fontSize: 14, color: 'var(--sf-text-2)', lineHeight: 1.6, maxWidth: 380 }}>
              Partner with TezzNirmaan and reach thousands of customers across Bihar.
              Only 8–15% commission. Weekly payouts. We handle delivery.
            </p>
          </div>
          <Link
            href="/join"
            style={{
              padding: '12px 24px', borderRadius: 12,
              background: 'var(--sf-primary,#f97316)', color: '#fff',
              fontWeight: 800, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            Partner With Us →
          </Link>
        </section>
      </div>
    </>
  );
}
