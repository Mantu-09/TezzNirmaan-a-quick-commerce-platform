'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '../../../lib/api';

const TIERS = ['all', 'quick', 'scheduled'];
const TIER_ICONS = { quick: '⚡', scheduled: '📅' };

function SkeletonRow() {
  return (
    <tr>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{
            height: 14,
            borderRadius: 6,
            background: 'linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
            width: i === 4 ? '60px' : i === 6 ? '80px' : '100%',
          }} />
        </td>
      ))}
    </tr>
  );
}

function TierBadge({ tier }) {
  const isQuick = tier === 'quick';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      background: isQuick ? 'rgba(232,116,12,0.1)' : 'rgba(59,130,246,0.1)',
      color: isQuick ? 'var(--primary)' : '#3b82f6',
      border: `1px solid ${isQuick ? 'rgba(232,116,12,0.25)' : 'rgba(59,130,246,0.2)'}`,
    }}>
      {TIER_ICONS[tier] || '—'} {tier}
    </span>
  );
}

function ActiveBadge({ isActive }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700,
      background: isActive ? 'rgba(22,163,74,0.12)' : 'rgba(107,114,128,0.1)',
      color: isActive ? 'var(--success)' : 'var(--text-3)',
      border: `1px solid ${isActive ? 'rgba(22,163,74,0.25)' : 'rgba(107,114,128,0.2)'}`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: isActive ? 'var(--success)' : 'var(--text-3)',
      }} />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function AdminProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tier, setTier] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => { fetchProducts(); }, [tier, search]);

  async function fetchProducts() {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (tier !== 'all') params.tier = tier;
      if (search) params.search = search;
      const data = await adminApi.getProducts(params);
      setProducts(Array.isArray(data) ? data : data.products || data.data?.products || []);
    } catch (err) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const counts = useMemo(() => ({
    all:       products.length,
    quick:     products.filter(p => p.delivery_tier === 'quick').length,
    scheduled: products.filter(p => p.delivery_tier === 'scheduled').length,
    active:    products.filter(p => p.is_active).length,
  }), [products]);

  return (
    <div style={{ fontFamily: 'var(--font)' }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .row-hover:hover td { background: rgba(232,116,12,0.03) !important; }
        .action-btn:hover { background: var(--primary) !important; color: #fff !important; border-color: var(--primary) !important; }
        .filter-btn:hover { border-color: var(--primary) !important; color: var(--primary) !important; }
        .refresh-btn:hover { background: var(--surface-2) !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--s6)', gap: 'var(--s4)', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>
            Master Catalog
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
            {loading ? 'Loading…' : `${counts.all} products · ${counts.active} active`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'center' }}>
          <button
            className="refresh-btn"
            onClick={fetchProducts}
            style={{ padding: '8px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.15s' }}
          >
            ↻ Refresh
          </button>
          <Link href="/admin/products/new">
            <button style={{
              background: 'var(--primary)', color: '#fff', border: 'none',
              borderRadius: 'var(--r-md)', padding: '8px 20px',
              cursor: 'pointer', fontWeight: 700, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 8px rgba(232,116,12,0.3)', transition: 'all 0.15s',
            }}>
              + Add Product
            </button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s4)', marginBottom: 'var(--s5)' }}>
          {[
            { label: 'Total',     value: counts.all,       color: 'var(--secondary)' },
            { label: 'Quick ⚡',   value: counts.quick,     color: 'var(--primary)' },
            { label: 'Scheduled', value: counts.scheduled, color: '#3b82f6' },
            { label: 'Active',    value: counts.active,    color: 'var(--success)' },
          ].map((stat) => (
            <div key={stat.label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)', padding: 'var(--s4) var(--s5)',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main Card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>

        {/* Filter + Search Bar */}
        <div style={{ padding: 'var(--s4) var(--s5)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 'var(--s3)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginRight: 4 }}>TIER:</span>
          {TIERS.map((t) => (
            <button key={t} className="filter-btn" onClick={() => setTier(t)} style={{
              padding: '5px 14px', borderRadius: 20,
              border: `1px solid ${tier === t ? 'var(--primary)' : 'var(--border)'}`,
              background: tier === t ? 'rgba(232,116,12,0.1)' : 'transparent',
              color: tier === t ? 'var(--primary)' : 'var(--text-2)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'capitalize', transition: 'all 0.15s',
            }}>
              {t === 'all' ? `All (${counts.all})` : t === 'quick' ? `⚡ Quick (${counts.quick})` : `📅 Scheduled (${counts.scheduled})`}
            </button>
          ))}
          <form onSubmit={handleSearch} style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search products…"
              style={{ padding: '7px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none', width: 220 }}
            />
            <button type="submit" style={{ padding: '7px 14px', borderRadius: 'var(--r-md)', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Search
            </button>
            {search && (
              <button type="button" onClick={() => { setSearch(''); setSearchInput(''); }} style={{ padding: '7px 12px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>
                ✕ Clear
              </button>
            )}
          </form>
        </div>

        {/* Error */}
        {error && (
          <div style={{ margin: 'var(--s5)', padding: 'var(--s4)', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 'var(--r-md)', color: 'var(--error)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚠️ {error}
            <button onClick={fetchProducts} style={{ marginLeft: 'auto', padding: '4px 12px', border: '1px solid var(--error)', borderRadius: 6, background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Product', 'Category', 'Brand', 'Tier', 'Unit', 'GST', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{
                    background: 'var(--surface-2)', padding: '10px 14px',
                    fontSize: 11, fontWeight: 700, color: 'var(--text-2)',
                    textAlign: 'left', borderBottom: '2px solid var(--border)',
                    whiteSpace: 'nowrap', letterSpacing: 0.5, textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)', fontSize: 14 }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
                    <div style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
                      {search ? `No products matching "${search}"` : 'No products yet'}
                    </div>
                    <div style={{ fontSize: 12 }}>
                      {search ? 'Try a different search term.' : 'Add your first product to the master catalog.'}
                    </div>
                  </td>
                </tr>
              ) : products.map((p) => (
                <tr key={p.id} className="row-hover" style={{ transition: 'background 0.1s' }}>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {(p.primary_image_url || p.images?.[0]) ? (
                        <img src={p.primary_image_url || p.images[0]} alt={p.name}
                          style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📦</div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{p.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)' }}>
                    {p.categories?.name || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)' }}>
                    {p.brands?.name || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                    <TierBadge tier={p.delivery_tier} />
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)', textTransform: 'capitalize' }}>
                    {p.unit || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)' }}>
                    {p.gst_percent != null ? `${p.gst_percent}%` : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                    <ActiveBadge isActive={p.is_active} />
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                    <button
                      className="action-btn"
                      onClick={() => router.push(`/admin/products/${p.id}`)}
                      style={{ padding: '5px 14px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                    >
                      Edit →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && products.length > 0 && (
          <div style={{ padding: 'var(--s3) var(--s5)', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-3)' }}>
            Showing {products.length} products{search ? ` matching "${search}"` : ''} · Admin writes only — shops manage their own availability in the Shop Dashboard
          </div>
        )}
      </div>
    </div>
  );
}
