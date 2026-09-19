// ─────────────────────────────────────────────────────────────
// (storefront)/checkout/page.jsx — P10-2
//
// NOTE: 'use client' must be at the top — metadata is handled by
// the storefront layout (title template: '%s | TezzNirmaan').
// This page is dynamically rendered (ƒ) — never statically cached.
// ─────────────────────────────────────────────────────────────
'use client';
import React, { useEffect, useState } from 'react';
import { useCart }             from '../components/CartProvider';
import { useRouter }           from 'next/navigation';
import Link                    from 'next/link';
import Cookies                 from 'js-cookie';
import AddressAutocomplete     from '../components/AddressAutocomplete'; // P13-3


// ── Helpers ──────────────────────────────────────────────────
const fmt = (paise) => `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;

function getToken() {
  return Cookies.get('tn_token') || null;
}

// ── AddressCard ───────────────────────────────────────────────
function AddressCard({ addr, selected, onSelect }) {
  return (
    <div
      className={`sf-addr-card${selected ? ' selected' : ''}`}
      onClick={() => onSelect(addr)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(addr)}
      aria-pressed={selected}
    >
      <div className="sf-addr-radio">
        <div className={`sf-radio-dot${selected ? ' active' : ''}`} />
      </div>
      <div className="sf-addr-body">
        <div className="sf-addr-label">{addr.label || 'Home'}</div>
        <div className="sf-addr-name">{addr.full_name}</div>
        <div className="sf-addr-line">{addr.address_line1}</div>
        <div className="sf-addr-line">{addr.city}{addr.pincode ? ` — ${addr.pincode}` : ''}</div>
        <div className="sf-addr-phone">📞 {addr.phone}</div>
      </div>
    </div>
  );
}

// ── AddressForm — inline new-address form ─────────────────────
function AddressForm({ onSave, onCancel, token }) {
  const [form,    setForm]    = useState({ full_name: '', phone: '', address_line1: '', city: '', pincode: '', label: 'Home', lat: null, lng: null, place_id: null });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Called by AddressAutocomplete when user picks a suggestion
  const handlePlaceSelect = (place) => {
    setForm(f => ({
      ...f,
      address_line1: place.address_line1 || f.address_line1,
      city:          place.city          || f.city,
      pincode:       place.pincode       || f.pincode,
      lat:           place.lat           || null,
      lng:           place.lng           || null,
      place_id:      place.place_id      || null,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.phone || !form.address_line1 || !form.city) {
      setError('Please fill in all required fields');
      return;
    }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/backend/customer/addresses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Could not save address');
      onSave(json.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="sf-addr-form" onSubmit={handleSave}>
      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: 16 }}>Add New Address</h3>
      <div className="sf-addr-form-grid">
        <div className="sf-field">
          <label className="sf-label">Full Name *</label>
          <input className="sf-input" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Ramesh Kumar" />
        </div>
        <div className="sf-field">
          <label className="sf-label">Mobile *</label>
          <input className="sf-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" inputMode="numeric" />
        </div>
        <div className="sf-field sf-field-full">
          <label className="sf-label">Address Line * {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && <span style={{ fontSize: 11, color: 'var(--sf-primary)' }}>📍 Start typing for suggestions</span>}</label>
          {/* P13-3: Google Places autocomplete — falls back to plain input if no key */}
          <AddressAutocomplete
            value={form.address_line1}
            onChange={(v) => set('address_line1', v)}
            onSelect={handlePlaceSelect}
            placeholder="House No, Street, Area"
          />
        </div>
        <div className="sf-field">
          <label className="sf-label">City *</label>
          <input className="sf-input" value={form.city} onChange={e => set('city', e.target.value)} placeholder="Patna" />
        </div>
        <div className="sf-field">
          <label className="sf-label">Pincode</label>
          <input className="sf-input" value={form.pincode} onChange={e => set('pincode', e.target.value)} placeholder="800001" inputMode="numeric" />
        </div>
        <div className="sf-field">
          <label className="sf-label">Label</label>
          <select className="sf-input" value={form.label} onChange={e => set('label', e.target.value)}>
            <option>Home</option>
            <option>Work</option>
            <option>Site</option>
            <option>Other</option>
          </select>
        </div>
      </div>
      {error && <p className="sf-form-error">{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button type="submit" className="sf-submit-btn" style={{ flex: 1 }} disabled={saving}>
          {saving ? 'Saving…' : 'Save Address'}
        </button>
        <button type="button" className="sf-btn sf-btn-ghost" onClick={onCancel} style={{ flex: 1 }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── P20: First-Order Welcome Banner ───────────────────────────
// Checks if logged-in user has never ordered — shows WELCOME10 notice
function FirstOrderBanner({ token }) {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    if (!token) return;
    fetch('/api/backend/customer/orders?limit=1', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => {
        const count = json.data?.total || json.data?.orders?.length || 0;
        if (count === 0) setShow(true);
      })
      .catch(() => {});
  }, [token]);
  if (!show) return null;
  return (
    <div style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '1.5px solid #f59e0b', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 22 }}>🎁</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 13, color: '#92400e' }}>First order? 10% off auto-applied!</div>
        <div style={{ fontSize: 12, color: '#78350f', marginTop: 2 }}>Up to ₹100 discount — no code needed. Just place your order!</div>
      </div>
    </div>
  );
}

// ── Main Checkout Page ─────────────────────────────────────────
export default function CheckoutPage() {
  const { cart, subtotal, clearCart } = useCart();
  const router                        = useRouter();
  const token                         = getToken();

  const [addresses,     setAddresses]     = useState([]);
  const [selectedAddr,  setSelectedAddr]  = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('razorpay');
  const [placing,       setPlacing]       = useState(false);
  const [error,         setError]         = useState('');
  const [addrLoading,   setAddrLoading]   = useState(true);
  const [showAddrForm,  setShowAddrForm]  = useState(false);

  // P12-4: Promo code state
  const [promoCode,     setPromoCode]     = useState('');
  const [promoApplied,  setPromoApplied]  = useState(null); // { code, discount_paise, description }
  const [promoLoading,  setPromoLoading]  = useState(false);
  const [promoError,    setPromoError]    = useState('');

  // P12-4: Wallet pay state
  const [walletBalance, setWalletBalance] = useState(0);  // in paise
  const [useWallet,     setUseWallet]     = useState(false);

  // H2: Delivery fee from API (dynamic per zone) — fallback to ₹49 flat until address is resolved
  const [deliveryFee,   setDeliveryFee]   = useState(4900);
  const FREE_DELIVERY_ABOVE = 49900;
  const promoDiscount  = promoApplied?.discount_paise || 0;
  const walletDeducted = useWallet ? Math.min(walletBalance, subtotal + deliveryFee - promoDiscount) : 0;
  const total          = Math.max(0, subtotal + deliveryFee - promoDiscount - walletDeducted);

  // ── Guard: redirect if not logged in ──────────────────────
  useEffect(() => {
    if (!token) {
      router.replace('/auth?redirect=/checkout');
    }
  }, [token, router]);

  // ── Guard: redirect if cart is empty ──────────────────────
  useEffect(() => {
    if (cart.length === 0 && !placing) {
      router.replace('/cart');
    }
  }, [cart, placing, router]);

  // ── Fetch saved addresses ──────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      setAddrLoading(true);
      try {
        const res  = await fetch('/api/backend/customer/addresses', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        const list = json.data?.addresses || json.data || [];
        setAddresses(list);
        if (list.length > 0) setSelectedAddr(list[0]);
      } catch {
        setError('Could not load saved addresses.');
      } finally {
        setAddrLoading(false);
      }
    })();
  }, [token]);

  // ── P11-0 Fix 3: Show warning if cart sync failed after login ─
  useEffect(() => {
    if (sessionStorage.getItem('cart_sync_failed')) {
      sessionStorage.removeItem('cart_sync_failed');
      setError('We could not sync your cart after login. Please re-add your items.');
    }
  }, []);

  // ── P12-4: Fetch wallet balance ────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch('/api/backend/customer/wallet', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => setWalletBalance(json.data?.balance_paise || json.balance_paise || 0))
      .catch(() => {}); // Non-fatal — wallet section just stays hidden if fetch fails
  }, [token]);

  // ── P18-2: COD zone validation + P18-3: Saved cards ──────
  const [codEnabled,    setCodEnabled]    = useState(true);
  const [codLimitPaise, setCodLimitPaise] = useState(null); // null = unlimited
  const [codLimitLabel, setCodLimitLabel] = useState('');
  const [savedCards,    setSavedCards]    = useState([]);

  // H2+C2: Fetch delivery zone info (COD rules + dynamic delivery fee) when address is selected
  useEffect(() => {
    if (!selectedAddr) return;
    // C2: addresses may lack city_id (text city column) — try city_id first, fall back to city name param
    const cityId   = selectedAddr.city_id;
    const cityName = selectedAddr.city;
    const url = cityId
      ? `/api/backend/public/delivery-fee?city_id=${cityId}`
      : cityName
        ? `/api/backend/public/delivery-fee?city_name=${encodeURIComponent(cityName)}`
        : null;
    if (!url) return;
    fetch(url)
      .then(r => r.json())
      .then(json => {
        const d = json.data || {};
        // H2: Update the displayed delivery fee from API (dynamic per zone)
        if (d.fee_paise !== undefined) {
          setDeliveryFee(subtotal >= FREE_DELIVERY_ABOVE ? 0 : d.fee_paise);
        }
        setCodEnabled(d.cod_enabled !== false);
        setCodLimitPaise(d.cod_limit_paise ?? null);
        setCodLimitLabel(d.cod_limit_label || '');
        // If COD was selected but now unavailable, switch to razorpay
        if (d.cod_enabled === false && paymentMethod === 'cod') {
          setPaymentMethod('razorpay');
        }
      })
      .catch(() => {});
  }, [selectedAddr, subtotal]);

  // Fetch saved cards
  useEffect(() => {
    if (!token) return;
    fetch('/api/backend/payments/saved-cards', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => setSavedCards(json.data?.cards || []))
      .catch(() => {});
  }, [token]);

  // COD limit exceeded check
  const codLimitExceeded = codLimitPaise !== null && total > codLimitPaise;

  // ── P12-4: Apply promo code ────────────────────────────────
  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true); setPromoError(''); setPromoApplied(null);
    try {
      const res  = await fetch('/api/backend/customer/promos/validate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ code: promoCode.trim().toUpperCase(), order_value_paise: subtotal }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Invalid promo code');
      setPromoApplied({
        code:           promoCode.trim().toUpperCase(),
        discount_paise: json.data?.discount_paise || 0,
        description:    json.data?.description    || `${promoCode.toUpperCase()} applied`,
      });
    } catch (err) {
      setPromoError(err.message);
    } finally {
      setPromoLoading(false);
    }
  };

  // ── Handle new address saved ───────────────────────────────
  const handleAddressSaved = (newAddr) => {
    const addr = newAddr?.address || newAddr;
    setAddresses(prev => [addr, ...prev]);
    setSelectedAddr(addr);
    setShowAddrForm(false);
  };

  // ── Load Razorpay SDK (if needed) ─────────────────────────
  const loadRazorpay = () =>
    new Promise((resolve) => {
      if (window.Razorpay) { resolve(true); return; }
      const script    = document.createElement('script');
      script.src      = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload   = () => resolve(true);
      script.onerror  = () => resolve(false);
      document.body.appendChild(script);
    });

  // ── Place Order ────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (!selectedAddr) { setError('Please select a delivery address'); return; }
    if (cart.length === 0)  { setError('Your cart is empty'); return; }

    // P18-2: COD zone validation
    if (paymentMethod === 'cod') {
      if (!codEnabled) { setError('Cash on Delivery is not available in your area. Please pay online.'); return; }
      if (codLimitExceeded) { setError(`COD limit is ${codLimitLabel} for your area. Please pay online for this order.`); return; }
    }

    setPlacing(true);
    setError('');

    try {
      // Map web payment method → backend paymentMethod values (controller uses camelCase)
      // Razorpay handles all online methods (card, net banking, UPI) — use single 'razorpay' enum.
      // P11-0 Fix 1: was hardcoding 'upi' for all online payments, corrupting payment analytics.
      const backendPaymentMethod = paymentMethod === 'cod' ? 'cod' : 'razorpay';

      // CRITICAL: backend controller destructures addressId + paymentMethod (camelCase)
      const orderRes = await fetch('/api/backend/customer/orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          addressId:     selectedAddr.id,       // camelCase — matches req.body.addressId
          paymentMethod: backendPaymentMethod,  // camelCase — matches req.body.paymentMethod
        }),
      });

      const orderJson = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(orderJson.message || orderJson.error?.message || 'Order placement failed');
      }

      const result = orderJson.data;

      // ── COD path ─────────────────────────────────────────
      if (paymentMethod === 'cod') {
        clearCart();
        // H5: pass discount savings + loyalty stamp flag for confirmation page
        const savedPaise = promoApplied?.discount_paise || 0;
        const params = new URLSearchParams({ num: result.orderNumber });
        if (savedPaise > 0)  params.set('saved', String(savedPaise));
        params.set('stamp', '1'); // always show stamp card — stamp auto-awarded on delivery
        router.push(`/order-confirmed?${params.toString()}`);
        return;
      }

      // ── Razorpay web payment path ─────────────────────────
      if (!result.razorpayOrderId) {
        // Razorpay order creation may have failed server-side (non-fatal)
        throw new Error('Payment gateway unavailable. Please try COD or retry.');
      }

      const sdkLoaded = await loadRazorpay();
      if (!sdkLoaded) throw new Error('Could not load payment SDK. Check your connection.');

      await new Promise((resolve, reject) => {
        const options = {
          key:         result.razorpayKeyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount:      result.totalPaise,
          currency:    'INR',
          name:        'TezzNirmaan',
          description: 'Hardware & Construction Materials',
          order_id:    result.razorpayOrderId,
          prefill: {
            contact: selectedAddr.phone || '',
            name:    selectedAddr.full_name || '',
          },
          theme: { color: '#E8521A' },
          handler: async (rzpResponse) => {
            try {
              // Verify payment signature server-side
              const verifyRes = await fetch('/api/backend/payments/verify', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body:    JSON.stringify({
                  razorpay_order_id:   rzpResponse.razorpay_order_id,
                  razorpay_payment_id: rzpResponse.razorpay_payment_id,
                  razorpay_signature:  rzpResponse.razorpay_signature,
                  order_id:            result.orderId,
                }),
              });
              const verifyJson = await verifyRes.json();
              if (!verifyRes.ok) throw new Error(verifyJson.message || 'Payment verification failed');
              clearCart();
              const savedPaise2 = promoApplied?.discount_paise || 0;
              const rzpParams   = new URLSearchParams({ num: result.orderNumber, stamp: '1' });
              if (savedPaise2 > 0) rzpParams.set('saved', String(savedPaise2));
              router.push(`/order-confirmed?${rzpParams.toString()}`);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          modal: {
            ondismiss: () => {
              // User closed modal — order is created but unpaid.
              // Redirect to a "payment pending" state on confirmation page.
              setPlacing(false);
              reject(new Error('Payment cancelled. Your order is saved — you can retry payment.'));
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (resp) => {
          reject(new Error(resp.error?.description || 'Payment failed'));
        });
        rzp.open();
      });

    } catch (err) {
      setError(err.message);
      setPlacing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────
  if (!token) return null; // redirect in useEffect

  return (
    <div className="sf-wrap">
      <div className="sf-section">
        {/* Breadcrumb */}
        <div className="sf-breadcrumb" style={{ marginBottom: 24 }}>
          <Link href="/">Home</Link>
          <span className="sf-breadcrumb-sep">›</span>
          <Link href="/cart">Cart</Link>
          <span className="sf-breadcrumb-sep">›</span>
          <span>Checkout</span>
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 28 }}>Checkout</h1>

        <div className="sf-checkout-layout">

          {/* ── LEFT: Address + Payment ─────────────────────── */}
          <div className="sf-checkout-left">

            {/* Address section */}
            <div className="sf-checkout-block">
              <div className="sf-checkout-block-header">
                <span className="sf-step-badge">1</span>
                <h2 className="sf-checkout-section-title">Delivery Address</h2>
              </div>

              {addrLoading ? (
                <div className="sf-addr-skeleton">
                  <div className="sf-skeleton" style={{ height: 90, borderRadius: 10, marginBottom: 10 }} />
                  <div className="sf-skeleton" style={{ height: 90, borderRadius: 10 }} />
                </div>
              ) : showAddrForm ? (
                <AddressForm token={token} onSave={handleAddressSaved} onCancel={() => setShowAddrForm(false)} />
              ) : (
                <>
                  {addresses.length === 0 ? (
                    <div className="sf-no-addr">
                      <span>📍</span> No saved addresses
                    </div>
                  ) : (
                    <div className="sf-addr-list">
                      {addresses.map(addr => (
                        <AddressCard
                          key={addr.id}
                          addr={addr}
                          selected={selectedAddr?.id === addr.id}
                          onSelect={setSelectedAddr}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    className="sf-add-addr-btn"
                    onClick={() => setShowAddrForm(true)}
                    type="button"
                  >
                    + Add New Address
                  </button>
                </>
              )}
            </div>

            {/* Payment section */}
            <div className="sf-checkout-block">
              <div className="sf-checkout-block-header">
                <span className="sf-step-badge">2</span>
                <h2 className="sf-checkout-section-title">Payment Method</h2>
              </div>

              <div className="sf-payment-options">
                <label className={`sf-payment-option${paymentMethod === 'razorpay' ? ' active' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    value="razorpay"
                    checked={paymentMethod === 'razorpay'}
                    onChange={() => setPaymentMethod('razorpay')}
                  />
                  <span className="sf-payment-icon">🏦</span>
                  <div>
                    <div className="sf-payment-name">UPI / Card / Net Banking</div>
                    <div className="sf-payment-sub">Razorpay — secure online payment</div>
                  </div>
                  <span className="sf-payment-badge">Recommended</span>
                </label>

                <label className={`sf-payment-option${paymentMethod === 'cod' ? ' active' : ''}`}>
                  <input
                    type="radio"
                    name="payment"
                    value="cod"
                    checked={paymentMethod === 'cod'}
                    onChange={() => setPaymentMethod('cod')}
                  />
                  <span className="sf-payment-icon">💵</span>
                  <div>
                    <div className="sf-payment-name">Cash on Delivery</div>
                    <div className="sf-payment-sub">Pay when your order arrives</div>
                    {/* P18-2: COD zone restrictions */}
                    {!codEnabled && (
                      <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>❌ Not available in your area</div>
                    )}
                    {codEnabled && codLimitExceeded && (
                      <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>❌ Limit {codLimitLabel} exceeded for this zone</div>
                    )}
                    {codEnabled && codLimitPaise && !codLimitExceeded && (
                      <div style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>✓ COD available up to {codLimitLabel}</div>
                    )}
                  </div>
                </label>

                {/* P18-3: Saved Cards */}
                {savedCards.length > 0 && savedCards.map(card => (
                  <label key={card.id} className={`sf-payment-option${paymentMethod === `saved_${card.id}` ? ' active' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value={`saved_${card.id}`}
                      checked={paymentMethod === `saved_${card.id}`}
                      onChange={() => setPaymentMethod(`saved_${card.id}`)}
                    />
                    <span className="sf-payment-icon">💳</span>
                    <div>
                      <div className="sf-payment-name">{card.card_network || 'Card'} •••• {card.last4 || '****'}</div>
                      <div className="sf-payment-sub">Saved card · {card.card_name || ''}</div>
                    </div>
                    <span className="sf-payment-badge" style={{ background: '#eff6ff', color: '#1d4ed8' }}>Saved</span>
                  </label>
                ))}
              </div>

              {paymentMethod === 'razorpay' && (
                <p className="sf-payment-note">
                  🔒 Payments are secured by Razorpay. UPI, Debit/Credit card, and Net Banking accepted.
                </p>
              )}
            </div>
          </div>

          {/* ── RIGHT: Order summary + CTA ──────────────────── */}
          <div className="sf-checkout-right">
            <div className="sf-order-summary" style={{ position: 'sticky', top: 76 }}>
              <div className="sf-summary-title">Order Summary</div>

              {/* Item list (scrollable if many) */}
              <div className="sf-checkout-items">
                {cart.map(item => {
                  const displayPrice = item.discounted_price || item.price || 0;
                  return (
                    <div key={item.inventory_id} className="sf-checkout-item">
                      <span className="sf-checkout-item-name">
                        {item.name}
                        <span className="sf-checkout-item-qty"> × {item.quantity}</span>
                      </span>
                      <span className="sf-checkout-item-price">
                        {fmt(displayPrice * item.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="sf-divider" />

              {/* P19-4 / P20: First-order welcome discount notice */}
              {!promoApplied && (
                <FirstOrderBanner token={token} />
              )}

              {/* P12-4: Promo code input */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sf-text-2,#6b7280)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Promo Code
                </div>
                {promoApplied ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: '#dcfce7', border: '1px solid #86efac' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
                      🎉 {promoApplied.code} — {promoApplied.description}
                    </div>
                    <button onClick={() => { setPromoApplied(null); setPromoCode(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#166534', lineHeight: 1 }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={promoCode}
                      onChange={e => setPromoCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && applyPromo()}
                      placeholder="PROMO CODE"
                      style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--sf-border,#e5e7eb)', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, background: 'var(--sf-bg,#f9fafb)', outline: 'none' }}
                    />
                    <button onClick={applyPromo} disabled={promoLoading || !promoCode.trim()}
                      style={{ padding: '9px 16px', borderRadius: 10, background: 'var(--sf-primary,#f97316)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: promoLoading ? 0.7 : 1 }}>
                      {promoLoading ? '…' : 'Apply'}
                    </button>
                  </div>
                )}
                {promoError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{promoError}</div>}
              </div>

              {/* P12-4: Wallet pay toggle */}
              {walletBalance > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: useWallet ? 'var(--sf-primary-lt,#fff1ec)' : 'var(--sf-bg,#f9fafb)', border: `1px solid ${useWallet ? 'var(--sf-primary,#f97316)' : 'var(--sf-border,#e5e7eb)'}`, marginBottom: 14, cursor: 'pointer' }}
                  onClick={() => setUseWallet(v => !v)}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: useWallet ? 'var(--sf-primary,#f97316)' : 'var(--sf-text,#111827)' }}>
                      💰 Wallet Pay {useWallet ? 'ON' : 'OFF'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--sf-text-2,#9ca3af)', marginTop: 2 }}>
                      Balance: ₹{Math.round(walletBalance / 100).toLocaleString('en-IN')}
                      {useWallet && ` · Using ₹${Math.round(walletDeducted / 100).toLocaleString('en-IN')}`}
                    </div>
                  </div>
                  <div style={{ width: 36, height: 20, borderRadius: 10, background: useWallet ? 'var(--sf-primary,#f97316)' : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}>
                    <div style={{ position: 'absolute', top: 2, left: useWallet ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </div>
              )}

              <div className="sf-summary-row">
                <span>Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              <div className="sf-summary-row">
                <span>Delivery</span>
                <span style={{ color: deliveryFee === 0 ? 'var(--sf-success)' : 'inherit' }}>
                  {deliveryFee === 0 ? 'FREE' : fmt(deliveryFee)}
                </span>
              </div>
              {promoDiscount > 0 && (
                <div className="sf-summary-row" style={{ color: '#16a34a' }}>
                  <span>Promo ({promoApplied.code})</span>
                  <span>−{fmt(promoDiscount)}</span>
                </div>
              )}
              {walletDeducted > 0 && (
                <div className="sf-summary-row" style={{ color: 'var(--sf-primary,#f97316)' }}>
                  <span>💰 Wallet</span>
                  <span>−{fmt(walletDeducted)}</span>
                </div>
              )}
              <div className="sf-summary-row total">
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>
              {(promoDiscount + walletDeducted) > 0 && (
                <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, textAlign: 'center', marginTop: 4 }}>
                  🎉 You save {fmt(promoDiscount + walletDeducted)} on this order!
                </div>
              )}

              {error && (
                <div className="sf-checkout-error" role="alert">
                  ⚠️ {error}
                </div>
              )}

              <button
                id="checkout-place-order-btn"
                className="sf-checkout-btn"
                style={{ marginTop: 20, fontSize: '1rem', padding: '16px', opacity: placing ? 0.7 : 1 }}
                onClick={handlePlaceOrder}
                disabled={placing || !selectedAddr || cart.length === 0}
                type="button"
              >
                {placing
                  ? <><span className="sf-spinner" /> Processing…</>
                  : paymentMethod === 'cod'
                    ? `Place Order — ${fmt(total)}`
                    : `Pay ${fmt(total)} →`
                }
              </button>

              <p className="sf-auth-hint" style={{ marginTop: 12 }}>
                By placing your order you agree to our{' '}
                <a href="/terms" style={{ color: 'var(--sf-primary)' }}>Terms</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
