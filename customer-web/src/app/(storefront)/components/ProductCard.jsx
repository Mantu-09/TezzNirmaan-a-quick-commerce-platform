// ─────────────────────────────────────────────────────────────
// ProductCard.jsx — P10-0 (updated from P9-5)
//
// Client component — cart interactions.
// Reused across Home, Category, Search, and City pages.
// Handles Add/qty increment/decrement inline without page nav.
//
// P10-0: Accepts optional `citySlug` prop so product detail links
// preserve city context. Price fields are now `price` / `discounted_price`
// (matching the /public/catalog response shape).
// ─────────────────────────────────────────────────────────────
'use client';
import { useState } from 'react';
import Link         from 'next/link';
import { useCart }  from './CartProvider';

// Category → emoji mapping for placeholder images
const CATEGORY_EMOJI = {
  construction: '🏗️',
  paints:       '🎨',
  tiles:        '🟫',
  electrical:   '⚡',
  plumbing:     '🔧',
  hardware:     '🔩',
  decor:        '🏠',
  fittings:     '🔌',
};

const fmt = {
  price: p => `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
};

export default function ProductCard({ product, shopSlug, citySlug }) {
  const { cart, addItem, updateItem } = useCart();
  const [adding, setAdding] = useState(false);

  const cartItem = cart.find(i => i.inventory_id === product.inventory_id);
  const qty      = cartItem?.quantity || 0;

  // Support both `price` and legacy `price_paise` field names
  const rawPrice    = product.price ?? product.price_paise ?? 0;
  const rawDiscount = product.discounted_price ?? null;

  const hasDiscount  = rawDiscount && rawDiscount < rawPrice;
  const displayPrice = hasDiscount ? rawDiscount : rawPrice;
  const discountPct  = hasDiscount
    ? Math.round((1 - rawDiscount / rawPrice) * 100)
    : 0;

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    addItem({
      inventory_id:     product.inventory_id,
      product_id:       product.product_id,
      name:             product.name,
      price:            rawPrice,
      discounted_price: rawDiscount,
      image_url:        product.image_url,
      unit:             product.unit,
      shop_slug:        shopSlug || product.shop?.slug,
    });
    setTimeout(() => setAdding(false), 500);
  };

  const handleDecrease = (e) => {
    e.preventDefault();
    updateItem(product.inventory_id, qty - 1);
  };

  const handleIncrease = (e) => {
    e.preventDefault();
    updateItem(product.inventory_id, qty + 1);
  };

  // Build product detail URL with city context
  const productHref = citySlug
    ? `/product/${product.product_id}?city=${citySlug}`
    : `/product/${product.product_id}`;

  return (
    <Link
      href={productHref}
      className="sf-product-card"
      prefetch={false}
    >
      {/* Product image */}
      {product.image_url
        ? <img src={product.image_url} alt={product.name} className="sf-product-img" loading="lazy" />
        : (
          <div className="sf-product-img-placeholder">
            {CATEGORY_EMOJI[product.category] || '📦'}
          </div>
        )
      }

      <div className="sf-product-body">
        {/* Brand */}
        {product.brand && <div className="sf-product-brand">{product.brand}</div>}

        {/* Name */}
        <div className="sf-product-name">{product.name}</div>

        {/* Unit */}
        {product.unit && <div className="sf-product-brand">{product.unit}</div>}

        {/* Shop name (multi-shop: show which shop) */}
        {product.shop?.name && (
          <div style={{ fontSize: '0.75rem', color: 'var(--sf-text-2)', marginBottom: 4 }}>
            🏪 {product.shop.name}
          </div>
        )}

        {/* Delivery badge */}
        <div className="sf-product-delivery-badge sf-badge-quick">
          ⚡ Quick delivery
        </div>

        {/* Price row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="sf-product-price">{fmt.price(displayPrice)}</span>
          {hasDiscount && (
            <>
              <span className="sf-product-price-original">{fmt.price(rawPrice)}</span>
              <span className="sf-product-discount">{discountPct}% off</span>
            </>
          )}
        </div>

        {/* Add to cart / qty control */}
        {qty === 0
          ? (
            <button
              className="sf-add-btn"
              onClick={handleAdd}
              disabled={adding}
              aria-label={`Add ${product.name} to cart`}
            >
              {adding ? '…' : '+ Add'}
            </button>
          )
          : (
            <div className="sf-qty-control" onClick={e => e.preventDefault()}>
              <button className="sf-qty-btn" onClick={handleDecrease} aria-label="Decrease quantity">−</button>
              <span className="sf-qty-value">{qty}</span>
              <button className="sf-qty-btn" onClick={handleIncrease} aria-label="Increase quantity">+</button>
            </div>
          )
        }
      </div>
    </Link>
  );
}
