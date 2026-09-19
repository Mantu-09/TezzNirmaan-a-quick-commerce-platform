// ─────────────────────────────────────────────────────────────
// ProductDetailClient.jsx — P9-5
// Client island for cart interactions on the product detail page.
// ─────────────────────────────────────────────────────────────
'use client';
import { useState } from 'react';
import Link         from 'next/link';
import { useCart }  from '../../components/CartProvider';
import dynamic      from 'next/dynamic';
const RecommendationsRow = dynamic(() => import('../../components/RecommendationsRow'), { ssr: false }); // P17-1

const fmt = {
  price: p => `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
};

const CATEGORY_EMOJI = {
  construction: '🏗️', paints: '🎨', tiles: '🟫', electrical: '⚡',
  plumbing: '🔧', hardware: '🔩', decor: '🏠', fittings: '🔌',
};

export default function ProductDetailClient({ product }) {
  const { cart, addItem, updateItem } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const cartItem = cart.find(i => i.inventory_id === product.inventory_id);
  const cartQty  = cartItem?.quantity || 0;

  const hasDiscount  = product.discounted_price && product.discounted_price < product.price;
  const displayPrice = hasDiscount ? product.discounted_price : product.price;
  const discount     = hasDiscount ? Math.round((1 - product.discounted_price / product.price) * 100) : 0;
  const totalPrice   = displayPrice * qty;

  const handleAdd = () => {
    addItem({
      inventory_id:     product.inventory_id,
      product_id:       product.product_id,
      name:             product.name,
      price:            product.price,
      discounted_price: product.discounted_price,
      image_url:        product.image_url,
      unit:             product.unit,
      // P10-0: use the actual shop slug from the catalog response, not hardcoded
      shop_slug:        product.shop?.slug || null,
      quantity:         qty,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const specs = (() => {
    try { return typeof product.specifications === 'string' ? JSON.parse(product.specifications) : product.specifications; }
    catch { return null; }
  })();

  return (
    <section className="sf-section" style={{ paddingTop: 16 }}>
      <div className="sf-detail-layout">
        {/* Image */}
        <div className="sf-detail-img-wrap">
          {product.image_url
            ? <img src={product.image_url} alt={product.name} className="sf-detail-img" />
            : <div className="sf-detail-img-placeholder">{CATEGORY_EMOJI[product.category?.toLowerCase()] || '📦'}</div>
          }
        </div>

        {/* Info */}
        <div>
          {product.brand && <div className="sf-detail-brand">{product.brand}</div>}
          <h1 className="sf-detail-name">{product.name}</h1>

          {/* Price */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span className="sf-detail-price">{fmt.price(displayPrice)}</span>
            {hasDiscount && (
              <>
                <span style={{ fontSize: '1rem', color: 'var(--sf-text-3)', textDecoration: 'line-through' }}>{fmt.price(product.price)}</span>
                <span className="sf-product-discount">{discount}% off</span>
              </>
            )}
          </div>
          <div className="sf-detail-price-sub">{product.unit ? `per ${product.unit}` : 'per unit'}</div>

          {/* Delivery */}
          <div className="sf-detail-delivery-row">
            <span>⚡</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--sf-text)', fontSize: '0.875rem' }}>Quick Delivery — 60-90 minutes</div>
              <div style={{ fontSize: '0.75rem', marginTop: 2 }}>Order before 6 PM for same-day delivery</div>
            </div>
          </div>

          {/* Stock */}
          {product.stock_count > 0 && (
            <div className="sf-detail-stock">
              ✓ In stock: {product.stock_count} {product.unit || 'units'}
              {product.shop_name && ` at ${product.shop_name}`}
            </div>
          )}

          {/* Qty selector */}
          <div className="sf-qty-row">
            <span className="sf-qty-label">Quantity:</span>
            <div className="sf-qty-lg sf-qty-control">
              <button className="sf-qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Decrease">−</button>
              <span className="sf-qty-value">{qty}</span>
              <button className="sf-qty-btn" onClick={() => setQty(q => q + 1)} aria-label="Increase">+</button>
            </div>
            {qty > 1 && (
              <div className="sf-detail-total">Total: <strong>{fmt.price(totalPrice)}</strong></div>
            )}
          </div>

          {/* Actions */}
          <div className="sf-detail-actions">
            {cartQty === 0
              ? (
                <button
                  className="sf-add-btn sf-btn-lg"
                  onClick={handleAdd}
                  style={{ flex: 2, height: 52 }}
                >
                  {added ? '✓ Added to Cart!' : '+ Add to Cart'}
                </button>
              )
              : (
                <Link href="/cart" className="sf-checkout-btn sf-btn-lg" style={{ flex: 2 }}>
                  🛒 View Cart ({cartQty} in cart)
                </Link>
              )
            }
            <Link href="/cart" className="sf-btn sf-btn-ghost sf-btn-lg" style={{ flex: 1, justifyContent: 'center' }}>
              Buy Now
            </Link>
          </div>

          {/* Description */}
          {product.description && (
            <>
              <div className="sf-divider" />
              <div className="sf-detail-desc">{product.description}</div>
            </>
          )}

          {/* Specs */}
          {specs && typeof specs === 'object' && Object.keys(specs).length > 0 && (
            <>
              <div className="sf-specs-title">Specifications</div>
              <table className="sf-specs-table">
                <tbody>
                  {Object.entries(specs).map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* P17-1: Similar Items */}
      {product.inventory_id && (
        <div style={{ padding: '0 16px', maxWidth: 700, margin: '0 auto' }}>
          <RecommendationsRow
            title="🔁 Similar Items"
            endpoint={`/api/backend/public/recommendations/similar/${product.inventory_id}`}
          />
        </div>
      )}
    </section>
  );
}
