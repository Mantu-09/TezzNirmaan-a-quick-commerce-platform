// ─────────────────────────────────────────────────────────────
// ProductCard.jsx — P9-5 (Client component — cart interactions)
//
// Reused across Home, Category, and Search pages.
// Handles Add/qty increment/decrement inline without page nav.
// ─────────────────────────────────────────────────────────────
'use client';
import { useState } from 'react';
import Link         from 'next/link';
import { useCart }  from './CartProvider';

const fmt = {
  price: p => `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
};

export default function ProductCard({ product, shopSlug }) {
  const { cart, addItem, updateItem } = useCart();
  const [adding, setAdding] = useState(false);

  const cartItem = cart.find(i => i.inventory_id === product.inventory_id);
  const qty      = cartItem?.quantity || 0;

  const hasDiscount = product.discounted_price && product.discounted_price < product.price;
  const displayPrice = hasDiscount ? product.discounted_price : product.price;
  const discount     = hasDiscount
    ? Math.round((1 - product.discounted_price / product.price) * 100)
    : 0;

  const handleAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    addItem({
      inventory_id:    product.inventory_id,
      product_id:      product.product_id,
      name:            product.name,
      price:           product.price,
      discounted_price: product.discounted_price,
      image_url:       product.image_url,
      unit:            product.unit,
      shop_slug:       shopSlug,
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

  return (
    <Link
      href={`/storefront/product/${product.product_id}`}
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

        {/* Delivery badge */}
        <div className="sf-product-delivery-badge sf-badge-quick">
          ⚡ Quick delivery
        </div>

        {/* Price row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          <span className="sf-product-price">{fmt.price(displayPrice)}</span>
          {hasDiscount && (
            <>
              <span className="sf-product-price-original">{fmt.price(product.price)}</span>
              <span className="sf-product-discount">{discount}% off</span>
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
