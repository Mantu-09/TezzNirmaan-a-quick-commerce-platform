'use client';
// ────────────────────────────────────────────────────────────
// Admin: Campaign Detail + Analytics — P8-3
// Route: /admin/campaigns/[id]
//
// Shows:
//   1. Status + quick actions (send now, cancel)
//   2. Stats cards: recipients, delivered, failed, opened
//   3. Delivery rate ring (visual)
//   4. Campaign content preview (phone mockup)
//   5. Timing info + audience + created by
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { campaignsApi } from '../../../../lib/api';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : '—';

const fmtAudience = (a) => ({
  all_customers:         'All customers',
  active_last_7_days:    'Active last 7 days',
  inactive_30_plus_days: 'Inactive 30+ days',
  pass_subscribers:      'Pass subscribers',
  city_patna:            'City: Patna',
  city_muzaffarpur:      'City: Muzaffarpur',
  city_bhagalpur:        'City: Bhagalpur',
  city_gaya:             'City: Gaya',
  no_orders_yet:         'No orders yet',
  contractors_only:      'Contractors only',
}[a] || a);

const STATUS_STYLES = {
  draft:     { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', label: 'Draft',      dot: '#9ca3af' },
  scheduled: { bg: 'rgba(59,130,246,0.1)',  color: '#1d4ed8', label: 'Scheduled',  dot: '#3b82f6' },
  sending:   { bg: 'rgba(245,158,11,0.12)', color: '#b45309', label: 'Sending…',   dot: '#f59e0b' },
  sent:      { bg: 'rgba(22,163,74,0.1)',   color: '#15803d', label: 'Sent ✓',     dot: '#16a34a' },
  cancelled: { bg: 'rgba(220,38,38,0.08)', color: '#b91c1c',  label: 'Cancelled',  dot: '#dc2626' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
      background: s.bg, color: s.color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot }} />
      {s.label}
    </span>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = '#7c3aed' }) {
  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '18px 20px',
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Delivery Ring ─────────────────────────────────────────────
function DeliveryRing({ delivered, total }) {
  if (!total) return null;
  const pct   = Math.round((delivered / total) * 100);
  const size  = 120;
  const r     = 44;
  const circ  = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  const color = pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626';

  return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={60} cy={60} r={r} fill="none" stroke="var(--border)" strokeWidth={10} />
        <circle
          cx={60} cy={60} r={r} fill="none"
          stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
        <text x={60} y={56} textAnchor="middle" fontSize={20} fontWeight={800} fill="var(--text-1)">
          {pct}%
        </text>
        <text x={60} y={72} textAnchor="middle" fontSize={10} fill="var(--text-3)">
          delivered
        </text>
      </svg>
    </div>
  );
}

// ── Phone Mockup ──────────────────────────────────────────────
function PhoneMockup({ campaign }) {
  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 16, padding: 20,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
        Notification Preview
      </div>
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: 20, padding: '32px 16px 24px', minHeight: 200,
        position: 'relative',
      }}>
        {/* Status bar */}
        <div style={{
          position: 'absolute', top: 12, left: 20, right: 20,
          display: 'flex', justifyContent: 'space-between',
          fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600,
        }}>
          <span>9:41</span>
          <span>⚡ 📶</span>
        </div>

        {/* Notification card */}
        <div style={{
          background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)',
          borderRadius: 14, padding: '12px 14px',
          border: '1px solid rgba(255,255,255,0.15)',
          marginTop: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              T
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                TezzNirmaan
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>now</div>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>
            {campaign.title}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
            {campaign.body}
          </div>
          {campaign.image_url && (
            <img
              src={campaign.image_url}
              alt="Campaign"
              style={{ width: '100%', borderRadius: 8, marginTop: 8, maxHeight: 100, objectFit: 'cover' }}
              onError={e => e.target.style.display = 'none'}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function CampaignDetailPage() {
  const { id }    = useParams();
  const router    = useRouter();

  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [actioning, setActioning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await campaignsApi.get(id);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSendNow = async () => {
    if (!confirm('Send this campaign immediately?')) return;
    setActioning(true);
    try {
      await campaignsApi.sendNow(id);
      alert('Campaign queued! Refresh in ~30 seconds to see delivery stats.');
      load();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setActioning(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this campaign? This cannot be undone.')) return;
    setActioning(true);
    try {
      await campaignsApi.cancel(id);
      load();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setActioning(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)' }}>
        <div style={{
          width: 32, height: 32, border: '3px solid var(--border)',
          borderTopColor: '#7c3aed', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        Loading campaign…
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: '#dc2626', fontSize: 15 }}>{error}</div>
        <Link href="/admin/campaigns" style={{ color: '#7c3aed', marginTop: 12, display: 'block' }}>
          ← Back to campaigns
        </Link>
      </div>
    );
  }

  const { campaign, rates } = data;
  const total = campaign.total_recipients;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
        <Link href="/admin/campaigns" style={{ color: '#7c3aed', textDecoration: 'none' }}>
          ← Campaigns
        </Link>
      </div>

      {/* Title + status + actions */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 24, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>
            {campaign.title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <StatusBadge status={campaign.status} />
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {campaign.status === 'sent'
                ? `Sent ${fmtDate(campaign.sent_at)}`
                : campaign.status === 'scheduled'
                ? `Scheduled for ${fmtDate(campaign.scheduled_at)}`
                : `Created ${fmtDate(campaign.created_at)}`}
            </span>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['draft', 'scheduled'].includes(campaign.status) && (
            <>
              <button
                onClick={handleSendNow}
                disabled={actioning}
                style={{
                  padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff',
                  fontSize: 14, fontWeight: 700, opacity: actioning ? 0.6 : 1,
                  boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
                }}
              >
                ▶ Send Now
              </button>
              <button
                onClick={handleCancel}
                disabled={actioning}
                style={{
                  padding: '9px 18px', borderRadius: 10,
                  border: '1px solid rgba(220,38,38,0.3)', cursor: 'pointer',
                  background: 'rgba(220,38,38,0.06)', color: '#b91c1c',
                  fontSize: 14, fontWeight: 700, opacity: actioning ? 0.6 : 1,
                }}
              >
                ✕ Cancel Campaign
              </button>
            </>
          )}
          <button
            onClick={load}
            style={{
              padding: '9px 14px', borderRadius: 10,
              border: '1px solid var(--border)', cursor: 'pointer',
              background: 'transparent', color: 'var(--text-3)', fontSize: 14,
            }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14, marginBottom: 24,
      }}>
        <StatCard
          icon="👥" label="Recipients" color="#7c3aed"
          value={total > 0 ? total.toLocaleString('en-IN') : '—'}
          sub={fmtAudience(campaign.audience)}
        />
        <StatCard
          icon="✅" label="Delivered" color="#16a34a"
          value={total > 0 ? campaign.delivered_count.toLocaleString('en-IN') : '—'}
          sub={total > 0 ? `${rates.delivery_rate}% rate` : null}
        />
        <StatCard
          icon="❌" label="Failed" color={campaign.failed_count > 0 ? '#dc2626' : '#9ca3af'}
          value={total > 0 ? campaign.failed_count.toLocaleString('en-IN') : '—'}
          sub={total > 0 ? `${rates.failure_rate}% — mostly stale tokens` : null}
        />
        <StatCard
          icon="👆" label="Opened" color="#d97706"
          value={total > 0 ? campaign.opened_count.toLocaleString('en-IN') : '—'}
          sub={total > 0 ? `${rates.open_rate}% tap rate` : null}
        />
      </div>

      {/* ── Bottom: ring + preview + info ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '180px 1fr 1fr',
        gap: 16, alignItems: 'start',
      }}>
        {/* Delivery ring */}
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '8px 0',
        }}>
          <DeliveryRing delivered={campaign.delivered_count} total={total} />
          {!total && (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-3)', fontSize: 13 }}>
              Send the campaign to see delivery stats.
            </div>
          )}
        </div>

        {/* Phone mockup */}
        <PhoneMockup campaign={campaign} />

        {/* Campaign metadata */}
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 }}>
            Details
          </div>
          {[
            { label: 'Audience',   value: fmtAudience(campaign.audience) },
            { label: 'Status',     value: campaign.status },
            { label: 'Scheduled',  value: fmtDate(campaign.scheduled_at) },
            { label: 'Sent at',    value: fmtDate(campaign.sent_at) },
            { label: 'Created',    value: fmtDate(campaign.created_at) },
            { label: 'Created by', value: campaign.profiles?.full_name || '—' },
            { label: 'Deep link',  value: campaign.deep_link || 'None (opens home)' },
          ].map(row => (
            <div key={row.label} style={{
              display: 'flex', justifyContent: 'space-between', gap: 8,
              padding: '8px 0', borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.05))',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
