'use client';

import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';

// ────────────────────────────────────────────────────────────
// Admin Promos Page — P1-C
// Lists all promo codes with live stats; lets admins create
// new ones and toggle active/inactive.
// Route: /admin/promos
// ────────────────────────────────────────────────────────────

const PROMO_TYPES = [
  { value: 'percentage',    label: '% Off'         },
  { value: 'flat',          label: 'Flat Discount'  },
  { value: 'free_delivery', label: 'Free Delivery'  },
];

const TIER_OPTIONS = [
  { value: '',          label: 'Both tiers'       },
  { value: 'quick',     label: 'Quick only'       },
  { value: 'scheduled', label: 'Scheduled only'   },
];

const emptyForm = {
  code:                    '',
  type:                    'percentage',
  value:                   '',
  min_order_amount_paise:  '',
  max_discount_paise:      '',
  applicable_tier:         '',
  usage_limit:             '',
  per_user_limit:          '1',
  valid_from:              '',
  valid_until:             '',
  is_active:               true,
};

function Badge({ active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11,
      fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
      background: active ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.1)',
      color: active ? '#16a34a' : '#dc2626',
      border: `1px solid ${active ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.2)'}`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: active ? '#16a34a' : '#dc2626',
        boxShadow: active ? '0 0 4px #16a34a' : '0 0 4px #dc2626',
      }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function TypeBadge({ type }) {
  const map = { percentage: { label: '% Off', color: '#7c3aed' },
    flat: { label: 'Flat ₹', color: '#d97706' },
    free_delivery: { label: 'Free Del.', color: '#0284c7' } };
  const { label, color } = map[type] || { label: type, color: '#6b7280' };
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
      background: color + '18', color, border: `1px solid ${color}30`,
    }}>{label}</span>
  );
}

export default function AdminPromosPage() {
  const [promos,       setPromos]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [showForm,     setShowForm]     = useState(false);
  const [form,         setForm]         = useState(emptyForm);
  const [submitting,   setSubmitting]   = useState(false);
  const [formError,    setFormError]    = useState('');
  const [togglingId,   setTogglingId]   = useState(null);

  useEffect(() => { fetchPromos(); }, []);

  async function fetchPromos() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/promos');
      setPromos(res?.data?.promos || res?.promos || []);
    } catch (e) {
      setError(e.message || 'Failed to load promo codes');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(promo) {
    setTogglingId(promo.id);
    try {
      await api.patch(`/admin/promos/${promo.id}/toggle`, { is_active: !promo.is_active });
      setPromos(prev => prev.map(p => p.id === promo.id ? { ...p, is_active: !p.is_active } : p));
    } catch (e) {
      alert('Failed to toggle promo: ' + (e.message || ''));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    if (!form.code.trim() || !form.value) {
      setFormError('Code and Value are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/admin/promos', {
        code:                   form.code.trim().toUpperCase(),
        type:                   form.type,
        value:                  Number(form.value),
        min_order_amount_paise: form.min_order_amount_paise ? Number(form.min_order_amount_paise) * 100 : 0,
        max_discount_paise:     form.max_discount_paise ? Number(form.max_discount_paise) * 100 : null,
        applicable_tier:        form.applicable_tier || null,
        usage_limit:            form.usage_limit ? Number(form.usage_limit) : null,
        per_user_limit:         Number(form.per_user_limit) || 1,
        valid_from:             form.valid_from ? new Date(form.valid_from).toISOString() : null,
        valid_until:            form.valid_until ? new Date(form.valid_until).toISOString() : null,
        is_active:              form.is_active,
      });
      setForm(emptyForm);
      setShowForm(false);
      fetchPromos();
    } catch (e) {
      setFormError(e.message || 'Failed to create promo code');
    } finally {
      setSubmitting(false);
    }
  }

  const isExpired = (p) => p.valid_until && new Date(p.valid_until) < new Date();

  return (
    <div style={{ fontFamily: 'var(--font)' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🏷️ Promo Codes</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '4px 0 0' }}>
            Create and manage discount codes for customers.
          </p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          style={{
            background: showForm ? 'var(--surface-2)' : 'var(--primary)',
            color: showForm ? 'var(--text)' : '#fff',
            border: 'none', borderRadius: 10, padding: '10px 20px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {showForm ? '✕ Cancel' : '+ New Promo'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)',
          color: '#dc2626', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13,
        }}>⚠️ {error}</div>
      )}

      {/* Create form */}
      {showForm && (
        <div style={{
          background: 'var(--surface)', borderRadius: 14, padding: 24, marginBottom: 28,
          border: '1px solid var(--border)', boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 20px' }}>Create Promo Code</h2>
          {formError && (
            <div style={{
              background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)',
              color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13,
            }}>{formError}</div>
          )}
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {/* Code */}
              <label style={labelStyle}>
                Code *
                <input
                  style={inputStyle} required
                  placeholder="e.g. FIRST50"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                />
              </label>

              {/* Type */}
              <label style={labelStyle}>
                Type *
                <select style={inputStyle} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {PROMO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>

              {/* Value */}
              <label style={labelStyle}>
                Value * {form.type === 'percentage' ? '(%)' : form.type === 'flat' ? '(₹)' : '(N/A)'}
                <input
                  style={inputStyle} type="number" min="0"
                  placeholder={form.type === 'percentage' ? '10' : '50'}
                  value={form.value}
                  disabled={form.type === 'free_delivery'}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                />
              </label>

              {/* Min order */}
              <label style={labelStyle}>
                Min Order Amount (₹)
                <input
                  style={inputStyle} type="number" min="0"
                  placeholder="0"
                  value={form.min_order_amount_paise}
                  onChange={e => setForm(f => ({ ...f, min_order_amount_paise: e.target.value }))}
                />
              </label>

              {/* Max discount */}
              <label style={labelStyle}>
                Max Discount Cap (₹)
                <input
                  style={inputStyle} type="number" min="0"
                  placeholder="Optional"
                  value={form.max_discount_paise}
                  disabled={form.type !== 'percentage'}
                  onChange={e => setForm(f => ({ ...f, max_discount_paise: e.target.value }))}
                />
              </label>

              {/* Tier */}
              <label style={labelStyle}>
                Applicable Tier
                <select style={inputStyle} value={form.applicable_tier} onChange={e => setForm(f => ({ ...f, applicable_tier: e.target.value }))}>
                  {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>

              {/* Usage limit */}
              <label style={labelStyle}>
                Total Usage Limit
                <input
                  style={inputStyle} type="number" min="1"
                  placeholder="Unlimited"
                  value={form.usage_limit}
                  onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value }))}
                />
              </label>

              {/* Per user limit */}
              <label style={labelStyle}>
                Per-User Limit
                <input
                  style={inputStyle} type="number" min="1"
                  placeholder="1"
                  value={form.per_user_limit}
                  onChange={e => setForm(f => ({ ...f, per_user_limit: e.target.value }))}
                />
              </label>

              {/* Valid from */}
              <label style={labelStyle}>
                Valid From
                <input
                  style={inputStyle} type="datetime-local"
                  value={form.valid_from}
                  onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))}
                />
              </label>

              {/* Valid until */}
              <label style={labelStyle}>
                Valid Until
                <input
                  style={inputStyle} type="datetime-local"
                  value={form.valid_until}
                  onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
                />
              </label>

              {/* Active */}
              <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 20 }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  style={{ width: 16, height: 16 }}
                />
                <span>Active immediately</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setShowForm(false); setFormError(''); }}
                style={{ ...btnStyle, background: 'var(--surface-2)', color: 'var(--text)' }}>
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                style={{ ...btnStyle, background: 'var(--primary)', color: '#fff', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Creating…' : 'Create Promo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {['Code', 'Type', 'Discount', 'Min Order', 'Usage', 'Expires', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700,
                  fontSize: 11, color: 'var(--text-2)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array(4).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{
                          height: 12, borderRadius: 6, width: j === 0 ? 80 : '70%',
                          background: 'linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%)',
                          backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
                        }} />
                      </td>
                    ))}
                  </tr>
                ))
              : promos.length === 0
                ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 48, textAlign: 'center', color: 'var(--text-2)' }}>
                      No promo codes yet. Create your first one!
                    </td>
                  </tr>
                )
                : promos.map(promo => {
                    const expired = isExpired(promo);
                    const used = promo.usage_limit
                      ? `${promo.usage_count}/${promo.usage_limit}`
                      : `${promo.usage_count} / ∞`;
                    const discount = promo.type === 'percentage'
                      ? `${promo.value}%${promo.max_discount_paise ? ` (max ₹${promo.max_discount_paise / 100})` : ''}`
                      : promo.type === 'flat'
                        ? `₹${promo.value / 100}`
                        : 'Free Delivery';
                    const expires = promo.valid_until
                      ? new Date(promo.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                      : '—';

                    return (
                      <tr key={promo.id} style={{
                        borderBottom: '1px solid var(--border)',
                        opacity: !promo.is_active || expired ? 0.6 : 1,
                      }}>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{
                            fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                            letterSpacing: 1, color: 'var(--primary)',
                          }}>{promo.code}</span>
                          {expired && (
                            <span style={{
                              marginLeft: 6, fontSize: 10, background: 'rgba(220,38,38,0.1)',
                              color: '#dc2626', padding: '1px 6px', borderRadius: 10, fontWeight: 700,
                            }}>EXPIRED</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px' }}><TypeBadge type={promo.type} /></td>
                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>{discount}</td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-2)' }}>
                          {promo.min_order_amount_paise > 0 ? `₹${promo.min_order_amount_paise / 100}` : '—'}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-2)' }}>
                          <span style={{ fontWeight: promo.usage_limit && promo.usage_count >= promo.usage_limit ? 700 : 400 }}>
                            {used}
                          </span>
                          {promo.per_user_limit > 1 && (
                            <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>
                              ({promo.per_user_limit}× each)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', color: expired ? '#dc2626' : 'var(--text-2)', fontWeight: expired ? 700 : 400 }}>
                          {expires}
                        </td>
                        <td style={{ padding: '14px 16px' }}><Badge active={promo.is_active && !expired} /></td>
                        <td style={{ padding: '14px 16px' }}>
                          <button
                            onClick={() => handleToggle(promo)}
                            disabled={togglingId === promo.id || expired}
                            style={{
                              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                              cursor: expired ? 'not-allowed' : 'pointer', border: '1px solid var(--border)',
                              background: promo.is_active ? 'rgba(220,38,38,0.08)' : 'rgba(22,163,74,0.08)',
                              color: promo.is_active ? '#dc2626' : '#16a34a',
                              opacity: togglingId === promo.id ? 0.5 : 1,
                              transition: 'all 0.15s',
                            }}
                          >
                            {togglingId === promo.id ? '…' : promo.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
            }
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

const labelStyle = {
  display: 'flex', flexDirection: 'column', gap: 6,
  fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
};
const inputStyle = {
  padding: '9px 12px', borderRadius: 8, fontSize: 13,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btnStyle = {
  padding: '10px 20px', borderRadius: 10, fontSize: 13,
  fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
};
