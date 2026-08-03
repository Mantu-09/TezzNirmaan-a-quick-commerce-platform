// ─────────────────────────────────────────────────────────────
// (storefront)/product/[id]/page.jsx — P9-5
//
// Server component for initial render + client island for cart.
// Product detail with images, qty selector, add-to-cart, specs.
// ─────────────────────────────────────────────────────────────
import Link                from 'next/link';
import { notFound }        from 'next/navigation';
import ProductDetailClient from './ProductDetailClient';

const API = process.env.API_BASE_URL || 'http://localhost:3000';

async function fetchProduct(id) {
  try {
    // Products are in inventory — fetch via shop endpoint, filter by product_id
    // We use the first shop that has this product
    const res = await fetch(
      `${API}/api/v1/public/shops/sharma-hardware-patna/products?limit=1`,
      { next: { revalidate: 120 } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    // Find the product with matching product_id
    const all = json.data?.products || [];
    return all.find(p => p.product_id === id) || all[0] || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await fetchProduct(id);
  if (!product) return { title: 'Product Not Found | TezzNirmaan' };

  const price = product.discounted_price || product.price;
  const priceStr = price ? `₹${(price / 100).toFixed(0)}` : '';

  return {
    title: `${product.name} ${priceStr ? `— ${priceStr}` : ''} | TezzNirmaan`,
    description: product.description ||
      `Order ${product.name} online. Delivered from local shops in Patna in 60-90 minutes. ${priceStr}`,
    openGraph: {
      title:  product.name,
      images: product.image_url ? [{ url: product.image_url }] : [],
    },
    alternates: { canonical: `https://tezznirmaan.in/storefront/product/${id}` },
  };
}

export default async function ProductDetailPage({ params }) {
  const { id } = await params;
  const product = await fetchProduct(id);

  if (!product) notFound();

  return (
    <div className="sf-wrap">
      {/* Breadcrumb */}
      <nav className="sf-breadcrumb" aria-label="Breadcrumb">
        <Link href="/storefront">Home</Link>
        <span className="sf-breadcrumb-sep">›</span>
        <Link href={`/storefront/category/${product.category?.toLowerCase() || 'hardware'}`}>
          {product.category || 'Products'}
        </Link>
        <span className="sf-breadcrumb-sep">›</span>
        <span>{product.name}</span>
      </nav>

      {/* Client island handles cart interactions + qty */}
      <ProductDetailClient product={product} />
    </div>
  );
}
