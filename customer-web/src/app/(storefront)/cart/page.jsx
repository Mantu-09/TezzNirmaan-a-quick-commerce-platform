// ─────────────────────────────────────────────────────────────
// (storefront)/cart/page.jsx — P9-5
//
// Client component — reads cart from localStorage via CartProvider.
// Shows order summary, quantity controls, proceed to checkout.
// ─────────────────────────────────────────────────────────────
'use client';
import Link       from 'next/link';
import Cookies    from 'js-cookie';
import { useCart } from '../components/CartProvider';



const fmt = {
  price: p => `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
};

const DELIVERY_FEE   = 4900;  // ₹49 in paise
const FREE_DELIVERY_ABOVE = 49900; // ₹499 in paise

export default function CartPage() {
  const { cart, itemCount, subtotal, updateItem, removeItem } = useCart();
  // H1: Route logged-in users directly to checkout — skip redundant auth page
  const isLoggedIn    = !!Cookies.get('tn_token');
  const checkoutHref  = isLoggedIn ? '/checkout' : '/auth?redirect=/checkout';

  const deliveryFee    = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  const total          = subtotal + deliveryFee;
  const savings        = cart.reduce((s, i) => {
    if (i.price && i.discounted_price && i.discounted_price < i.price) {
      return s + (i.price - i.discounted_price) * i.quantity;
    }
    return s;
  }, 0);

  if (itemCount === 0) {
    return (
      <div className="sf-wrap">
        <div className="sf-empty" style={{ paddingTop: 80 }}>
          <div className="sf-empty-icon">🛒</div>
          <div className="sf-empty-title">Your cart is empty</div>
          <div className="sf-empty-sub" style={{ marginBottom: 24 }}>
            Add some products to get started.
          </div>
          <Link href="/" className="sf-btn sf-btn-primary">
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sf-wrap">
      <div className="sf-section">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 24 }}>My Cart ({itemCount} items)</h1>

        <div className="sf-cart-layout">
          {/* Items list */}
          <div>
            {cart.map(item => {
              const displayPrice = item.discounted_price || item.price;
              return (
                <div key={item.inventory_id} className="sf-cart-item">
                  {/* Image */}
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} className="sf-cart-item-img" />
                    : <div className="sf-cart-item-img" style={{ background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>📦</div>
                  }

                  <div className="sf-cart-item-body">
                    <div className="sf-cart-item-name">{item.name}</div>
                    <div className="sf-cart-item-meta">
                      {item.unit && <span>{item.unit}</span>}
                    </div>
                    <div className="sf-cart-item-row">
                      {/* Qty control */}
                      <div className="sf-qty-control">
                        <button
                          className="sf-qty-btn"
                          onClick={() => updateItem(item.inventory_id, item.quantity - 1)}
                          aria-label="Decrease"
                        >−</button>
                        <span className="sf-qty-value">{item.quantity}</span>
                        <button
                          className="sf-qty-btn"
                          onClick={() => updateItem(item.inventory_id, item.quantity + 1)}
                          aria-label="Increase"
                        >+</button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="sf-cart-item-price">{fmt.price(displayPrice * item.quantity)}</span>
                        <button
                          className="sf-remove-btn"
                          onClick={() => removeItem(item.inventory_id)}
                          aria-label={`Remove ${item.name}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Continue shopping */}
            <Link href="/" style={{ color: 'var(--sf-primary)', fontSize: '0.875rem', fontWeight: 600, display: 'inline-block', marginTop: 12 }}>
              ← Continue Shopping
            </Link>
          </div>

          {/* Order summary */}
          <div>
            <div className="sf-order-summary">
              <div className="sf-summary-title">Order Summary</div>
              <div className="sf-summary-row">
                <span>Subtotal ({itemCount} items)</span>
                <span>{fmt.price(subtotal)}</span>
              </div>
              <div className="sf-summary-row">
                <span>Delivery fee</span>
                <span style={{ color: deliveryFee === 0 ? 'var(--sf-success)' : 'inherit' }}>
                  {deliveryFee === 0 ? 'FREE' : fmt.price(deliveryFee)}
                </span>
              </div>
              {deliveryFee > 0 && (
                <div className="sf-summary-savings">
                  Add {fmt.price(FREE_DELIVERY_ABOVE - subtotal)} more for free delivery
                </div>
              )}
              {savings > 0 && (
                <div className="sf-summary-savings">You save {fmt.price(savings)} on this order 🎉</div>
              )}
              <div className="sf-summary-row total">
                <span>Total</span>
                <span>{fmt.price(total)}</span>
              </div>
              <div style={{ marginTop: 16 }}>
                <Link href={checkoutHref} className="sf-checkout-btn">
                  Proceed to Checkout →
                </Link>
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--sf-text-3)', textAlign: 'center', marginTop: 12 }}>
                You'll log in with your phone number to complete the order.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
