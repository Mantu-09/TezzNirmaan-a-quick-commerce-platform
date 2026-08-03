// ─────────────────────────────────────────────────────────────
// web/src/app/shop/[slug]/page.jsx — Shop page (ISR)
// P9-5: TezzNirmaan web storefront
//
// URL:    /shop/:slug
// Data:   getShopBySlug(slug) + getShopProducts(slug)
// Cache:  ISR — revalidate: 60 seconds
// SEO:    generateMetadata + JSON-LD for LocalBusiness
// ─────────────────────────────────────────────────────────────
import { notFound } from 'next/navigation';
import Link         from 'next/link';
import { getShopBySlug, getShopProducts, getAllShopSlugs } from '../../../lib/api';
import ProductCard from '../../../components/ProductCard';

export const revalidate = 60; // ISR: revalidate every 60 seconds

// ── generateStaticParams ─────────────────────────────────────
// Pre-render all active shop slugs at build time.
// New shops added after build are generated on-demand (ISR).
export async function generateStaticParams() {
  try {
    const slugs = await getAllShopSlugs();
    return slugs.map(slug => ({ slug }));
  } catch (_) {
    return []; // On error, render on-demand only
  }
}

// ── SEO metadata ──────────────────────────────────────────────
export async function generateMetadata({ params }) {
  try {
    const shop = await getShopBySlug(params.slug);
    if (!shop) return { title: 'Shop Not Found' };

    return {
      title:       `${shop.name} — Order Online in ${shop.city} | TezzNirmaan`,
      description: shop.description
        || `Order from ${shop.name} in ${shop.city}. Fast delivery by TezzNirmaan.`,
      openGraph: {
        title:  shop.name,
        images: shop.logo_url ? [{ url: shop.logo_url }] : [],
      },
      alternates: {
        canonical: `https://tezznirmaan.in/shop/${shop.slug}`,
      },
    };
  } catch (_) {
    return { title: 'Shop | TezzNirmaan' };
  }
}

// ── Page component ────────────────────────────────────────────
export default async function ShopPage({ params, searchParams }) {
  const category  = searchParams?.category || null;
  const page      = parseInt(searchParams?.page || '1', 10);

  // Parallel fetch — shop metadata + products
  let shop, productsData;
  try {
    [shop, productsData] = await Promise.all([
      getShopBySlug(params.slug),
      getShopProducts(params.slug, { category, page }),
    ]);
  } catch (_) {
    notFound();
  }

  if (!shop) notFound();

  const { products = [], pagination } = productsData || {};

  // Rating stars display
  const ratingStars = (r) => {
    const full  = Math.floor(r || 0);
    const stars = '★'.repeat(full) + '☆'.repeat(5 - full);
    return stars;
  };

  return (
    <>
      {/* JSON-LD: LocalBusiness */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type':    'LocalBusiness',
            name:       shop.name,
            description: shop.description,
            image:       shop.logo_url,
            url:         `https://tezznirmaan.in/shop/${shop.slug}`,
            address: {
              '@type':         'PostalAddress',
              streetAddress:   shop.address,
              addressLocality: shop.city,
              addressCountry:  'IN',
            },
            aggregateRating: shop.rating ? {
              '@type':       'AggregateRating',
              ratingValue:   shop.rating,
              reviewCount:   shop.total_reviews || 0,
              bestRating:    5,
            } : undefined,
          }),
        }}
      />

      {/* ── Shop hero ──────────────────────────────── */}
      <div style={{
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: 'var(--s6) 0',
      }}>
        <div className="container">
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
            <Link href="/" style={{ color: 'var(--text-3)' }}>Home</Link>
            <span style={{ margin: '0 6px' }}>/</span>
            <span>{shop.name}</span>
          </nav>

          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Logo */}
            <div style={{
              width: 80, height: 80, borderRadius: 'var(--r-lg)',
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32, flexShrink: 0,
              overflow: 'hidden',
            }}>
              {shop.logo_url
                ? <img src={shop.logo_url} alt={shop.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '🏪'
              }
            </div>

            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
                {shop.name}
              </h1>

              {/* Rating */}
              {shop.rating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ color: '#f59e0b', fontSize: 14 }}>{ratingStars(shop.rating)}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>{shop.rating}</span>
                  {shop.total_reviews > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>({shop.total_reviews} reviews)</span>
                  )}
                </div>
              )}

              {/* Address */}
              <p style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                📍 {shop.address || shop.city}
              </p>

              {/* Hours */}
              {shop.opening_time && (
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
                  🕐 {shop.opening_time} – {shop.closing_time}
                </p>
              )}
            </div>

            {/* Download CTA */}
            <a
              href="https://play.google.com/store/apps/details?id=in.tezznirmaan.app"
              className="btn btn-primary"
              style={{ flexShrink: 0 }}
              target="_blank" rel="noopener noreferrer"
            >
              Order in App
            </a>
          </div>

          {/* Category filter pills */}
          {shop.categories?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
              <Link
                href={`/shop/${shop.slug}`}
                style={{
                  fontSize: 13, fontWeight: 600,
                  padding: '6px 14px', borderRadius: 'var(--r-full)',
                  backgroundColor: !category ? 'var(--primary)' : 'var(--surface-2)',
                  color: !category ? '#fff' : 'var(--text-2)',
                  border: '1px solid var(--border)',
                }}
              >
                All
              </Link>
              {shop.categories.map(cat => (
                <Link
                  key={cat}
                  href={`/shop/${shop.slug}?category=${encodeURIComponent(cat)}`}
                  style={{
                    fontSize: 13, fontWeight: 600,
                    padding: '6px 14px', borderRadius: 'var(--r-full)',
                    backgroundColor: category === cat ? 'var(--primary)' : 'var(--surface-2)',
                    color: category === cat ? '#fff' : 'var(--text-2)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {cat}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Product grid ──────────────────────────── */}
      <section style={{ padding: 'var(--s8) 0 var(--s12)' }}>
        <div className="container">
          {/* Result count */}
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
            {pagination?.total ?? 0} products
            {category ? ` in "${category}"` : ''}
          </p>

          {products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <p style={{ fontSize: 16, fontWeight: 600 }}>No products found</p>
              <p style={{ fontSize: 14, marginTop: 4 }}>
                {category ? 'Try a different category' : 'This shop has no products yet'}
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 16,
            }}>
              {products.map(product => (
                <ProductCard
                  key={product.inventory_id}
                  product={product}
                  shopSlug={shop.slug}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && (pagination.has_prev || pagination.has_next) && (
            <div style={{
              display: 'flex', justifyContent: 'center',
              gap: 12, marginTop: 40,
            }}>
              {pagination.has_prev && (
                <Link
                  href={`/shop/${shop.slug}?${category ? `category=${encodeURIComponent(category)}&` : ''}page=${page - 1}`}
                  className="btn btn-outline"
                  style={{ fontSize: 14 }}
                >
                  ← Previous
                </Link>
              )}
              <span style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                Page {pagination.page} of {pagination.total_pages}
              </span>
              {pagination.has_next && (
                <Link
                  href={`/shop/${shop.slug}?${category ? `category=${encodeURIComponent(category)}&` : ''}page=${page + 1}`}
                  className="btn btn-outline"
                  style={{ fontSize: 14 }}
                >
                  Next →
                </Link>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
