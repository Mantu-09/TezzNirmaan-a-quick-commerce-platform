// ─────────────────────────────────────────────────────────────
// (storefront)/product/[id]/page.jsx — P12-5 (updated from P10-0)
//
// Server component for initial render + client island for cart.
// P10-0: Fetches from /public/products/:id (any active shop, cheapest
// price) instead of the hardcoded sharma-hardware-patna slug.
// P12-5: Adds ProductReviews + JSON-LD schema + breadcrumb fixes.
// ─────────────────────────────────────────────────────────────
import Link                from 'next/link';
import { notFound }        from 'next/navigation';
import ProductDetailClient from './ProductDetailClient';
import ProductReviews      from '../../components/ProductReviews';

const API = process.env.API_BASE_URL || 'http://localhost:3000';

async function fetchProduct(id) {
  try {
    const res = await fetch(
      `${API}/api/v1/public/products/${encodeURIComponent(id)}`,
      { next: { revalidate: 120 } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await fetchProduct(id);
  if (!product) return { title: 'Product Not Found | TezzNirmaan' };

  const price    = product.discounted_price || product.price;
  const priceStr = price ? `₹${Math.round(price / 100)}` : '';

  return {
    title:       `${product.name}${priceStr ? ` — ${priceStr}` : ''} | TezzNirmaan`,
    description: product.description ||
      `Order ${product.name} online. Delivered from local shops in Patna, Muzaffarpur, Bhagalpur & Gaya in 60-90 minutes. ${priceStr}`,
    openGraph: {
      title:  product.name,
      images: product.image_url ? [{ url: product.image_url }] : [],
    },
    alternates: { canonical: `https://tezznirmaan.com/product/${id}` },
  };
}

export default async function ProductDetailPage({ params, searchParams }) {
  const { id }   = await params;
  const sp       = await searchParams;
  const citySlug = sp?.city || 'patna';

  const product = await fetchProduct(id);
  if (!product) notFound();

  const categorySlug = product.category?.toLowerCase() || 'hardware';
  const priceRupees  = Math.round((product.discounted_price || product.price || 0) / 100);

  // JSON-LD Product schema for SEO (P12-9 head start)
  const jsonLd = {
    '@context':    'https://schema.org',
    '@type':       'Product',
    name:          product.name,
    description:   product.description || product.name,
    image:         product.image_url || undefined,
    brand:         product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    offers: {
      '@type':       'Offer',
      price:         priceRupees,
      priceCurrency: 'INR',
      availability:  product.stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'TezzNirmaan' },
    },
    ...(product.avg_rating && product.review_count ? {
      aggregateRating: {
        '@type':       'AggregateRating',
        ratingValue:   product.avg_rating,
        reviewCount:   product.review_count,
      },
    } : {}),
  };

  return (
    <div className="sf-wrap">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb — fixed: was /storefront/* (404) */}
      <nav className="sf-breadcrumb" aria-label="Breadcrumb" style={{ marginTop: 16 }}>
        <Link href={`/?city=${citySlug}`}>Home</Link>
        <span className="sf-breadcrumb-sep">›</span>
        <Link href={`/category/${categorySlug}?city=${citySlug}`}>
          {product.category || 'Products'}
        </Link>
        <span className="sf-breadcrumb-sep">›</span>
        <span>{product.name}</span>
      </nav>

      {/* Client island handles cart interactions + qty */}
      <ProductDetailClient product={product} />

      {/* P12-5: Reviews section */}
      <div style={{ paddingBottom: 48 }}>
        <ProductReviews
          productId={product.id || id}
          avgRating={product.avg_rating || 0}
          reviewCount={product.review_count || 0}
        />
      </div>
    </div>
  );
}
