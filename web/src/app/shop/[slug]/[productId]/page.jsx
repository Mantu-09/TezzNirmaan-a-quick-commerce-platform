// ─────────────────────────────────────────────────────────────
// web/src/app/shop/[slug]/[productId]/page.jsx — Product Detail (ISR)
// P9-5: TezzNirmaan web storefront
//
// URL:    /shop/:slug/:productId (productId = inventory_id UUID)
// Data:   ISR — getShopBySlug + getShopProducts to find product
// SEO:    generateMetadata + Product JSON-LD
// ─────────────────────────────────────────────────────────────
import { notFound } from 'next/navigation';
import Link         from 'next/link';
import { getShopBySlug, getShopProducts } from '../../../../lib/api';

export const revalidate = 60;

// ── SEO metadata ──────────────────────────────────────────────
export async function generateMetadata({ params }) {
  try {
    const [shop, productsData] = await Promise.all([
      getShopBySlug(params.slug),
      getShopProducts(params.slug, { limit: 48 }),
    ]);
    if (!shop) return { title: 'Product Not Found' };

    const product = (productsData?.products || []).find(p => p.inventory_id === params.productId);
    if (!product) return { title: `${shop.name} | TezzNirmaan` };

    const price = product.discounted_paise || product.price_paise;

    return {
      title:       `${product.name} — Buy in ${shop.city} | TezzNirmaan`,
      description: product.description
        || `Order ${product.name} from ${shop.name} in ${shop.city}. Fast delivery by TezzNirmaan.`,
      openGraph: {
        title:  product.name,
        images: product.image_url ? [{ url: product.image_url }] : [],
      },
      alternates: {
        canonical: `https://tezznirmaan.in/shop/${params.slug}/${params.productId}`,
      },
    };
  } catch (_) {
    return { title: 'Product | TezzNirmaan' };
  }
}

// ── Page component ────────────────────────────────────────────
export default async function ProductDetailPage({ params }) {
  let shop, productsData;
  try {
    [shop, productsData] = await Promise.all([
      getShopBySlug(params.slug),
      getShopProducts(params.slug, { limit: 48 }),
    ]);
  } catch (_) {
    notFound();
  }

  if (!shop) notFound();

  const products = productsData?.products || [];
  const product  = products.find(p => p.inventory_id === params.productId);
  if (!product) notFound();

  const price       = product.discounted_paise || product.price_paise;
  const origPrice   = product.discounted_paise ? product.price_paise : null;
  const fmtRupee    = (p) => p ? `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : null;
  const discountPct = origPrice && price < origPrice
    ? Math.round(((origPrice - price) / origPrice) * 100)
    : null;

  // ── Related products: same category, excluding this one ────
  const related = products
    .filter(p => p.category === product.category && p.inventory_id !== product.inventory_id)
    .slice(0, 4);

  return (
    <>
      {/* JSON-LD: Product */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context':   'https://schema.org',
            '@type':      'Product',
            name:         product.name,
            description:  product.description,
            image:        product.image_url,
            brand:        product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
            offers: {
              '@type':       'Offer',
              price:         (price / 100).toFixed(2),
              priceCurrency: 'INR',
              availability:  product.in_stock
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
              seller: { '@type': 'Organization', name: shop.name },
            },
          }),
        }}
      />

      <div style={{ paddingBottom: 80 }}>
        {/* ── Breadcrumb ───────────────────────────── */}
        <div style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: 'var(--s4) 0' }}>
          <div className="container">
            <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Link href="/" style={{ color: 'var(--text-3)' }}>Home</Link>
              <span>/</span>
              <Link href={`/shop/${shop.slug}`} style={{ color: 'var(--text-3)' }}>{shop.name}</Link>
              <span>/</span>
              <span style={{ color: 'var(--text)' }}>{product.name}</span>
            </nav>
          </div>
        </div>

        {/* ── Product main ─────────────────────────── */}
        <section style={{ padding: 'var(--s8) 0' }}>
          <div className="container">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'var(--s8)',
              alignItems: 'start',
            }}>
              {/* Image */}
              <div style={{
                backgroundColor: 'var(--surface-2)',
                borderRadius: 'var(--r-xl)',
                overflow: 'hidden',
                aspectRatio: '1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                border: '1px solid var(--border)',
              }}>
                {product.image_url
                  ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt={product.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )
                  : <span style={{ fontSize: 64 }}>📦</span>
                }
                {discountPct && (
                  <div style={{
                    position: 'absolute', top: 16, left: 16,
                    backgroundColor: '#E8521A', color: '#fff',
                    fontSize: 13, fontWeight: 800,
                    padding: '4px 10px', borderRadius: 6,
                  }}>
                    -{discountPct}% OFF
                  </div>
                )}
              </div>

              {/* Details */}
              <div>
                {/* Category */}
                {product.category && (
                  <Link
                    href={`/shop/${shop.slug}?category=${encodeURIComponent(product.category)}`}
                    style={{
                      fontSize: 12, fontWeight: 700, color: 'var(--primary)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      display: 'inline-block', marginBottom: 8,
                    }}
                  >
                    {product.category}
                  </Link>
                )}

                <h1 style={{
                  fontSize: 'clamp(22px, 3vw, 30px)',
                  fontWeight: 900, color: 'var(--text)',
                  lineHeight: 1.25, marginBottom: 8,
                  letterSpacing: '-0.02em',
                }}>
                  {product.name}
                </h1>

                {/* Brand + unit */}
                {(product.brand || product.unit) && (
                  <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16 }}>
                    {product.brand && <strong>{product.brand}</strong>}
                    {product.brand && product.unit && ' · '}
                    {product.unit && `per ${product.unit}`}
                  </p>
                )}

                {/* Price */}
                <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 36, fontWeight: 900, color: 'var(--text)' }}>
                    {fmtRupee(price)}
                  </span>
                  {origPrice && (
                    <span style={{ fontSize: 18, color: 'var(--text-3)', textDecoration: 'line-through' }}>
                      {fmtRupee(origPrice)}
                    </span>
                  )}
                </div>

                {/* Stock status */}
                <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    backgroundColor: product.in_stock ? '#22c55e' : '#ef4444',
                  }} />
                  <span style={{ fontSize: 14, color: product.in_stock ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {product.in_stock ? 'In Stock' : 'Out of Stock'}
                  </span>
                </div>

                {/* Description */}
                {product.description && (
                  <p style={{
                    fontSize: 15, color: 'var(--text-2)', lineHeight: 1.8,
                    marginBottom: 28,
                  }}>
                    {product.description}
                  </p>
                )}

                {/* Order CTAs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <a
                    href="https://play.google.com/store/apps/details?id=in.tezznirmaan.app"
                    className="btn btn-primary"
                    style={{ justifyContent: 'center', fontSize: 16, padding: '16px 24px' }}
                    target="_blank" rel="noopener noreferrer"
                  >
                    📱 Order on TezzNirmaan App
                  </a>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                    ⚡ Fast delivery · 🔒 Secure checkout · 🔄 Easy returns
                  </p>
                </div>

                {/* Shop info */}
                <div style={{
                  marginTop: 24, padding: 'var(--s4)',
                  backgroundColor: 'var(--surface-2)',
                  borderRadius: 'var(--r-md)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>Sold by</div>
                    <Link href={`/shop/${shop.slug}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
                      {shop.name} →
                    </Link>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>Location</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{shop.city}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Specifications ───────────────────────── */}
        {product.specifications && Object.keys(product.specifications).length > 0 && (
          <section style={{ padding: 'var(--s6) 0', backgroundColor: 'var(--surface-2)' }}>
            <div className="container">
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 20 }}>
                Specifications
              </h2>
              <div style={{
                backgroundColor: 'var(--surface)',
                borderRadius: 'var(--r-lg)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
              }}>
                {Object.entries(product.specifications).map(([key, val], i) => (
                  <div key={key} style={{
                    display: 'flex', padding: 'var(--s4)',
                    borderBottom: i < Object.keys(product.specifications).length - 1 ? '1px solid var(--border)' : 'none',
                    gap: 16,
                  }}>
                    <div style={{ fontSize: 14, color: 'var(--text-3)', fontWeight: 600, minWidth: 140, flexShrink: 0 }}>
                      {key}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text)' }}>{String(val)}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Related products ─────────────────────── */}
        {related.length > 0 && (
          <section style={{ padding: 'var(--s8) 0' }}>
            <div className="container">
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 20 }}>
                More from {shop.name}
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 16,
              }}>
                {related.map(p => (
                  <Link
                    key={p.inventory_id}
                    href={`/shop/${shop.slug}/${p.inventory_id}`}
                    className="card"
                    style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textDecoration: 'none' }}
                  >
                    <div style={{
                      aspectRatio: '4/3', backgroundColor: 'var(--surface-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      {p.image_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                        : <span style={{ fontSize: 28 }}>📦</span>
                      }
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {p.name}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                        {fmtRupee(p.discounted_paise || p.price_paise)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
