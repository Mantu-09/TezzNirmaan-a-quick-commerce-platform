// ─────────────────────────────────────────────────────────────
// web/src/components/ProductCard.jsx — Reusable product card
// P9-5: TezzNirmaan web storefront
//
// Renders a product card in the shop page grid.
// Clicking the card opens the product detail page (/shop/:slug/:inventoryId)
// or redirects to the app for ordering.
// ─────────────────────────────────────────────────────────────
import Link from 'next/link';

// Format paise to readable rupee string
function fmtRupee(paise) {
  if (!paise) return null;
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// Discount percentage
function discountPct(price, discounted) {
  if (!price || !discounted || discounted >= price) return null;
  return Math.round(((price - discounted) / price) * 100);
}

export default function ProductCard({ product, shopSlug }) {
  const price      = fmtRupee(product.price_paise);
  const discounted = fmtRupee(product.discounted_paise);
  const pct        = discountPct(product.price_paise, product.discounted_paise);
  const showOriginal = pct && pct > 0;

  const href = `/shop/${shopSlug}/${product.inventory_id}`;

  return (
    <Link
      href={href}
      className="card"
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textDecoration: 'none' }}
      aria-label={`View ${product.name}`}
    >
      {/* Image */}
      <div style={{
        aspectRatio: '4/3',
        backgroundColor: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', position: 'relative',
      }}>
        {product.image_url
          ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
              loading="lazy"
            />
          )
          : (
            <span style={{ fontSize: 36, userSelect: 'none' }}>📦</span>
          )
        }

        {/* Discount badge */}
        {pct && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            backgroundColor: '#E8521A', color: '#fff',
            fontSize: 11, fontWeight: 800,
            padding: '2px 7px', borderRadius: 4,
          }}>
            -{pct}%
          </div>
        )}

        {/* Out of stock overlay */}
        {!product.in_stock && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundColor: 'rgba(255,255,255,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>Out of Stock</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Category */}
        {product.category && (
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--primary)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 4,
          }}>
            {product.category}
          </div>
        )}

        {/* Name */}
        <h3 style={{
          fontSize: 14, fontWeight: 700, color: 'var(--text)',
          lineHeight: 1.4, marginBottom: 4,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {product.name}
        </h3>

        {/* Brand */}
        {product.brand && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
            {product.brand}
          </p>
        )}

        {/* Unit */}
        {product.unit && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>
            per {product.unit}
          </p>
        )}

        {/* Price */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
            {showOriginal ? discounted : price}
          </span>
          {showOriginal && (
            <span style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'line-through' }}>
              {price}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
