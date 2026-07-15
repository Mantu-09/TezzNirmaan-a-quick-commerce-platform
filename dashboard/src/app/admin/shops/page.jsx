'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';

const FILTERS = ['all', 'active', 'inactive'];

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
              width: i === 5 ? '60px' : i === 7 ? '80px' : '100%',
            }}
          />
        </td>
      ))}
    </tr>
  );
}

function StatusBadge({ status }) {
  const isActive = status === 'active';
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
        background: isActive ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.1)',
        color: isActive ? 'var(--success)' : 'var(--error)',
        border: `1px solid ${isActive ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.2)'}`,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: isActive ? 'var(--success)' : 'var(--error)',
          boxShadow: isActive ? '0 0 4px var(--success)' : '0 0 4px var(--error)',
        }}
      />
      {status}
    </span>
  );
}

export default function AdminShopsPage() {
  const router = useRouter();
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchShops();
  }, []);

  async function fetchShops() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/admin/shops');
      setShops(Array.isArray(data) ? data : data.shops || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch shops. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return shops;
    return shops.filter((s) => s.status === filter);
  }, [shops, filter]);

  const counts = useMemo(
    () => ({
      all: shops.length,
      active: shops.filter((s) => s.status === 'active').length,
      inactive: shops.filter((s) => s.status === 'inactive').length,
    }),
    [shops]
  );

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
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

      {/* Page Header */}
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
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: 'var(--text)',
              margin: 0,
              letterSpacing: '-0.5px',
            }}
          >
            All Shops
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
            {loading ? 'Loading...' : `${counts.all} shops registered on the platform`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center' }}>
          <button
            className="refresh-btn"
            onClick={fetchShops}
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
            title="Refresh"
          >
            ↻ Refresh
          </button>
          <Link href="/admin/shops/new">
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
              + Add Shop
            </button>
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      {!loading && !error && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--s4)',
            marginBottom: 'var(--s5)',
          }}
        >
          {[
            { label: 'Total Shops', value: counts.all, color: 'var(--secondary)' },
            { label: 'Active', value: counts.active, color: 'var(--success)' },
            { label: 'Inactive', value: counts.inactive, color: 'var(--error)' },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                padding: 'var(--s4) var(--s5)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s4)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: stat.color,
                  opacity: 0.12,
                  position: 'absolute',
                }}
              />
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: stat.color, lineHeight: 1 }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {stat.label}
                </div>
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
            background: 'var(--surface)',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginRight: 4 }}>
            FILTER:
          </span>
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
              onClick={fetchShops}
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
                {['Shop Name', 'City', 'Owner Name', 'Owner Phone', 'Status', 'Created', 'Actions'].map(
                  (h) => (
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
                  )
                )}
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
                  <td
                    colSpan={7}
                    style={{
                      textAlign: 'center',
                      padding: '48px 20px',
                      color: 'var(--text-3)',
                      fontSize: 14,
                    }}
                  >
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🏪</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
                      No shops found
                    </div>
                    <div style={{ fontSize: 12 }}>
                      {filter !== 'all' ? `No ${filter} shops at the moment.` : 'Add your first shop to get started.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((shop) => (
                  <tr key={shop.id || shop._id} className="row-hover" style={{ transition: 'background 0.1s' }}>
                    <td
                      style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 14 }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{shop.shop_name || '—'}</div>
                      {shop.address_line1 && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                          {shop.address_line1}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 14, color: 'var(--text-2)' }}>
                      {shop.city || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                      {shop.owner_name || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 14, color: 'var(--text-2)', fontFamily: 'monospace' }}>
                      {shop.owner_phone || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                      <StatusBadge status={shop.status || 'inactive'} />
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {formatDate(shop.created_at)}
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                      <button
                        className="action-btn"
                        onClick={() => router.push(`/admin/shops/${shop.id || shop._id}`)}
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

        {/* Footer */}
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
            Showing {filtered.length} of {shops.length} shops
          </div>
        )}
      </div>
    </div>
  );
}
