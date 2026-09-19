'use client';
// ────────────────────────────────────────────────────────────
// Admin: Push Campaigns List — P8-3
// Route: /admin/campaigns
//
// Shows all campaigns with status tabs, delivery stats,
// and quick actions (send, cancel). Links to detail view.
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { campaignsApi } from '../../../lib/api';

// ── Formatters ────────────────────────────────────────────────
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
  contractors_only:      'Contractors',
}[a] || a);

// ── Status Badge ──────────────────────────────────────────────
const STATUS_STYLES = {
  draft:     { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', label: 'Draft' },
  scheduled: { bg: 'rgba(59,130,246,0.1)',  color: '#1d4ed8', label: 'Scheduled' },
  sending:   { bg: 'rgba(245,158,11,0.12)', color: '#b45309', label: 'Sending…' },
  sent:      { bg: 'rgba(22,163,74,0.1)',   color: '#15803d', label: 'Sent ✓' },
  cancelled: { bg: 'rgba(220,38,38,0.08)', color: '#b91c1c',  label: 'Cancelled' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

// ── Delivery Rate Bar ─────────────────────────────────────────
function DeliveryBar({ delivered, total }) {
  if (!total) return <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>;
  const pct = Math.round((delivered / total) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 60, height: 5, borderRadius: 3,
        background: 'var(--border)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: pct >= 90 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626',
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600, minWidth: 36 }}>
        {pct}%
      </span>
    </div>
  );
}

// ── Status Tabs ───────────────────────────────────────────────
const TABS = [
  { key: '',          label: 'All' },
  { key: 'draft',     label: 'Draft' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'sending',   label: 'Sending' },
  { key: 'sent',      label: 'Sent' },
  { key: 'cancelled', label: 'Cancelled' },
];

// ── Main Page ─────────────────────────────────────────────────
export default function CampaignsPage() {
  const [campaigns,   setCampaigns]  = useState([]);
  const [pagination,  setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [statusTab,   setStatusTab]  = useState('');
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState('');
  const [actioning,   setActioning]  = useState(null); // campaignId of in-progress action

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await campaignsApi.list({ status: statusTab || undefined, page, limit: 20 });
      setCampaigns(res.campaigns || []);
      setPagination(res.pagination || { page, limit: 20, total: 0 });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusTab]);

  useEffect(() => { load(1); }, [load]);

  const handleSendNow = async (id) => {
    if (!confirm('Send this campaign immediately to all recipients?')) return;
    setActioning(id);
    try {
      await campaignsApi.sendNow(id);
      alert('Campaign queued! Refresh in ~30 seconds to see delivery stats.');
      load(pagination.page);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setActioning(null);
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this campaign?')) return;
    setActioning(id);
    try {
      await campaignsApi.cancel(id);
      load(pagination.page);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setActioning(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>
            📣 Push Campaigns
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            {pagination.total} campaigns total
          </p>
        </div>
        <Link
          href="/admin/campaigns/new"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 20px', borderRadius: 10,
            background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
            color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14,
            boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,58,237,0.4)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.3)'; }}
        >
          + New Campaign
        </Link>
      </div>

      {/* Status Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto',
        paddingBottom: 4,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key)}
            style={{
              padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap',
              background: statusTab === tab.key ? '#7c3aed' : 'var(--bg-2)',
              color: statusTab === tab.key ? '#fff' : 'var(--text-2)',
              boxShadow: statusTab === tab.key ? '0 2px 8px rgba(124,58,237,0.25)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 10, marginBottom: 16,
          background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: 14,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>
            <div style={{
              width: 28, height: 28, border: '3px solid var(--border)',
              borderTopColor: '#7c3aed', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
            }} />
            Loading campaigns…
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}>
              No campaigns yet
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
              Create your first campaign to reach customers with targeted push notifications.
            </div>
            <Link href="/admin/campaigns/new" style={{
              display: 'inline-block', marginTop: 16,
              padding: '8px 20px', borderRadius: 8,
              background: '#7c3aed', color: '#fff', textDecoration: 'none',
              fontSize: 14, fontWeight: 600,
            }}>
              + Create Campaign
            </Link>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1.4fr 120px 100px 100px 140px',
              padding: '10px 20px', fontSize: 11, fontWeight: 700,
              color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8,
              borderBottom: '1px solid var(--border)',
            }}>
              <span>Campaign</span>
              <span>Audience</span>
              <span>Recipients</span>
              <span>Delivered</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            {campaigns.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.4fr 120px 100px 100px 140px',
                  padding: '14px 20px',
                  alignItems: 'center',
                  borderBottom: i < campaigns.length - 1 ? '1px solid var(--border-light, rgba(0,0,0,0.05))' : 'none',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(124,58,237,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Campaign name + preview */}
                <div>
                  <Link
                    href={`/admin/campaigns/${c.id}`}
                    style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', textDecoration: 'none' }}
                  >
                    {c.title}
                  </Link>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    {c.status === 'scheduled'
                      ? `Scheduled ${fmtDate(c.scheduled_at)}`
                      : c.status === 'sent'
                      ? `Sent ${fmtDate(c.sent_at)}`
                      : `Created ${fmtDate(c.created_at)}`}
                  </div>
                </div>

                {/* Audience */}
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  {fmtAudience(c.audience)}
                </div>

                {/* Recipients */}
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                  {c.total_recipients > 0 ? c.total_recipients.toLocaleString('en-IN') : '—'}
                </div>

                {/* Delivery bar */}
                <div>
                  <DeliveryBar delivered={c.delivered_count} total={c.total_recipients} />
                </div>

                {/* Status */}
                <div><StatusBadge status={c.status} /></div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {['draft', 'scheduled'].includes(c.status) && (
                    <button
                      onClick={() => handleSendNow(c.id)}
                      disabled={actioning === c.id}
                      style={{
                        padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                        background: 'rgba(22,163,74,0.1)', color: '#15803d',
                        fontSize: 12, fontWeight: 700,
                        opacity: actioning === c.id ? 0.6 : 1,
                      }}
                      title="Send immediately"
                    >
                      ▶ Send
                    </button>
                  )}
                  {['draft', 'scheduled'].includes(c.status) && (
                    <button
                      onClick={() => handleCancel(c.id)}
                      disabled={actioning === c.id}
                      style={{
                        padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                        background: 'rgba(220,38,38,0.07)', color: '#b91c1c',
                        fontSize: 12, fontWeight: 700,
                        opacity: actioning === c.id ? 0.6 : 1,
                      }}
                      title="Cancel"
                    >
                      ✕
                    </button>
                  )}
                  <Link
                    href={`/admin/campaigns/${c.id}`}
                    style={{
                      padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)',
                      background: 'transparent', color: 'var(--text-2)',
                      fontSize: 12, fontWeight: 600, textDecoration: 'none',
                    }}
                    title="View detail"
                  >
                    Detail →
                  </Link>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {pagination.total > pagination.limit && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderTop: '1px solid var(--border)',
                fontSize: 13, color: 'var(--text-3)',
              }}>
                <span>
                  Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => load(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    style={{
                      padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border)',
                      background: 'transparent', cursor: 'pointer', fontSize: 13,
                      opacity: pagination.page === 1 ? 0.4 : 1,
                    }}
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => load(pagination.page + 1)}
                    disabled={pagination.page * pagination.limit >= pagination.total}
                    style={{
                      padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border)',
                      background: 'transparent', cursor: 'pointer', fontSize: 13,
                      opacity: pagination.page * pagination.limit >= pagination.total ? 0.4 : 1,
                    }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
