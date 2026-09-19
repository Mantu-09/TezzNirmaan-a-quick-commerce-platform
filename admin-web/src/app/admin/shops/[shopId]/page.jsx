'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../../lib/api';

const fmt = (p) => `₹${Math.floor((p || 0) / 100)}`;

function Row({ label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
      <span style={{ color: '#6b7280', minWidth: 150 }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#111827', fontFamily: mono ? 'monospace' : 'inherit', textAlign: 'right' }}>{value ?? '—'}</span>
    </div>
  );
}

export default function AdminShopDetailPage() {
  const params = useParams();
  const shopId = params.shopId;

  const [shop,     setShop]     = useState(null);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  // Editable fields
  const [commission, setCommission] = useState('');
  const [isActive,   setIsActive]   = useState(true);

  useEffect(() => {
    if (!shopId) return;
    Promise.all([
      api.get(`/admin/shops/${shopId}`).catch(() => ({ data: null })),
      api.get(`/admin/shops/${shopId}/stats`).catch(() => ({ data: null })),
    ]).then(([shopRes, statsRes]) => {
      const s = shopRes?.data?.shop || shopRes?.data || null;
      setShop(s);
      setStats(statsRes?.data || null);
      if (s) {
        setCommission(s.commission_pct ?? '');
        setIsActive(s.is_active ?? true);
      }
    }).finally(() => setLoading(false));
  }, [shopId]);

  const handleSave = async () => {
    setSaving(true); setActionMsg('');
    try {
      await api.patch(`/admin/shops/${shopId}`, {
        commission_pct: parseFloat(commission),
        is_active:      isActive,
      });
      setShop(prev => ({ ...prev, commission_pct: parseFloat(commission), is_active: isActive }));
      setActionMsg('Shop updated successfully.');
    } catch (err) {
      setActionMsg(err.message || 'Failed to update shop.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#0D3B6E', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!shop) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <div style={{ fontWeight: 600, fontSize: 16, color: '#6b7280' }}>Shop not found</div>
        <Link href="/admin/shops" style={{ display: 'inline-block', marginTop: 16, color: '#0D3B6E', fontWeight: 600, fontSize: 13 }}>← Back to Shops</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820 }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/shops" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>Shops</Link>
        <span style={{ color: '#cbd5e1', margin: '0 8px' }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{shop.name}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🏪</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: '0 0 3px' }}>{shop.name}</h1>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{shop.city} · {shop.address}</div>
          </div>
        </div>
        <span style={{
          padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: shop.is_active ? '#f0fdf4' : '#fef2f2',
          color:      shop.is_active ? '#16a34a' : '#dc2626',
        }}>
          {shop.is_active ? '✓ Active' : '✗ Inactive'}
        </span>
      </div>

      {actionMsg && (
        <div style={{ background: '#f0fdf4', color: '#15803d', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
          ✅ {actionMsg}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {[
            { icon: '📦', label: 'Total Orders',   value: stats.total_orders || 0, accent: '#0D3B6E' },
            { icon: '💰', label: 'This Month GMV',  value: fmt(stats.month_gmv_paise), accent: '#f97316' },
            { icon: '⭐', label: 'Rating',           value: `${(stats.avg_rating || 0).toFixed(1)}/5`, accent: '#ca8a04' },
            { icon: '🛵', label: 'Avg Prep (min)',   value: stats.avg_prep_time_min || '—', accent: '#7c3aed' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '16px 14px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.accent }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Shop details */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#374151', marginBottom: 12 }}>Shop Details</div>
          <Row label="Shop ID"       value={shop.id}               mono />
          <Row label="Owner Name"    value={shop.owner_name || shop.profiles?.full_name} />
          <Row label="Owner Phone"   value={shop.owner_phone || shop.profiles?.phone} mono />
          <Row label="Category"      value={shop.category} />
          <Row label="City"          value={shop.city} />
          <Row label="GSTIN"         value={shop.gstin} mono />
          <Row label="FSSAI No."     value={shop.fssai_number} mono />
          <Row label="Created"       value={shop.created_at ? new Date(shop.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : null} />
        </div>

        {/* Admin controls */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#374151', marginBottom: 16 }}>Admin Controls</div>

          {/* Commission override */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Commission Rate (%)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                value={commission}
                onChange={e => setCommission(e.target.value)}
                min={0} max={50} step={0.5}
                style={{ width: 90, padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontWeight: 700 }}
              />
              <span style={{ lineHeight: '38px', color: '#6b7280', fontSize: 14 }}>%  (platform default: 15%)</span>
            </div>
          </div>

          {/* Active toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Shop Status</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Toggle to enable or disable this shop</div>
            </div>
            <button
              onClick={() => setIsActive(v => !v)}
              style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: isActive ? '#0D3B6E' : '#e2e8f0', transition: 'background 0.2s', padding: 0 }}
            >
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: isActive ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{ width: '100%', padding: '11px', background: saving ? '#e2e8f0' : '#0D3B6E', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, color: saving ? '#94a3b8' : '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>

          <div style={{ marginTop: 12 }}>
            <Link
              href={`/admin/settlements?shopId=${shopId}`}
              style={{ display: 'block', padding: '10px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#374151', textDecoration: 'none' }}
            >
              💰 View Settlements →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
