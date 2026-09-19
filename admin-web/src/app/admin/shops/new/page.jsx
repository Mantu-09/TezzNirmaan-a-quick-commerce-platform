'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../../lib/api';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const defaultHours = DAYS.reduce((acc, day) => {
  acc[day] = { open: '09:00', close: '21:00', enabled: true };
  return acc;
}, {});

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

export default function NewShopPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    shop_name: '',
    owner_name: '',
    owner_phone: '',
    address_line1: '',
    city: 'Patna',
    state: 'Bihar',
    pincode: '',
    lat: '',
    lng: '',
    quick_delivery_radius_km: 5,
    scheduled_delivery_radius_km: 15,
    description: '',
  });
  const [hours, setHours] = useState(defaultHours);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(null);
  const [focusedField, setFocusedField] = useState(null);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  }

  function setHourField(day, field, value) {
    setHours((h) => ({ ...h, [day]: { ...h[day], [field]: value } }));
  }

  function validate() {
    const required = ['shop_name', 'owner_name', 'owner_phone', 'address_line1', 'pincode', 'lat', 'lng'];
    const newErrors = {};
    required.forEach((k) => {
      if (!String(form[k]).trim()) newErrors[k] = 'This field is required';
    });
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) newErrors.pincode = 'Must be 6 digits';
    if (form.owner_phone && !/^\d{10}$/.test(form.owner_phone)) newErrors.owner_phone = 'Must be 10 digits';
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
      const payload = {
        ...form,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        quick_delivery_radius_km: parseFloat(form.quick_delivery_radius_km),
        scheduled_delivery_radius_km: parseFloat(form.scheduled_delivery_radius_km),
        operating_hours: hours,
      };
      const data = await api.post('/admin/shops', payload);
      setSuccess(data);
      setTimeout(() => router.push('/admin/shops'), 3000);
    } catch (err) {
      setSubmitError(err.message || 'Failed to create shop. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const getInputStyle = (field) => ({
    ...((errors[field] ? errorInputStyle : inputStyle)),
    ...(focusedField === field ? { borderColor: errors[field] ? 'var(--error)' : 'var(--primary)', boxShadow: `0 0 0 3px ${errors[field] ? 'rgba(220,38,38,0.12)' : 'rgba(232,116,12,0.15)'}` } : {}),
  });

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
            Shop Created!
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '0 0 var(--s5)', lineHeight: 1.6 }}>
            The shop has been successfully registered on the platform.
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
                Share this with the shop owner. They can change it on first login.
              </div>
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            Redirecting to shops list in 3 seconds…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'var(--font)', maxWidth: 860, margin: '0 auto' }}>
      <style>{`
        input:focus, select:focus, textarea:focus { outline: none; }
        .day-row:hover { background: rgba(232,116,12,0.03); }
      `}</style>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s4)', marginBottom: 'var(--s6)' }}>
        <Link href="/admin/shops" style={{ textDecoration: 'none' }}>
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
            Register New Shop
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
            Fill in the details to onboard a new shop onto TezzNirmaan
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* Shop Details */}
        <FormSection title="Shop Details" icon="🏪">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s5)' }}>
            <FormField label="Shop Name" required error={errors.shop_name}>
              <input
                type="text"
                value={form.shop_name}
                onChange={(e) => setField('shop_name', e.target.value)}
                onFocus={() => setFocusedField('shop_name')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('shop_name')}
                placeholder="e.g. Fresh Mart Patna"
              />
            </FormField>
            <FormField label="Description" hint="Optional">
              <input
                type="text"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                onFocus={() => setFocusedField('description')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('description')}
                placeholder="Brief description of the shop"
              />
            </FormField>
          </div>
        </FormSection>

        {/* Owner Details */}
        <FormSection title="Owner Details" icon="👤">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s5)' }}>
            <FormField label="Owner Name" required error={errors.owner_name}>
              <input
                type="text"
                value={form.owner_name}
                onChange={(e) => setField('owner_name', e.target.value)}
                onFocus={() => setFocusedField('owner_name')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('owner_name')}
                placeholder="Full name of owner"
              />
            </FormField>
            <FormField label="Owner Phone" required error={errors.owner_phone} hint="10-digit mobile number">
              <input
                type="tel"
                value={form.owner_phone}
                onChange={(e) => setField('owner_phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                onFocus={() => setFocusedField('owner_phone')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('owner_phone')}
                placeholder="9876543210"
              />
            </FormField>
          </div>
        </FormSection>

        {/* Address */}
        <FormSection title="Address & Location" icon="📍">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--s5)' }}>
            <FormField label="Address Line 1" required error={errors.address_line1}>
              <input
                type="text"
                value={form.address_line1}
                onChange={(e) => setField('address_line1', e.target.value)}
                onFocus={() => setFocusedField('address_line1')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('address_line1')}
                placeholder="Street, locality, landmark"
              />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--s5)', marginTop: 'var(--s5)' }}>
            <FormField label="City" required>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setField('city', e.target.value)}
                onFocus={() => setFocusedField('city')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('city')}
                placeholder="Patna"
              />
            </FormField>
            <FormField label="State">
              <input
                type="text"
                value={form.state}
                onChange={(e) => setField('state', e.target.value)}
                onFocus={() => setFocusedField('state')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('state')}
                placeholder="Bihar"
              />
            </FormField>
            <FormField label="Pincode" required error={errors.pincode} hint="6-digit postal code">
              <input
                type="text"
                value={form.pincode}
                onChange={(e) => setField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                onFocus={() => setFocusedField('pincode')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('pincode')}
                placeholder="800001"
              />
            </FormField>
          </div>

          {/* Coordinates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s5)', marginTop: 'var(--s5)' }}>
            <FormField label="Latitude" required error={errors.lat}>
              <input
                type="number"
                value={form.lat}
                onChange={(e) => setField('lat', e.target.value)}
                onFocus={() => setFocusedField('lat')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('lat')}
                placeholder="25.614418"
                step="0.000001"
              />
            </FormField>
            <FormField label="Longitude" required error={errors.lng}>
              <input
                type="number"
                value={form.lng}
                onChange={(e) => setField('lng', e.target.value)}
                onFocus={() => setFocusedField('lng')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('lng')}
                placeholder="85.145400"
                step="0.000001"
              />
            </FormField>
          </div>

          {/* Coordinate Preview Card */}
          <div
            style={{
              marginTop: 'var(--s5)',
              background: 'linear-gradient(135deg, rgba(13,59,110,0.06) 0%, rgba(232,116,12,0.04) 100%)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--s4)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s4)',
            }}
          >
            {/* Pseudo-map visual */}
            <div
              style={{
                width: 100,
                height: 80,
                borderRadius: 'var(--r-md)',
                background: 'linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 40%, #81c784 100%)',
                border: '1px solid rgba(22,163,74,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Grid lines */}
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.07) 0,rgba(0,0,0,0.07) 1px,transparent 1px,transparent 16px),repeating-linear-gradient(90deg,rgba(0,0,0,0.07) 0,rgba(0,0,0,0.07) 1px,transparent 1px,transparent 16px)' }} />
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50% 50% 50% 0',
                  background: 'var(--error)',
                  transform: 'rotate(-45deg)',
                  boxShadow: '0 2px 6px rgba(220,38,38,0.4)',
                  position: 'relative',
                  zIndex: 1,
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                📍 Location Preview
              </div>
              {form.lat && form.lng ? (
                <div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 13,
                      color: 'var(--secondary)',
                      fontWeight: 700,
                    }}
                  >
                    {parseFloat(form.lat).toFixed(6)}, {parseFloat(form.lng).toFixed(6)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3 }}>
                    {form.city || 'City'}, {form.state || 'State'}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Enter lat/lng above to see preview
                  <br />
                  <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                    Patna reference: lat ≈ 25.6, lng ≈ 85.1
                  </span>
                </div>
              )}
            </div>
          </div>
        </FormSection>

        {/* Delivery Radius */}
        <FormSection title="Delivery Settings" icon="🛵">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s5)' }}>
            <FormField label="Quick Delivery Radius (km)" hint="Radius for express/quick deliveries">
              <input
                type="number"
                value={form.quick_delivery_radius_km}
                onChange={(e) => setField('quick_delivery_radius_km', e.target.value)}
                onFocus={() => setFocusedField('quick_delivery_radius_km')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('quick_delivery_radius_km')}
                min={1}
                max={50}
              />
            </FormField>
            <FormField label="Scheduled Delivery Radius (km)" hint="Radius for scheduled deliveries">
              <input
                type="number"
                value={form.scheduled_delivery_radius_km}
                onChange={(e) => setField('scheduled_delivery_radius_km', e.target.value)}
                onFocus={() => setFocusedField('scheduled_delivery_radius_km')}
                onBlur={() => setFocusedField(null)}
                style={getInputStyle('scheduled_delivery_radius_km')}
                min={1}
                max={100}
              />
            </FormField>
          </div>
        </FormSection>

        {/* Operating Hours */}
        <FormSection title="Operating Hours" icon="🕐">
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              overflow: 'hidden',
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 1fr 80px',
                gap: 0,
                background: 'var(--surface-2)',
                padding: '8px 14px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {['Day', 'Opens At', 'Closes At', 'Active'].map((h) => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {h}
                </div>
              ))}
            </div>
            {DAYS.map((day, idx) => (
              <div
                key={day}
                className="day-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 1fr 80px',
                  gap: 0,
                  padding: '10px 14px',
                  borderBottom: idx < DAYS.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                  background: hours[day].enabled ? 'transparent' : 'rgba(0,0,0,0.02)',
                  transition: 'background 0.1s',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: hours[day].enabled ? 'var(--text)' : 'var(--text-3)',
                  }}
                >
                  {day}
                </div>
                <input
                  type="time"
                  value={hours[day].open}
                  onChange={(e) => setHourField(day, 'open', e.target.value)}
                  disabled={!hours[day].enabled}
                  style={{
                    ...inputStyle,
                    opacity: hours[day].enabled ? 1 : 0.4,
                    padding: '6px 10px',
                    fontSize: 13,
                  }}
                />
                <input
                  type="time"
                  value={hours[day].close}
                  onChange={(e) => setHourField(day, 'close', e.target.value)}
                  disabled={!hours[day].enabled}
                  style={{
                    ...inputStyle,
                    opacity: hours[day].enabled ? 1 : 0.4,
                    padding: '6px 10px',
                    fontSize: 13,
                  }}
                />
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    color: hours[day].enabled ? 'var(--success)' : 'var(--text-3)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={hours[day].enabled}
                    onChange={(e) => setHourField(day, 'enabled', e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  {hours[day].enabled ? 'Open' : 'Closed'}
                </label>
              </div>
            ))}
          </div>
        </FormSection>

        {/* Error message */}
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
          <Link href="/admin/shops" style={{ textDecoration: 'none' }}>
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
                Creating Shop…
              </>
            ) : (
              '🏪 Create Shop'
            )}
          </button>
        </div>
      </form>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
