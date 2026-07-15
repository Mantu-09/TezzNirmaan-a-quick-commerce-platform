'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';

function SkeletonRow() {
  return (
    <tr>
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <td key={i} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div
            style={{
              height: 14,
              borderRadius: 6,
              background: 'linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s infinite',
              width: i === 5 ? '70px' : '100%',
            }}
          />
        </td>
      ))}
    </tr>
  );
}

function RiderStatusBadge({ status }) {
  const config = {
    online: { bg: 'rgba(22,163,74,0.12)', color: 'var(--success)', border: 'rgba(22,163,74,0.25)', dot: 'var(--success)' },
    busy: { bg: 'rgba(217,119,6,0.12)', color: 'var(--warning)', border: 'rgba(217,119,6,0.25)', dot: 'var(--warning)' },
    offline: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', border: 'rgba(107,114,128,0.2)', dot: '#9ca3af' },
  };
  const c = config[status] || config.offline;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: c.dot,
          boxShadow: `0 0 4px ${c.dot}`,
        }}
      />
      {status || 'offline'}
    </span>
  );
}

function VehicleBadge({ type }) {
  const icons = { bike: '🏍️', scooter: '🛵', cycle: '🚲', tempo: '🚐', other: '🚗' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: 'var(--surface-2)',
        color: 'var(--text-2)',
        border: '1px solid var(--border)',
        textTransform: 'capitalize',
      }}
    >
      {icons[type] || '🚗'} {type || 'other'}
    </span>
  );
}

export default function AdminRidersPage() {
  const router = useRouter();
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchRiders();
  }, []);

  async function fetchRiders() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/admin/riders');
      setRiders(Array.isArray(data) ? data : data.riders || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch riders. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const FILTERS = ['all', 'online', 'busy', 'offline'];
  const filtered = filter === 'all' ? riders : riders.filter((r) => (r.status || 'offline') === filter);

  const counts = {
    all: riders.length,
    online: riders.filter((r) => r.status === 'online').length,
    busy: riders.filter((r) => r.status === 'busy').length,
    offline: riders.filter((r) => !r.status || r.status === 'offline').length,
  };

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getAssignedShops(rider) {
    if (!rider.rider_shop_assignments || rider.rider_shop_assignments.length === 0) return '—';
    return rider.rider_shop_assignments
      .map((a) => a.shop?.shop_name || a.shop_name || `Shop #${a.shop_id}`)
      .join(', ');
  }

  return (
    <div style={{ fontFamily: 'var(--font)' }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .action-btn:hover { background: var(--primary) !important; color: #fff !important; border-color: var(--primary) !important; }
        .filter-btn:hover { border-color: var(--primary) !important; color: var(--primary) !important; }
        .row-hover:hover td { background: rgba(232,116,12,0.03) !important; }
        .refresh-btn:hover { background: var(--surface-2) !important; }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 'var(--s6)',
          gap: 'var(--s4)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>
            All Riders
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
            {loading ? 'Loading...' : `${counts.all} delivery riders on the platform`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center' }}>
          <button
            className="refresh-btn"
            onClick={fetchRiders}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-2)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              transition: 'all 0.15s',
            }}
          >
            ↻ Refresh
          </button>
          <Link href="/admin/riders/new">
            <button
              style={{
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--r-md)',
                padding: '8px 20px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(232,116,12,0.3)',
                transition: 'all 0.15s',
                letterSpacing: '0.2px',
              }}
            >
              + Add Rider
            </button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s4)', marginBottom: 'var(--s5)' }}>
          {[
            { label: 'Total', value: counts.all, color: 'var(--secondary)' },
            { label: 'Online', value: counts.online, color: 'var(--success)' },
            { label: 'Busy', value: counts.busy, color: 'var(--warning)' },
            { label: 'Offline', value: counts.offline, color: '#9ca3af' },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                padding: 'var(--s4) var(--s5)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 800, color: stat.color, lineHeight: 1 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Card */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}
      >
        {/* Filter Bar */}
        <div
          style={{
            padding: 'var(--s4) var(--s5)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s3)',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginRight: 4 }}>FILTER:</span>
          {FILTERS.map((f) => (
            <button
              key={f}
              className="filter-btn"
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                border: `1px solid ${filter === f ? 'var(--primary)' : 'var(--border)'}`,
                background: filter === f ? 'rgba(232,116,12,0.1)' : 'transparent',
                color: filter === f ? 'var(--primary)' : 'var(--text-2)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'capitalize',
                transition: 'all 0.15s',
              }}
            >
              {f} {!loading && `(${counts[f]})`}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              margin: 'var(--s5)',
              padding: 'var(--s4)',
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: 'var(--r-md)',
              color: 'var(--error)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            ⚠️ {error}
            <button
              onClick={fetchRiders}
              style={{
                marginLeft: 'auto',
                padding: '4px 12px',
                border: '1px solid var(--error)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--error)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Rider Name', 'Phone', 'Vehicle', 'Assigned Shops', 'Status', 'Joined', 'Actions'].map((h) => (
                  <th
                    key={h}
                    style={{
                      background: 'var(--surface-2)',
                      padding: '10px 14px',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-2)',
                      textAlign: 'left',
                      borderBottom: '2px solid var(--border)',
                      whiteSpace: 'nowrap',
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)', fontSize: 14 }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🏍️</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>No riders found</div>
                    <div style={{ fontSize: 12 }}>
                      {filter !== 'all' ? `No ${filter} riders right now.` : 'Add your first rider to get started.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((rider) => (
                  <tr key={rider.id || rider._id} className="row-hover" style={{ transition: 'background 0.1s' }}>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 800,
                            color: '#fff',
                            flexShrink: 0,
                          }}
                        >
                          {(rider.name || 'R').charAt(0).toUpperCase()}
                        </span>
                        {rider.name || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)', fontFamily: 'monospace' }}>
                      {rider.phone || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                      <VehicleBadge type={rider.vehicle_type} />
                      {rider.vehicle_number && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontFamily: 'monospace' }}>
                          {rider.vehicle_number}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 12,
                        color: 'var(--text-2)',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={getAssignedShops(rider)}
                    >
                      {getAssignedShops(rider)}
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                      <RiderStatusBadge status={rider.status} />
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {formatDate(rider.created_at)}
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                      <button
                        className="action-btn"
                        onClick={() => router.push(`/admin/riders/${rider.id || rider._id}`)}
                        style={{
                          padding: '5px 14px',
                          borderRadius: 'var(--r-md)',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--text-2)',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          transition: 'all 0.15s',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div
            style={{
              padding: 'var(--s3) var(--s5)',
              borderTop: '1px solid var(--border)',
              background: 'var(--surface-2)',
              fontSize: 12,
              color: 'var(--text-3)',
            }}
          >
            Showing {filtered.length} of {riders.length} riders
          </div>
        )}
      </div>
    </div>
  );
}
