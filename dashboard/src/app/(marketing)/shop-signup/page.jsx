'use client';
// ────────────────────────────────────────────────────────────
// Shop Pre-Registration Interest Form — P4-1A
//
// Route: /shop-signup (via (marketing) route group)
// No auth required — this is a top-of-funnel marketing page.
//
// On submit → POST /api/v1/public/shop-interest
// On success → shows confirmation with the submitted phone number
// ────────────────────────────────────────────────────────────
import { useState } from 'react';

const CITIES = [
  'Patna',
  'Muzaffarpur',
  'Bhagalpur',
  'Gaya',
  'Darbhanga',
  'Muzaffarpur',
  'Other',
];

const SHOP_TYPES = [
  { id: 'construction', label: '🏗️  Construction Materials' },
  { id: 'paints',       label: '🎨  Paints' },
  { id: 'tiles',        label: '⬛  Tiles' },
  { id: 'electrical',   label: '⚡  Electrical' },
  { id: 'plumbing',     label: '🔧  Plumbing' },
  { id: 'hardware',     label: '🔩  Hardware' },
  { id: 'decor',        label: '🪟  Decor' },
];

const MONTHLY_ORDER_RANGES = [
  'Under 50 orders',
  '50–200 orders',
  '200–500 orders',
  '500+ orders',
  'Not sure yet',
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export default function ShopSignupPage() {
  const [form, setForm]         = useState({
    shopName:      '',
    ownerName:     '',
    phone:         '',
    city:          '',
    shopTypes:     [],
    monthlyOrders: '',
  });
  const [errors,    setErrors]    = useState({});
  const [loading,   setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [apiError,  setApiError]  = useState('');

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: '' }));
  }

  function toggleShopType(id) {
    setForm(f => ({
      ...f,
      shopTypes: f.shopTypes.includes(id)
        ? f.shopTypes.filter(t => t !== id)
        : [...f.shopTypes, id],
    }));
    setErrors(e => ({ ...e, shopTypes: '' }));
  }

  function validate() {
    const errs = {};
    if (!form.shopName.trim())    errs.shopName  = 'Shop name is required.';
    if (!form.ownerName.trim())   errs.ownerName = 'Owner name is required.';
    if (!/^[6-9]\d{9}$/.test(form.phone.trim()))
      errs.phone = 'Enter a valid 10-digit Indian mobile number.';
    if (!form.city)                errs.city      = 'Please select a city.';
    if (form.shopTypes.length === 0)
      errs.shopTypes = 'Select at least one shop type.';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/public/shop-interest`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          shop_name:      form.shopName.trim(),
          owner_name:     form.ownerName.trim(),
          phone:          form.phone.trim(),
          city:           form.city,
          shop_types:     form.shopTypes,
          monthly_orders: form.monthlyOrders || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Something went wrong. Please try again.');
      }
      setSubmitted(true);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* ── NAV ─────────────────────────────────────────────── */}
      <nav className="mkt-nav" aria-label="Site navigation">
        <div className="mkt-container mkt-nav-inner">
          <a href="/" className="mkt-logo" style={{ textDecoration: 'none' }}>
            Tezz<span>Nirmaan</span>
          </a>
          <a href="/" className="mkt-nav-link" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
            ← Back to home
          </a>
        </div>
      </nav>

      {/* ── PAGE BODY ─────────────────────────────────────── */}
      <main className="mkt-signup-page" id="main-content">
        <div className="mkt-container">
          <div className="mkt-signup-inner">

            {submitted ? (
              /* ── SUCCESS STATE ─────────────────────────── */
              <div className="mkt-signup-card">
                <div className="mkt-signup-success">
                  <span className="mkt-signup-success-icon" role="img" aria-label="Party popper">🎉</span>
                  <h1 className="mkt-signup-success-title">You're on the list!</h1>
                  <p className="mkt-signup-success-body">
                    Thanks for your interest in TezzNirmaan. Our team will call you within{' '}
                    <strong>24 hours</strong> at{' '}
                    <span className="mkt-signup-success-phone">{form.phone}</span>.
                    <br /><br />
                    While you wait, share the app with your friends who shop for building materials.
                  </p>
                  <a href="/" className="mkt-btn-primary" style={{ display: 'inline-flex' }}>
                    Back to home
                  </a>
                </div>
              </div>
            ) : (
              /* ── FORM ──────────────────────────────────── */
              <div className="mkt-signup-card">
                <h1 className="mkt-signup-title">List your hardware shop on TezzNirmaan</h1>
                <p className="mkt-signup-sub">
                  Join {8}+ local shops already reaching customers across Patna.
                  Zero commission for the first 6 months. Fill in your details and we'll call you within 24 hours.
                </p>

                {apiError && (
                  <div className="mkt-legal-callout mkt-legal-callout--important" style={{ marginBottom: 20 }}>
                    {apiError}
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate>

                  {/* Shop Name */}
                  <div className="mkt-form-group">
                    <label htmlFor="shopName" className="mkt-form-label">
                      Shop name <span aria-hidden="true" style={{ color: 'var(--tn-orange)' }}>*</span>
                    </label>
                    <input
                      id="shopName"
                      type="text"
                      className={`mkt-form-input${errors.shopName ? ' mkt-form-input--error' : ''}`}
                      placeholder="e.g. Sharma Hardware & Paints"
                      value={form.shopName}
                      onChange={e => set('shopName', e.target.value)}
                      autoComplete="organization"
                    />
                    {errors.shopName && <p className="mkt-form-error">{errors.shopName}</p>}
                  </div>

                  {/* Owner Name */}
                  <div className="mkt-form-group">
                    <label htmlFor="ownerName" className="mkt-form-label">
                      Owner / contact name <span aria-hidden="true" style={{ color: 'var(--tn-orange)' }}>*</span>
                    </label>
                    <input
                      id="ownerName"
                      type="text"
                      className={`mkt-form-input${errors.ownerName ? ' mkt-form-input--error' : ''}`}
                      placeholder="Your full name"
                      value={form.ownerName}
                      onChange={e => set('ownerName', e.target.value)}
                      autoComplete="name"
                    />
                    {errors.ownerName && <p className="mkt-form-error">{errors.ownerName}</p>}
                  </div>

                  {/* Phone */}
                  <div className="mkt-form-group">
                    <label htmlFor="phone" className="mkt-form-label">
                      Mobile number <span aria-hidden="true" style={{ color: 'var(--tn-orange)' }}>*</span>
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      className={`mkt-form-input${errors.phone ? ' mkt-form-input--error' : ''}`}
                      placeholder="10-digit mobile number"
                      value={form.phone}
                      onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      autoComplete="tel-national"
                      inputMode="numeric"
                      maxLength={10}
                    />
                    {errors.phone && <p className="mkt-form-error">{errors.phone}</p>}
                  </div>

                  {/* City */}
                  <div className="mkt-form-group">
                    <label htmlFor="city" className="mkt-form-label">
                      City <span aria-hidden="true" style={{ color: 'var(--tn-orange)' }}>*</span>
                    </label>
                    <select
                      id="city"
                      className={`mkt-form-select${errors.city ? ' mkt-form-input--error' : ''}`}
                      value={form.city}
                      onChange={e => set('city', e.target.value)}
                    >
                      <option value="">Select your city</option>
                      {CITIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {errors.city && <p className="mkt-form-error">{errors.city}</p>}
                  </div>

                  {/* Shop Types */}
                  <div className="mkt-form-group">
                    <p className="mkt-form-label" id="shop-types-label">
                      What do you sell? <span aria-hidden="true" style={{ color: 'var(--tn-orange)' }}>*</span>
                      <span style={{ fontWeight: 400, color: 'var(--tn-muted)', marginLeft: 6 }}>(select all that apply)</span>
                    </p>
                    <div
                      className="mkt-form-checkbox-group"
                      role="group"
                      aria-labelledby="shop-types-label"
                    >
                      {SHOP_TYPES.map(({ id, label }) => (
                        <label key={id} className="mkt-form-checkbox-item" htmlFor={`type-${id}`}>
                          <input
                            id={`type-${id}`}
                            type="checkbox"
                            checked={form.shopTypes.includes(id)}
                            onChange={() => toggleShopType(id)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {errors.shopTypes && <p className="mkt-form-error">{errors.shopTypes}</p>}
                  </div>

                  {/* Monthly Orders */}
                  <div className="mkt-form-group">
                    <label htmlFor="monthlyOrders" className="mkt-form-label">
                      Approximate monthly orders
                      <span style={{ fontWeight: 400, color: 'var(--tn-muted)', marginLeft: 6 }}>(optional)</span>
                    </label>
                    <select
                      id="monthlyOrders"
                      className="mkt-form-select"
                      value={form.monthlyOrders}
                      onChange={e => set('monthlyOrders', e.target.value)}
                    >
                      <option value="">Select a range</option>
                      {MONTHLY_ORDER_RANGES.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="mkt-form-submit"
                    id="shop-signup-submit-btn"
                    disabled={loading}
                  >
                    {loading ? 'Submitting…' : 'Register my shop →'}
                  </button>

                  <p style={{ fontSize: 12, color: 'var(--tn-muted)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
                    By submitting, you agree to our{' '}
                    <a href="/terms" className="mkt-legal-link" style={{ fontSize: 12 }}>Terms of Service</a>
                    {' '}and{' '}
                    <a href="/privacy" className="mkt-legal-link" style={{ fontSize: 12 }}>Privacy Policy</a>.
                    We will call you — we will not spam you.
                  </p>

                </form>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer className="mkt-footer" aria-label="Site footer">
        <div className="mkt-container">
          <div className="mkt-footer-bottom">
            <div className="mkt-footer-copy">
              © {new Date().getFullYear()} TezzNirmaan. All rights reserved.
            </div>
            <div className="mkt-footer-links" style={{ display: 'flex', gap: '20px' }}>
              <a href="/privacy" className="mkt-footer-link">Privacy Policy</a>
              <a href="/terms"   className="mkt-footer-link">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
