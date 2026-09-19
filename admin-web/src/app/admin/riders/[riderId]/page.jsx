'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../../lib/api';

const fmt = (p) => `₹${Math.floor((p || 0) / 100)}`;

function Row({ label, value, mono = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
      <span style={{ color: '#6b7280', minWidth: 140 }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#111827', fontFamily: mono ? 'monospace' : 'inherit', textAlign: 'right' }}>{value ?? '—'}</span>
    </div>
  );
}

function StatCard({ icon, label, value, accent = '#0D3B6E' }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '18px 16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', flex: 1 }}>
      <div style={{ fontSize: 26, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent }}>{value}</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{label}</div>
    </div>
  );
}

export default function AdminRiderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const riderId = params.riderId;

  const [rider,     setRider]     = useState(null);
  const [earnings,  setEarnings]  = useState(null);
  const [loading,   setLoading]   = useState(true);

  // Suspension state
  const [suspending, setSuspending] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspend, setShowSuspend] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    if (!riderId) return;
    Promise.all([
      api.get(`/admin/riders/${riderId}`).catch(() => ({ data: null })),
      api.get(`/admin/riders/${riderId}/earnings-summary`).catch(() => ({ data: null })),
    ]).then(([riderRes, earningsRes]) => {
      setRider(riderRes?.data?.rider || riderRes?.data || null);
      setEarnings(earningsRes?.data || null);
    }).finally(() => setLoading(false));
  }, [riderId]);

  const handleToggleSuspension = async () => {
    if (!rider) return;
    const isSuspended = rider.is_suspended || rider.status === 'suspended';
    if (!isSuspended && !suspendReason.trim()) { setActionMsg('Please enter a reason for suspension'); return; }

    setSuspending(true); setActionMsg('');
    try {
      await api.patch(`/admin/riders/${riderId}`, {
        is_suspended: !isSuspended,
        suspension_reason: isSuspended ? null : suspendReason.trim(),
      });
      setRider(prev => ({ ...prev, is_suspended: !isSuspended, suspension_reason: isSuspended ? null : suspendReason.trim() }));
      setActionMsg(isSuspended ? 'Rider account reactivated.' : 'Rider account suspended.');
      setShowSuspend(false);
      setSuspendReason('');
    } catch (err) {
      setActionMsg(err.message || 'Action failed. Please try again.');
    } finally {
      setSuspending(false);
    }
  };

  const handleManualPayout = async () => {
    if (!confirm(`Trigger manual payout for this rider?`)) return;
    try {
      await api.post(`/admin/riders/${riderId}/manual-payout`);
      setActionMsg('Payout triggered successfully.');
    } catch (err) {
      setActionMsg(err.message || 'Payout failed.');
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

  if (!rider) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <div style={{ fontWeight: 600, fontSize: 16, color: '#6b7280' }}>Rider not found</div>
        <Link href="/admin/riders" style={{ display: 'inline-block', marginTop: 16, color: '#0D3B6E', fontWeight: 600, fontSize: 13 }}>← Back to Riders</Link>
      </div>
    );
  }

  const isSuspended = rider.is_suspended || rider.status === 'suspended';

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/riders" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>Riders</Link>
        <span style={{ color: '#cbd5e1', margin: '0 8px' }}>/</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{rider.full_name || rider.profiles?.full_name}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🛵</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: '0 0 3px' }}>
              {rider.full_name || rider.profiles?.full_name || 'Rider'}
            </h1>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{rider.phone || rider.profiles?.phone}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: isSuspended ? '#fef2f2' : rider.is_online ? '#f0fdf4' : '#f1f5f9',
            color: isSuspended ? '#dc2626' : rider.is_online ? '#16a34a' : '#6b7280',
          }}>
            {isSuspended ? '🚫 Suspended' : rider.is_online ? '🟢 Online' : '⚫ Offline'}
          </span>
          <button onClick={handleManualPayout} style={{ padding: '7px 14px', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
            💳 Manual Payout
          </button>
          <button
            onClick={() => setShowSuspend(v => !v)}
            style={{ padding: '7px 14px', background: isSuspended ? '#f0fdf4' : '#fef2f2', border: `1.5px solid ${isSuspended ? '#86efac' : '#fecaca'}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: isSuspended ? '#15803d' : '#dc2626', cursor: 'pointer' }}
          >
            {isSuspended ? '✅ Reactivate' : '🚫 Suspend'}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div style={{ background: '#f0fdf4', color: '#15803d', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16, fontWeight: 500 }}>
          ✅ {actionMsg}
        </div>
      )}

      {/* Suspension form */}
      {showSuspend && !isSuspended && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 18, marginBottom: 20, border: '1.5px solid #fecaca' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#dc2626', marginBottom: 10 }}>Suspension Reason</div>
          <textarea
            value={suspendReason}
            onChange={e => setSuspendReason(e.target.value)}
            placeholder="Why are you suspending this rider? This will be recorded."
            rows={3}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleToggleSuspension} disabled={suspending || !suspendReason.trim()} style={{ padding: '9px 18px', background: '#dc2626', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' }}>
              {suspending ? 'Suspending…' : 'Confirm Suspension'}
            </button>
            <button onClick={() => { setShowSuspend(false); setSuspendReason(''); }} style={{ padding: '9px 16px', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {showSuspend && isSuspended && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={handleToggleSuspension} disabled={suspending} style={{ padding: '10px 20px', background: '#16a34a', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' }}>
            {suspending ? 'Reactivating…' : '✅ Confirm Reactivation'}
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <StatCard icon="📦" label="Total Deliveries" value={rider.total_deliveries || earnings?.total_deliveries || 0} />
        <StatCard icon="💰" label="This Month"      value={fmt(earnings?.month_paise)}  accent="#f97316" />
        <StatCard icon="⭐" label="Rating"           value={`${(rider.rating || 0).toFixed(1)}/5`} accent="#ca8a04" />
        <StatCard icon="🔥" label="Streak"           value={`${rider.streak_days || 0}d`} accent="#dc2626" />
      </div>

      {/* Bio */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#374151', marginBottom: 12 }}>Rider Details</div>
          <Row label="Phone"       value={rider.phone || rider.profiles?.phone} mono />
          <Row label="City"        value={rider.city} />
          <Row label="Join Date"   value={rider.created_at ? new Date(rider.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : null} />
          <Row label="Vehicle Type" value={rider.vehicle_type} />
          <Row label="Vehicle No"  value={rider.vehicle_number} mono />
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#374151', marginBottom: 12 }}>KYC Status</div>
          {[
            { label: 'Aadhaar', key: 'aadhaar_verified' },
            { label: 'PAN',     key: 'pan_verified'     },
            { label: 'DL',      key: 'dl_verified'      },
            { label: 'RC',      key: 'rc_verified'      },
          ].map(d => (
            <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>{d.label}</span>
              <span style={{ fontWeight: 700, color: rider[d.key] ? '#16a34a' : '#9ca3af' }}>
                {rider[d.key] ? '✓ Verified' : 'Pending'}
              </span>
            </div>
          ))}
          {rider.suspension_reason && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#fef2f2', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
              <strong>Suspension reason:</strong> {rider.suspension_reason}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
