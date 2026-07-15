'use client';
// ────────────────────────────────────────────────────────────
// Analytics Dashboard — B5
// Design principle: information density over decoration.
// Large numbers, small labels, minimal chrome. No pie charts.
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { analyticsApi } from '../../../lib/api';

// ── Formatting helpers ────────────────────────────────────────
const fmt = {
  paise:   v => `₹${((v || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
  num:     v => (v ?? 0).toLocaleString('en-IN'),
  pct:     v => v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`,
  mins:    v => v == null ? '—' : v < 60 ? `${v}m` : `${Math.floor(v / 60)}h ${v % 60}m`,
  hour:    h => {
    if (h === 0)  return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? `${h}am` : `${h - 12}pm`;
  },
};

// ── Shared card shell ─────────────────────────────────────────
function Card({ title, children, action }) {
  return (
    <div style={css.card}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={css.cardTitle}>{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Big number stat ───────────────────────────────────────────
function Stat({ label, value, sub, trend, warn }) {
  const trendColor = trend == null ? 'var(--text-2)'
    : trend > 0  ? '#16A34A'
    : trend < 0  ? '#DC2626'
    : 'var(--text-2)';
  return (
    <div style={{ ...css.stat, ...(warn ? { borderLeft: '3px solid #DC2626' } : {}) }}>
      <div style={css.statVal}>{value}</div>
      <div style={css.statLabel}>{label}</div>
      {(sub || trend != null) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {trend != null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: trendColor }}>
              {trend > 0 ? '▲' : trend < 0 ? '▼' : '●'} {fmt.pct(trend)}
            </span>
          )}
          {sub && <span style={css.statSub}>{sub}</span>}
        </div>
      )}
    </div>
  );
}

// ── Orders funnel ─────────────────────────────────────────────
function Funnel({ total, confirmed, delivered, cancelled }) {
  if (!total) return <p style={css.empty}>No orders in this period.</p>;
  const confirmedPct  = Math.round((confirmed  / total) * 100);
  const deliveredPct  = Math.round((delivered  / total) * 100);
  const cancelledPct  = Math.round((cancelled  / total) * 100);

  const rows = [
    { label: 'Placed',     value: total,     pct: 100,          color: 'var(--primary)' },
    { label: 'Confirmed',  value: confirmed,  pct: confirmedPct, color: '#2563EB' },
    { label: 'Delivered',  value: delivered,  pct: deliveredPct, color: '#16A34A' },
    { label: 'Cancelled',  value: cancelled,  pct: cancelledPct, color: '#DC2626' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(r => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={css.funnelLabel}>{r.label}</span>
            <span style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700, color: r.color }}>
              {r.value} <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>({r.pct}%)</span>
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${r.pct}%`,
              background: r.color,
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Peak hours bar chart (pure CSS) ──────────────────────────
function PeakHoursChart({ data }) {
  if (!data?.length) return <p style={css.empty}>No data.</p>;

  // Show hours 6am–11pm (indices 6–23) — no one orders cement at 3am
  const visible = data.slice(6, 24);
  const max = Math.max(...visible.map(d => d.orderCount), 1);
  const peakHour = visible.reduce((a, b) => b.orderCount > a.orderCount ? b : a, visible[0]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, marginBottom: 6 }}>
        {visible.map(({ hour, orderCount }) => {
          const isPeak = hour === peakHour.hour;
          const heightPct = max === 0 ? 0 : Math.max(2, (orderCount / max) * 100);
          return (
            <div
              key={hour}
              title={`${fmt.hour(hour)}: ${orderCount} orders`}
              style={{
                flex:          1,
                height:        `${heightPct}%`,
                background:    isPeak ? 'var(--primary)' : 'var(--border)',
                borderRadius:  '3px 3px 0 0',
                transition:    'height 0.5s ease',
                cursor:        'default',
                minHeight:     2,
              }}
            />
          );
        })}
      </div>
      {/* Hour labels — show every 3rd */}
      <div style={{ display: 'flex', gap: 3 }}>
        {visible.map(({ hour }, i) => (
          <div key={hour} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--font)' }}>
            {i % 3 === 0 ? fmt.hour(hour) : ''}
          </div>
        ))}
      </div>
      {peakHour.orderCount > 0 && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>
          🔥 Peak: <strong>{fmt.hour(peakHour.hour)}</strong> with {peakHour.orderCount} order{peakHour.orderCount !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

// ── Delivery time card ────────────────────────────────────────
function DeliveryTimeCard({ avgDeliveryTime }) {
  const { quick, scheduled } = avgDeliveryTime || {};
  const QUICK_TARGET    = 90;
  const SCHED_TARGET    = 480; // 8h = same-day

  const rows = [
    { label: '⚡ Quick',     value: quick,     target: QUICK_TARGET,    targetLabel: '90 min target' },
    { label: '📅 Scheduled', value: scheduled, target: SCHED_TARGET,    targetLabel: '8h target' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map(({ label, value, target, targetLabel }) => {
        const hasData = value != null;
        const ok = hasData && value <= target;
        return (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={css.funnelLabel}>{label}</div>
              <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{targetLabel}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font)', fontSize: 22, fontWeight: 800, color: hasData ? (ok ? '#16A34A' : '#DC2626') : 'var(--text-3)' }}>
                {fmt.mins(value)}
              </div>
              {hasData && (
                <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: ok ? '#16A34A' : '#DC2626' }}>
                  {ok ? '✓ On target' : `▲ ${fmt.mins(value - target)} over`}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Top products table ────────────────────────────────────────
function TopProductsTable({ data, sortKey, onSort }) {
  if (!data?.length) return <p style={css.empty}>No delivered orders in this period.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {[
            { key: null,      label: '#' },
            { key: null,      label: 'Product' },
            { key: 'unitsSold', label: 'Units sold' },
            { key: 'revenue',   label: 'Revenue' },
          ].map(col => (
            <th
              key={col.label}
              onClick={col.key ? () => onSort(col.key) : undefined}
              style={{
                ...css.th,
                cursor:    col.key ? 'pointer' : 'default',
                color:     sortKey === col.key ? 'var(--primary)' : 'var(--text-2)',
                userSelect:'none',
              }}
            >
              {col.label}{sortKey === col.key ? ' ↓' : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={row.productId || i} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ ...css.td, width: 28, color: 'var(--text-3)', fontFamily: 'var(--font)' }}>{i + 1}</td>
            <td style={{ ...css.td, fontFamily: 'var(--font)', fontWeight: 500, color: 'var(--text)' }}>{row.name}</td>
            <td style={{ ...css.td, textAlign: 'right', fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--text)' }}>
              {fmt.num(Math.round(row.unitsSold))}
            </td>
            <td style={{ ...css.td, textAlign: 'right', fontFamily: 'var(--font)', fontWeight: 700, color: '#16A34A' }}>
              {fmt.paise(row.revenue)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Low stock table ───────────────────────────────────────────
function LowStockTable({ data }) {
  if (!data?.length) return (
    <p style={{ ...css.empty, color: '#16A34A' }}>✓ All items adequately stocked.</p>
  );

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {['Product', 'Stock', 'Threshold', 'Action'].map(h => (
            <th key={h} style={css.th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map(row => {
          const isOut = row.currentStock === 0;
          return (
            <tr key={row.inventoryId} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ ...css.td, fontFamily: 'var(--font)', fontWeight: 500, color: 'var(--text)' }}>
                {row.product}
              </td>
              <td style={{ ...css.td, textAlign: 'right' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'var(--font)',
                  background: isOut ? '#FEE2E2' : '#FEF3C7',
                  color:      isOut ? '#DC2626' : '#92400E',
                }}>
                  {isOut ? 'OUT' : row.currentStock}
                </span>
              </td>
              <td style={{ ...css.td, textAlign: 'right', color: 'var(--text-2)', fontFamily: 'var(--font)', fontSize: 13 }}>
                {row.threshold}
              </td>
              <td style={{ ...css.td }}>
                <Link
                  href="/dashboard/inventory"
                  style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}
                >
                  Restock →
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
function Skeleton({ h = 16, w = '100%', mb = 0 }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 6,
      background: 'var(--surface-2)',
      animation: 'pulse 1.4s ease infinite',
      marginBottom: mb,
    }} />
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [period,   setPeriod]   = useState('7d');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [sortKey,  setSortKey]  = useState('revenue');

  const fetch = useCallback(async (p) => {
    setLoading(true);
    setError('');
    try {
      const res = await analyticsApi.getShopAnalytics(p);
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(period); }, [period]);

  const handleSort = (key) => setSortKey(key);

  const topSorted = data?.topProducts
    ? [...data.topProducts].sort((a, b) => b[sortKey] - a[sortKey])
    : [];

  const PERIODS = [
    { key: 'today', label: 'Today' },
    { key: '7d',    label: '7 Days' },
    { key: '30d',   label: '30 Days' },
  ];

  return (
    <div style={{ padding: 'var(--s6)', fontFamily: 'var(--font)', maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s5)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font)', fontWeight: 800, fontSize: 22, color: 'var(--text)', margin: 0 }}>
            Analytics
          </h1>
          <p style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>
            {data?.window
              ? `${new Date(data.window.from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(data.window.to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
              : 'Loading window…'
            }
          </p>
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding:    '7px 18px',
                border:     'none',
                borderRight: '1px solid var(--border)',
                background:  period === p.key ? 'var(--primary)' : 'var(--surface)',
                color:       period === p.key ? '#fff' : 'var(--text)',
                fontFamily:  'var(--font)',
                fontWeight:  period === p.key ? 700 : 400,
                fontSize:    13,
                cursor:      'pointer',
                transition:  'background 0.15s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #DC2626', borderRadius: 'var(--r-md)', padding: 'var(--s4)', marginBottom: 'var(--s5)', color: '#DC2626', fontFamily: 'var(--font)', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* ── Row 1: KPI stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s4)', marginBottom: 'var(--s5)' }}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={css.card}>
              <Skeleton h={36} mb={8} />
              <Skeleton h={14} w="60%" />
            </div>
          ))
        ) : (
          <>
            <Stat
              label="Revenue"
              value={fmt.paise(data?.revenue?.total)}
              trend={data?.revenue?.trend}
              sub={data?.revenue?.trend == null ? 'No prev data' : `vs prev period`}
            />
            <Stat
              label="Orders placed"
              value={fmt.num(data?.orders?.total)}
              sub={`${fmt.num(data?.orders?.delivered)} delivered`}
            />
            <Stat
              label="Cancel rate"
              value={`${data?.orders?.cancelRate ?? 0}%`}
              sub={`${fmt.num(data?.orders?.cancelled)} cancelled`}
              warn={data?.orders?.cancelRate > 10}
            />
            <Stat
              label="⚡ Quick revenue"
              value={fmt.paise(data?.revenue?.byTier?.quick)}
              sub={`📅 ${fmt.paise(data?.revenue?.byTier?.scheduled)} scheduled`}
            />
          </>
        )}
      </div>

      {/* ── Row 2: Funnel + Delivery time ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s4)', marginBottom: 'var(--s5)' }}>
        <Card title="Orders funnel">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={14} mb={10} />)
            : <Funnel
                total={data?.orders?.total}
                confirmed={data?.orders?.confirmed}
                delivered={data?.orders?.delivered}
                cancelled={data?.orders?.cancelled}
              />
          }
        </Card>
        <Card title="Avg. delivery time">
          {loading
            ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} h={40} mb={14} />)
            : <DeliveryTimeCard avgDeliveryTime={data?.avgDeliveryTime} />
          }
        </Card>
      </div>

      {/* ── Row 3: Peak hours (full-width) ── */}
      <div style={{ marginBottom: 'var(--s5)' }}>
        <Card title="Order volume by hour (IST)">
          {loading
            ? <Skeleton h={80} />
            : <PeakHoursChart data={data?.peakHours} />
          }
        </Card>
      </div>

      {/* ── Row 4: Top products + Low stock ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s4)' }}>
        <Card
          title="Top 5 products"
          action={
            <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--text-3)' }}>
              Click column to sort
            </span>
          }
        >
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={14} mb={10} />)
            : <TopProductsTable data={topSorted} sortKey={sortKey} onSort={handleSort} />
          }
        </Card>
        <Card
          title="Low stock alerts"
          action={
            <Link href="/dashboard/inventory" style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
              Manage inventory →
            </Link>
          }
        >
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h={14} mb={10} />)
            : <LowStockTable data={data?.lowStockAlerts} />
          }
        </Card>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const css = {
  card: {
    background:   'var(--surface)',
    border:       '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding:      'var(--s5)',
    boxShadow:    'var(--shadow-sm)',
  },
  cardTitle: {
    fontFamily: 'var(--font)',
    fontWeight: 700,
    fontSize:   15,
    color:      'var(--text)',
  },
  stat: {
    background:   'var(--surface)',
    border:       '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding:      'var(--s5)',
    boxShadow:    'var(--shadow-sm)',
  },
  statVal: {
    fontFamily: 'var(--font)',
    fontWeight: 800,
    fontSize:   28,
    color:      'var(--text)',
    lineHeight:  1.1,
    marginBottom: 4,
  },
  statLabel: {
    fontFamily: 'var(--font)',
    fontSize:   12,
    color:      'var(--text-2)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  statSub: {
    fontFamily: 'var(--font)',
    fontSize:   12,
    color:      'var(--text-3)',
  },
  funnelLabel: {
    fontFamily: 'var(--font)',
    fontSize:   13,
    fontWeight: 600,
    color:      'var(--text)',
  },
  empty: {
    fontFamily: 'var(--font)',
    fontSize:   13,
    color:      'var(--text-3)',
    textAlign:  'center',
    padding:    '20px 0',
  },
  th: {
    padding:       '8px 10px',
    fontSize:      11,
    fontWeight:    700,
    color:         'var(--text-2)',
    textAlign:     'left',
    borderBottom:  '2px solid var(--border)',
    fontFamily:    'var(--font)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background:    'var(--surface-2)',
  },
  td: {
    padding:  '10px 10px',
    fontSize: 13,
    verticalAlign: 'middle',
  },
};
