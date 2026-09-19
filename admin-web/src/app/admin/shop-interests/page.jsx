'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../../lib/api';

// ── Status config ─────────────────────────────────────────────
const STATUS_CONFIG = {
  new:        { label: 'New',        color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)', dot: '#3b82f6' },
  contacted:  { label: 'Contacted',  color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', dot: '#f59e0b' },
  onboarded:  { label: 'Onboarded', color: '#16a34a', bg: 'rgba(22,163,74,0.10)',  border: 'rgba(22,163,74,0.25)',  dot: '#22c55e' },
  rejected:   { label: 'Rejected',  color: '#ef4444', bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.20)',  dot: '#ef4444' },
};

const FILTERS = ['all', 'new', 'contacted', 'onboarded', 'rejected'];

// ── Sub-components ────────────────────────────────────────────

function SkeletonRow() {
  const widths = ['45%', '35%', '30%', '25%', '55%', '30%', '70px'];
  return (
    <tr>
      {widths.map((w, i) => (
        <td key={i} style={{ padding: '13px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            height: 13, borderRadius: 6, width: w,
            background: 'linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
          }} />
        </td>
      ))}
    </tr>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11,
      fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, boxShadow: `0 0 4px ${cfg.dot}` }} />
      {cfg.label}
    </span>
  );
}

function StatusDropdown({ lead, onUpdate, updating }) {
  const [open, setOpen] = useState(false);
  const statuses = ['new', 'contacted', 'onboarded', 'rejected'];

  return (
    <div style={{ position: 'relative' }}>
      <button
        id={`status-btn-${lead.id}`}
        onClick={() => setOpen(o => !o)}
        disabled={updating}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 8,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text)', fontSize: 12, fontWeight: 600,
          cursor: updating ? 'not-allowed' : 'pointer',
          opacity: updating ? 0.6 : 1,
          transition: 'all 0.15s',
        }}
      >
        {updating ? '...' : 'Change'} <span style={{ fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            minWidth: 140,
          }}>
            {statuses.filter(s => s !== lead.status).map(s => {
              const cfg = STATUS_CONFIG[s];
              return (
                <button
                  key={s}
                  id={`status-option-${lead.id}-${s}`}
                  onClick={() => { setOpen(false); onUpdate(lead.id, s); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '9px 14px',
                    background: 'transparent', border: 'none',
                    color: 'var(--text)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────
function exportCsv(leads) {
  const headers = ['Shop Name', 'Owner Name', 'Phone', 'City', 'Shop Types', 'Status', 'Submitted At', 'Monthly Orders'];
  const rows = leads.map(l => [
    l.shop_name,
    l.owner_name,
    l.phone,
    l.city,
    (l.shop_types || []).join(' | '),
    l.status,
    new Date(l.submitted_at || l.created_at).toLocaleDateString('en-IN'),
    l.monthly_orders || '',
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `shop-leads-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Main Page ─────────────────────────────────────────────────
export default function ShopInterestsPage() {
  const [leads, setLeads]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState('all');
  const [updating, setUpdating]   = useState({}); // { [id]: true }
  const [toast, setToast]         = useState(null); // { msg, type }

  // Load all leads (we load all upfront for client-side filtering + CSV export)
  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/shop-interests?limit=500');
      setLeads(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Client-side filter
  const filtered = useMemo(() => {
    if (filter === 'all') return leads;
    return leads.filter(l => l.status === filter);
  }, [leads, filter]);

  // Status counts for filter tabs
  const counts = useMemo(() => {
    const c = { all: leads.length };
    FILTERS.slice(1).forEach(s => { c[s] = leads.filter(l => l.status === s).length; });
    return c;
  }, [leads]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleStatusUpdate = async (id, newStatus) => {
    setUpdating(u => ({ ...u, [id]: true }));
    try {
      await api.patch(`/admin/shop-interests/${id}`, { status: newStatus });
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
      showToast(`Status updated to "${STATUS_CONFIG[newStatus].label}"`);
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    } finally {
      setUpdating(u => ({ ...u, [id]: false }));
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* ── Toast ──────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 999,
          padding: '12px 20px', borderRadius: 10,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(22,163,74,0.95)',
          color: '#fff', fontWeight: 600, fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          animation: 'slideUp 0.2s ease',
        }}>
          {toast.type === 'error' ? '⚠️' : '✓'} {toast.msg}
        </div>
      )}

      {/* ── Page Header ────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 'var(--s5)', flexWrap: 'wrap', gap: 'var(--s3)',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
            📋 Shop Interest Leads
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Pre-registrations from the shop-signup marketing page
          </p>
        </div>

        <button
          id="export-csv-btn"
          onClick={() => exportCsv(filtered)}
          disabled={filtered.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 10,
            background: 'linear-gradient(135deg, var(--primary), #c55a00)',
            border: 'none', color: '#fff', fontWeight: 700, fontSize: 13,
            cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
            opacity: filtered.length === 0 ? 0.5 : 1,
            boxShadow: '0 2px 10px rgba(232,116,12,0.35)',
            transition: 'all 0.15s',
          }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* ── Stats Cards ────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 'var(--s3)', marginBottom: 'var(--s5)',
      }}>
        {[
          { label: 'Total Leads',  value: counts.all,       icon: '📋', color: 'var(--primary)' },
          { label: 'New',          value: counts.new,        icon: '🆕', color: '#3b82f6' },
          { label: 'Contacted',    value: counts.contacted,  icon: '📞', color: '#f59e0b' },
          { label: 'Onboarded',    value: counts.onboarded,  icon: '✅', color: '#16a34a' },
          { label: 'Rejected',     value: counts.rejected,   icon: '❌', color: '#ef4444' },
        ].map(card => (
          <div key={card.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <span style={{ fontSize: 18 }}>{card.icon}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: card.color }}>{card.value}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{card.label}</span>
          </div>
        ))}
      </div>

      {/* ── Main Card ──────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
      }}>
        {/* Filter Tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}>
          {FILTERS.map(f => (
            <button
              key={f}
              id={`filter-${f}`}
              onClick={() => setFilter(f)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                border: '1px solid',
                borderColor: filter === f ? 'var(--primary)' : 'var(--border)',
                background: filter === f ? 'rgba(232,116,12,0.12)' : 'transparent',
                color: filter === f ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
                textTransform: 'capitalize', transition: 'all 0.15s',
              }}
            >
              {f === 'all' ? 'All' : STATUS_CONFIG[f]?.label}
              <span style={{
                minWidth: 18, height: 18, display: 'flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: 20, fontSize: 10, fontWeight: 800,
                background: filter === f ? 'var(--primary)' : 'var(--surface-2)',
                color: filter === f ? '#fff' : 'var(--text-muted)',
              }}>
                {counts[f] || 0}
              </span>
            </button>
          ))}

          <div style={{ flex: 1 }} />
          <button
            id="refresh-leads-btn"
            onClick={fetchLeads}
            disabled={loading}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text-muted)', cursor: 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? '⟳ Loading…' : '⟳ Refresh'}
          </button>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          {error ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--error)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
              <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>
              <button onClick={fetchLeads} style={{
                marginTop: 16, padding: '8px 20px', borderRadius: 8,
                background: 'var(--primary)', border: 'none', color: '#fff',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>
                Retry
              </button>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Shop Name', 'Owner', 'Phone', 'City', 'Shop Types', 'Status', 'Submitted', 'Action'].map(h => (
                    <th key={h} style={{
                      padding: '11px 14px', textAlign: 'left', fontSize: 11,
                      fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: 0.8,
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '56px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>
                        {filter === 'all' ? 'No leads yet' : `No ${filter} leads`}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                        {filter === 'all'
                          ? 'Leads from the shop-signup page will appear here.'
                          : 'Try a different filter.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead, idx) => (
                    <tr
                      key={lead.id}
                      id={`lead-row-${lead.id}`}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'}
                    >
                      {/* Shop Name */}
                      <td style={{ padding: '13px 14px', fontWeight: 700, color: 'var(--text)' }}>
                        {lead.shop_name}
                      </td>

                      {/* Owner */}
                      <td style={{ padding: '13px 14px', color: 'var(--text)' }}>
                        {lead.owner_name}
                      </td>

                      {/* Phone — tap to call */}
                      <td style={{ padding: '13px 14px' }}>
                        <a
                          href={`tel:+91${lead.phone}`}
                          id={`call-${lead.id}`}
                          style={{
                            color: 'var(--primary)', fontWeight: 600, textDecoration: 'none',
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px', borderRadius: 6,
                            background: 'rgba(232,116,12,0.08)',
                            border: '1px solid rgba(232,116,12,0.2)',
                            fontSize: 12,
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(232,116,12,0.16)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(232,116,12,0.08)'}
                        >
                          📞 {lead.phone}
                        </a>
                      </td>

                      {/* City */}
                      <td style={{ padding: '13px 14px', color: 'var(--text)', fontWeight: 500 }}>
                        {lead.city}
                      </td>

                      {/* Shop Types */}
                      <td style={{ padding: '13px 14px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(lead.shop_types || []).map(type => (
                            <span key={type} style={{
                              padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              background: 'var(--surface-2)', color: 'var(--text-muted)',
                              border: '1px solid var(--border)', textTransform: 'capitalize',
                            }}>
                              {type}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '13px 14px' }}>
                        <StatusBadge status={lead.status} />
                      </td>

                      {/* Submitted At */}
                      <td style={{ padding: '13px 14px', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {new Date(lead.submitted_at || lead.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '13px 14px' }}>
                        <StatusDropdown
                          lead={lead}
                          onUpdate={handleStatusUpdate}
                          updating={!!updating[lead.id]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer row count */}
        {!loading && !error && (
          <div style={{
            padding: '10px 20px', borderTop: '1px solid var(--border)',
            color: 'var(--text-muted)', fontSize: 12, fontWeight: 500,
          }}>
            Showing {filtered.length} of {leads.length} lead{leads.length !== 1 ? 's' : ''}
            {filter !== 'all' && ` · Filtered by: ${STATUS_CONFIG[filter]?.label}`}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
