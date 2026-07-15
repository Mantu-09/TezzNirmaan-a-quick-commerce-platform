'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../../lib/api';

const VEHICLE_TYPES = [
  { value: 'bike', label: '🏍️ Bike' },
  { value: 'scooter', label: '🛵 Scooter' },
  { value: 'cycle', label: '🚲 Cycle' },
  { value: 'tempo', label: '🚐 Tempo' },
  { value: 'other', label: '🚗 Other' },
];

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  fontSize: 14,
  background: 'var(--surface)',
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  fontFamily: 'var(--font)',
};

const errorInputStyle = {
  ...inputStyle,
  border: '1px solid var(--error)',
};

function FormSection({ title, children, icon }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 'var(--s5)',
      }}
    >
      <div
        style={{
          padding: 'var(--s4) var(--s6)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.2px' }}>
          {title}
        </h2>
      </div>
      <div style={{ padding: 'var(--s6)' }}>{children}</div>
    </div>
  );
}

function FormField({ label, required, error, children, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: error ? 'var(--error)' : 'var(--text-2)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--error)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && !error && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: 'var(--error)' }}>{error}</span>}
    </div>
  );
}

export default function NewRiderPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    vehicle_type: 'bike',
    vehicle_number: '',
    shop_ids: [],
  });
  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(null);
  const [focusedField, setFocusedField] = useState(null);
  const [shopSearch, setShopSearch] = useState('');

  useEffect(() => {
    fetchShops();
  }, []);

  async function fetchShops() {
    try {
      const data = await api.get('/admin/shops');
      setShops(Array.isArray(data) ? data : data.shops || []);
    } catch (err) {
      console.error('Failed to load shops:', err);
    } finally {
      setShopsLoading(false);
    }
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  }

  function toggleShop(shopId) {
    setForm((f) => ({
      ...f,
      shop_ids: f.shop_ids.includes(shopId)
        ? f.shop_ids.filter((id) => id !== shopId)
        : [...f.shop_ids, shopId],
    }));
  }

  function validate() {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.phone.trim()) newErrors.phone = 'Phone is required';
    else if (!/^\d{10}$/.test(form.phone)) newErrors.phone = 'Must be 10 digits';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) {
      setSubmitError('Please fix the errors above before submitting.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const data = await api.post('/admin/riders', form);
      setSuccess(data);
      setTimeout(() => router.push('/admin/riders'), 3000);
    } catch (err) {
      setSubmitError(err.message || 'Failed to create rider. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const getInputStyle = (field) => ({
    ...((errors[field] ? errorInputStyle : inputStyle)),
    ...(focusedField === field
      ? {
          borderColor: errors[field] ? 'var(--error)' : 'var(--primary)',
          boxShadow: `0 0 0 3px ${errors[field] ? 'rgba(220,38,38,0.12)' : 'rgba(232,116,12,0.15)'}`,
        }
      : {}),
  });

  const filteredShops = shops.filter(
    (s) =>
      !shopSearch ||
      (s.shop_name || '').toLowerCase().includes(shopSearch.toLowerCase()) ||
      (s.city || '').toLowerCase().includes(shopSearch.toLowerCase())
  );

  if (success) {
    return (
      <div
        style={{
          fontFamily: 'var(--font)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--s10)',
            textAlign: 'center',
            maxWidth: 440,
            width: '100%',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(22,163,74,0.12)',
              border: '2px solid var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              margin: '0 auto var(--s5)',
            }}
          >
            ✅
          </div>
          <h2 style={{ color: 'var(--success)', margin: '0 0 8px', fontWeight: 800, fontSize: 20 }}>
            Rider Registered!
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '0 0 var(--s5)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)' }}>{form.name}</strong> has been successfully added as a delivery rider.
          </p>

          {success.temp_password && (
            <div
              style={{
                background: 'rgba(13,59,110,0.06)',
                border: '1px solid rgba(13,59,110,0.15)',
                borderRadius: 'var(--r-md)',
                padding: 'var(--s4)',
                marginBottom: 'var(--s5)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                🔑 Temporary Password
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 18,
                  fontWeight: 800,
                  color: 'var(--text)',
                  letterSpacing: 2,
                  background: 'var(--surface-2)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                }}
              >
                {success.temp_password}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                Share this with the rider for their first login.
              </div>
            </div>
          )}

          {form.shop_ids.length > 0 && (
            <div
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: 'var(--s3) var(--s4)',
                marginBottom: 'var(--s4)',
                fontSize: 12,
                color: 'var(--text-2)',
              }}
            >
              Assigned to <strong style={{ color: 'var(--text)' }}>{form.shop_ids.length}</strong> shop{form.shop_ids.length > 1 ? 's' : ''}
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            Redirecting to riders list in 3 seconds…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'var(--font)', maxWidth: 860, margin: '0 auto' }}>
      <style>{`
        input:focus, select:focus, textarea:focus { outline: none; }
        .shop-checkbox:hover { background: rgba(232,116,12,0.04) !important; border-color: var(--primary) !important; }
        .shop-checkbox-checked { background: rgba(232,116,12,0.08) !important; border-color: rgba(232,116,12,0.4) !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s4)', marginBottom: 'var(--s6)' }}>
        <Link href="/admin/riders" style={{ textDecoration: 'none' }}>
          <button
            style={{
              padding: '8px 14px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              background: 'var(--surface)',
              color: 'var(--text-2)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            ← Back
          </button>
        </Link>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>
            Register New Rider
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
            Onboard a delivery rider onto TezzNirmaan
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* Personal Details */}
        <FormSection title="Rider Details" icon="🏍️">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s5)' }}>
            <FormField label="Full Name" required error={errors.name}>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('name')}
                placeholder="Rider's full name"
              />
            </FormField>
            <FormField label="Phone Number" required error={errors.phone} hint="10-digit mobile number">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('phone')}
                placeholder="9876543210"
              />
            </FormField>
          </div>
        </FormSection>

        {/* Vehicle Details */}
        <FormSection title="Vehicle Details" icon="🚗">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s5)' }}>
            <FormField label="Vehicle Type" required>
              <select
                value={form.vehicle_type}
                onChange={(e) => setField('vehicle_type', e.target.value)}
                onFocus={() => setFocusedField('vehicle_type')}
                onBlur={() => setFocusedField(null)}
                style={{
                  ...getInputStyle('vehicle_type'),
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: 32,
                  cursor: 'pointer',
                }}
              >
                {VEHICLE_TYPES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Vehicle Number" hint="Optional — e.g. BR01AB1234">
              <input
                type="text"
                value={form.vehicle_number}
                onChange={(e) => setField('vehicle_number', e.target.value.toUpperCase())}
                onFocus={() => setFocusedField('vehicle_number')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('vehicle_number')}
                placeholder="BR01AB1234"
              />
            </FormField>
          </div>

          {/* Vehicle type visual indicator */}
          <div
            style={{
              marginTop: 'var(--s4)',
              display: 'flex',
              gap: 'var(--s3)',
              flexWrap: 'wrap',
            }}
          >
            {VEHICLE_TYPES.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setField('vehicle_type', v.value)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--r-md)',
                  border: `1px solid ${form.vehicle_type === v.value ? 'var(--primary)' : 'var(--border)'}`,
                  background: form.vehicle_type === v.value ? 'rgba(232,116,12,0.1)' : 'transparent',
                  color: form.vehicle_type === v.value ? 'var(--primary)' : 'var(--text-2)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  transition: 'all 0.15s',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </FormSection>

        {/* Shop Assignments */}
        <FormSection title="Shop Assignments" icon="🏪">
          <p style={{ margin: '0 0 var(--s4)', fontSize: 13, color: 'var(--text-2)' }}>
            Select the shops this rider will be assigned to.{' '}
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
              {form.shop_ids.length} selected
            </span>
          </p>

          {/* Search */}
          <div style={{ marginBottom: 'var(--s4)', position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-3)',
                fontSize: 14,
                pointerEvents: 'none',
              }}
            >
              🔍
            </span>
            <input
              type="text"
              value={shopSearch}
              onChange={(e) => setShopSearch(e.target.value)}
              placeholder="Search shops by name or city…"
              style={{ ...inputStyle, paddingLeft: 36 }}
            />
          </div>

          {shopsLoading ? (
            <div style={{ textAlign: 'center', padding: 'var(--s6)', color: 'var(--text-3)', fontSize: 13 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--primary)',
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                  marginRight: 8,
                  verticalAlign: 'middle',
                }}
              />
              Loading shops…
            </div>
          ) : shops.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--s6)',
                color: 'var(--text-3)',
                fontSize: 13,
                background: 'var(--surface-2)',
                borderRadius: 'var(--r-md)',
                border: '1px dashed var(--border)',
              }}
            >
              No shops available. Create a shop first.
            </div>
          ) : (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                overflow: 'hidden',
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              {filteredShops.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--s5)', color: 'var(--text-3)', fontSize: 13 }}>
                  No shops match "{shopSearch}"
                </div>
              ) : (
                filteredShops.map((shop, idx) => {
                  const shopId = shop.id || shop._id;
                  const isChecked = form.shop_ids.includes(shopId);
                  return (
                    <label
                      key={shopId}
                      className={`shop-checkbox${isChecked ? ' shop-checkbox-checked' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        borderBottom: idx < filteredShops.length - 1 ? '1px solid var(--border)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.12s',
                        border: `1px solid ${isChecked ? 'rgba(232,116,12,0.3)' : 'transparent'}`,
                        background: isChecked ? 'rgba(232,116,12,0.06)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleShop(shopId)}
                        style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                          {shop.shop_name || 'Unnamed Shop'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                          {[shop.city, shop.state].filter(Boolean).join(', ')}
                          {shop.address_line1 && ` · ${shop.address_line1}`}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 20,
                          background: shop.status === 'active' ? 'rgba(22,163,74,0.1)' : 'rgba(107,114,128,0.1)',
                          color: shop.status === 'active' ? 'var(--success)' : '#9ca3af',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          flexShrink: 0,
                        }}
                      >
                        {shop.status || 'inactive'}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          )}

          {form.shop_ids.length > 0 && (
            <div
              style={{
                marginTop: 'var(--s4)',
                padding: 'var(--s3) var(--s4)',
                background: 'rgba(232,116,12,0.06)',
                border: '1px solid rgba(232,116,12,0.2)',
                borderRadius: 'var(--r-md)',
                fontSize: 12,
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontWeight: 700 }}>✓ {form.shop_ids.length} shops selected:</span>
              {form.shop_ids.slice(0, 3).map((id) => {
                const s = shops.find((x) => (x.id || x._id) === id);
                return s ? (
                  <span key={id} style={{ background: 'rgba(232,116,12,0.15)', padding: '1px 8px', borderRadius: 10, fontWeight: 600 }}>
                    {s.shop_name}
                  </span>
                ) : null;
              })}
              {form.shop_ids.length > 3 && (
                <span style={{ color: 'var(--text-2)' }}>+{form.shop_ids.length - 3} more</span>
              )}
            </div>
          )}
        </FormSection>

        {/* Error */}
        {submitError && (
          <div
            style={{
              padding: 'var(--s4)',
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: 'var(--r-md)',
              color: 'var(--error)',
              fontSize: 13,
              marginBottom: 'var(--s5)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            ⚠️ {submitError}
          </div>
        )}

        {/* Submit */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--s3)',
            paddingBottom: 'var(--s8)',
          }}
        >
          <Link href="/admin/riders" style={{ textDecoration: 'none' }}>
            <button
              type="button"
              style={{
                padding: '10px 24px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                background: 'var(--surface)',
                color: 'var(--text-2)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'var(--font)',
              }}
            >
              Cancel
            </button>
          </Link>
          <button
            type="submit"
            disabled={submitting}
            style={{
              background: submitting ? 'rgba(232,116,12,0.5)' : 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-md)',
              padding: '10px 32px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 14,
              boxShadow: submitting ? 'none' : '0 2px 8px rgba(232,116,12,0.3)',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'var(--font)',
            }}
          >
            {submitting ? (
              <>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                  }}
                />
                Registering Rider…
              </>
            ) : (
              '🏍️ Register Rider'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
