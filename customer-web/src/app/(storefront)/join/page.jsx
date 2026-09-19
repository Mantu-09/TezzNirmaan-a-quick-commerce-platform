// (storefront)/join/page.jsx — P13-6
// Public shop onboarding page — new shops apply here.
'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function JoinPage() {
  const [form, setForm] = useState({
    shop_name: '', owner_name: '', phone: '', city: 'Patna',
    shop_types: [], monthly_orders: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [error,      setError]      = useState('');

  const SHOP_TYPES = [
    { value: 'construction', label: '🏗️ Construction Materials' },
    { value: 'paints',       label: '🎨 Paints & Primers' },
    { value: 'tiles',        label: '🟫 Tiles & Flooring' },
    { value: 'electrical',   label: '⚡ Electrical Supplies' },
    { value: 'plumbing',     label: '🔧 Plumbing Materials' },
    { value: 'hardware',     label: '🔩 Hardware & Tools' },
    { value: 'decor',        label: '🏠 Home Décor' },
  ];

  const CITIES = ['Patna', 'Muzaffarpur', 'Bhagalpur', 'Gaya'];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleType = (type) => {
    setForm(f => ({
      ...f,
      shop_types: f.shop_types.includes(type)
        ? f.shop_types.filter(t => t !== type)
        : [...f.shop_types, type],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.shop_name || !form.owner_name || !form.phone || !form.city || form.shop_types.length === 0) {
      setError('Please fill in all required fields and select at least one shop type.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(form.phone)) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setSubmitting(true); setError('');
    try {
      const res  = await fetch('/api/backend/public/shop-interest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, city: form.city }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Submission failed');
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="sf-wrap">
        <div className="sf-section" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>Application Received!</h1>
          <p style={{ color: 'var(--sf-text-3)', marginBottom: 24 }}>
            Our team will call you within 24 hours to discuss onboarding.
            We look forward to growing together!
          </p>
          <Link href="/" className="sf-checkout-btn" style={{ display: 'inline-block' }}>← Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sf-wrap">
      <div className="sf-section" style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: 8 }}>Partner With TezzNirmaan</h1>
          <p style={{ color: 'var(--sf-text-3)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            Join Bihar's fastest-growing hardware delivery platform. 
            Reach customers across Patna, Muzaffarpur, Bhagalpur & Gaya.
          </p>
        </div>

        {/* Benefits */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 40 }}>
          {[
            { icon: '📦', title: 'More Orders', desc: 'Get 50–200 orders/month from our existing customer base' },
            { icon: '💸', title: 'Low Commission', desc: 'Only 8–15% commission — no upfront fees or setup charges' },
            { icon: '⚡', title: '60-min Delivery', desc: 'We handle riders & logistics — you focus on fulfillment' },
            { icon: '💰', title: 'Weekly Payouts', desc: 'Payments settled every Tuesday directly to your bank' },
          ].map(b => (
            <div key={b.title} style={{ padding: 16, borderRadius: 12, border: '1px solid var(--sf-border)', background: 'var(--sf-bg)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{b.icon}</div>
              <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>{b.title}</div>
              <div style={{ fontSize: 12, color: 'var(--sf-text-3)', lineHeight: 1.5 }}>{b.desc}</div>
            </div>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ background: 'var(--sf-bg)', borderRadius: 16, padding: 28, border: '1px solid var(--sf-border)' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: 20 }}>Apply Now</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label className="sf-label">Shop Name *</label>
              <input className="sf-input" value={form.shop_name} onChange={e => set('shop_name', e.target.value)} placeholder="Ravi Hardware Store" />
            </div>
            <div>
              <label className="sf-label">Owner Name *</label>
              <input className="sf-input" value={form.owner_name} onChange={e => set('owner_name', e.target.value)} placeholder="Ravi Kumar" />
            </div>
            <div>
              <label className="sf-label">Mobile Number *</label>
              <input className="sf-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" inputMode="numeric" maxLength={10} />
            </div>
            <div>
              <label className="sf-label">City *</label>
              <select className="sf-input" value={form.city} onChange={e => set('city', e.target.value)}>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="sf-label">Shop Categories * (select all that apply)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginTop: 8 }}>
              {SHOP_TYPES.map(t => (
                <label key={t.value} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                  borderRadius: 10, border: `1.5px solid ${form.shop_types.includes(t.value) ? 'var(--sf-primary)' : 'var(--sf-border)'}`,
                  background: form.shop_types.includes(t.value) ? 'var(--sf-primary-lt, #fff1ec)' : 'transparent',
                  cursor: 'pointer', fontSize: 13,
                }}>
                  <input type="checkbox" style={{ display: 'none' }} checked={form.shop_types.includes(t.value)} onChange={() => toggleType(t.value)} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="sf-label">Current Monthly Orders (approximate)</label>
            <select className="sf-input" value={form.monthly_orders} onChange={e => set('monthly_orders', e.target.value)}>
              <option value="">Select range</option>
              <option>Less than 50</option>
              <option>50–200</option>
              <option>200–500</option>
              <option>500+</option>
            </select>
          </div>

          {error && <div className="sf-checkout-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

          <button type="submit" className="sf-checkout-btn" style={{ width: '100%', fontSize: '1rem', padding: 16 }} disabled={submitting}>
            {submitting ? '⏳ Submitting…' : 'Submit Application →'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--sf-text-3)', marginTop: 12 }}>
            We will call you within 24 hours. No spam, ever.
          </p>
        </form>
      </div>
    </div>
  );
}
