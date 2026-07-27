'use client';
// ────────────────────────────────────────────────────────────
// Admin Analytics — P2-A
// Platform-level GMV dashboard for the platform admin.
//
// Sections:
//   1. KPI row: GMV, Orders, Active Shops, Active Riders
//   2. Daily GMV bar chart (30-day pure-CSS, no library)
//   3. Shop leaderboard (sortable by GMV / orders / rating)
//   4. Cancellation reasons breakdown (horizontal bars)
//   5. Patna delivery heatmap (SVG zones, no maps library)
//   6. Platform health: peak day/hour, tier split, rider avg
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { analyticsApi } from '../../../lib/api';
import {
  fetchCashbackRules, createCashbackRule, updateCashbackRule, deleteCashbackRule,
} from '../../../lib/cashbackApi'; // P4-2B
import {
  fetchPendingSettlements, markSettlementPaid, triggerSettlement,
} from '../../../lib/settlementApi'; // P4-4B
import { TableSkeleton } from '../../../components/skeletons'; // P4-2C

// ── Formatters ────────────────────────────────────────────────
const fmt = {
  paise:  v => `₹${((v || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
  num:    v => (v ?? 0).toLocaleString('en-IN'),
  pct:    v => v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`,
  mins:   v => v == null ? '—' : v < 60 ? `${v}m` : `${Math.floor(v / 60)}h ${v % 60}m`,
  hour:   h => {
    if (h == null) return '—';
    if (h === 0) return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? `${h}am` : `${h - 12}pm`;
  },
  date:   d => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
};

// ── Skeleton ──────────────────────────────────────────────────
function Sk({ h = 16, w = '100%', mb = 0 }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 6, marginBottom: mb,
      background: 'var(--surface-2)',
      animation: 'pulse 1.4s ease infinite',
    }} />
  );
}

// ── Card ──────────────────────────────────────────────────────
function Card({ title, subtitle, children, action, accent }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: 'var(--s5)',
      boxShadow: 'var(--shadow-sm)',
      ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
    }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, icon, accent = 'var(--primary)' }) {
  const trendColor = trend == null ? 'var(--text-3)' : trend > 0 ? '#16a34a' : trend < 0 ? '#dc2626' : 'var(--text-3)';
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: 'var(--s5)',
      boxShadow: 'var(--shadow-sm)', position: 'relative', overflow: 'hidden',
    }}>
      {/* accent stripe */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: '12px 12px 0 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
          {trend != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: trendColor }}>
                {trend > 0 ? '▲' : trend < 0 ? '▼' : '●'} {fmt.pct(trend)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>vs prev period</span>
            </div>
          )}
        </div>
        <div style={{ fontSize: 28, opacity: 0.15, userSelect: 'none' }}>{icon}</div>
      </div>
    </div>
  );
}

// ── Wallet Liability Banner (P4-1C) ──────────────────────────────────
function WalletLiabilityBanner({ data, loading }) {
  const [showTip, setShowTip] = useState(false);
  const liability = data?.wallet_liability;

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(217,119,6,0.10) 0%, rgba(245,158,11,0.06) 100%)',
      border:     '1px solid rgba(217,119,6,0.30)',
      borderLeft: '3px solid #d97706',
      borderRadius: 'var(--r-lg)',
      padding: '14px 20px',
      marginBottom: 'var(--s5)',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 22 }}>💳</span>

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            Outstanding Wallet Balance
          </span>
          {/* Tooltip trigger */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              onClick={() => setShowTip(t => !t)}
              aria-label="What is wallet liability?"
              style={{
                background: 'rgba(217,119,6,0.15)', border: 'none', borderRadius: '50%',
                width: 18, height: 18, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                color: '#92400e', lineHeight: '18px', padding: 0,
              }}
            >?
            </button>
            {showTip && (
              <div
                role="tooltip"
                style={{
                  position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                  background: '#1c1917', color: '#fef3c7', fontSize: 12, borderRadius: 8,
                  padding: '10px 14px', width: 260, zIndex: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)', lineHeight: 1.55,
                }}
              >
                Wallet balances are <strong>platform liabilities</strong> — real money customers
                have deposited or received as cashback that they haven’t spent yet.
                High values may indicate promo over-use or refund accumulation — worth reviewing monthly.
                <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
                  width: 10, height: 10, background: '#1c1917', borderRadius: 2, rotate: '45deg' }} />
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {loading ? (
            <div style={{ height: 28, width: 100, borderRadius: 6, background: 'rgba(217,119,6,0.15)', animation: 'pulse 1.4s ease infinite' }} />
          ) : (
            <>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#92400e', letterSpacing: '-0.02em' }}>
                {fmt.paise(liability?.total_paise)}
              </span>
              <span style={{ fontSize: 13, color: '#78350f' }}>
                across <strong>{fmt.num(liability?.wallet_count)}</strong> customer{liability?.wallet_count !== 1 ? 's' : ''}
              </span>
              {liability?.avg_balance_paise > 0 && (
                <span style={{ fontSize: 12, color: '#a16207', background: 'rgba(217,119,6,0.12)',
                  borderRadius: 4, padding: '2px 8px' }}>
                  avg {fmt.paise(liability.avg_balance_paise)}/customer
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#92400e', background: 'rgba(217,119,6,0.08)',
        borderRadius: 6, padding: '4px 10px', whiteSpace: 'nowrap' }}>
        ⚠️ Money owed to customers
      </div>
    </div>
  );
}

// ── Daily GMV Chart (pure CSS bars) ──────────────────────────
function DailyGmvChart({ data }) {
  const [hovered, setHovered] = useState(null);
  if (!data?.length) return <p style={css.empty}>No data for this period.</p>;

  const max = Math.max(...data.map(d => d.gmv_paise), 1);
  // Show every 5th label to avoid crowding
  const labelStep = Math.max(1, Math.floor(data.length / 6));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100, position: 'relative' }}>
        {data.map((d, i) => {
          const pct = Math.max(2, (d.gmv_paise / max) * 100);
          const isHov = hovered === i;
          return (
            <div
              key={d.date}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              title={`${fmt.date(d.date)}: ${fmt.paise(d.gmv_paise)} · ${d.order_count} orders`}
              style={{
                flex: 1, height: `${pct}%`, minHeight: 2,
                background: isHov ? 'var(--primary)' : d.gmv_paise > 0 ? 'rgba(232,116,12,0.55)' : 'var(--border)',
                borderRadius: '3px 3px 0 0',
                transition: 'all 0.15s',
                cursor: 'default', position: 'relative',
              }}
            >
              {isHov && (
                <div style={{
                  position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--secondary)', color: '#fff', borderRadius: 6,
                  padding: '4px 8px', fontSize: 11, fontWeight: 600,
                  whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                  {fmt.paise(d.gmv_paise)}<br />
                  <span style={{ fontWeight: 400, opacity: 0.8 }}>{fmt.date(d.date)} · {d.order_count} orders</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {data.map((d, i) => (
          <div key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-3)' }}>
            {i % labelStep === 0 ? fmt.date(d.date) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shop Leaderboard ──────────────────────────────────────────
function ShopLeaderboard({ shops, loading }) {
  const [sort, setSort] = useState('gmv_paise');
  if (loading) return <>{[0,1,2,3,4].map(i => <Sk key={i} h={14} mb={10} />)}</>;
  if (!shops?.length) return <p style={css.empty}>No shop revenue data for this period.</p>;

  const sorted = [...shops].sort((a, b) => b[sort] - a[sort]);
  const maxGmv = sorted[0]?.gmv_paise || 1;

  const cols = [
    { key: 'gmv_paise',    label: 'GMV' },
    { key: 'order_count',  label: 'Orders' },
    { key: 'average_rating', label: 'Rating' },
  ];

  return (
    <div>
      {/* Sort pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {cols.map(c => (
          <button key={c.key} onClick={() => setSort(c.key)} style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            border: '1px solid var(--border)', cursor: 'pointer',
            background: sort === c.key ? 'var(--primary)' : 'var(--surface-2)',
            color:      sort === c.key ? '#fff' : 'var(--text-2)',
          }}>{c.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map((shop, i) => {
          const barPct = Math.max(4, (shop.gmv_paise / maxGmv) * 100);
          return (
            <div key={shop.shopId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 20, fontSize: 11, fontWeight: 700, color: i < 3 ? 'var(--primary)' : 'var(--text-3)', textAlign: 'center' }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{shop.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                    {sort === 'gmv_paise' ? fmt.paise(shop.gmv_paise)
                      : sort === 'order_count' ? `${shop.order_count} orders`
                      : shop.average_rating ? `★ ${Number(shop.average_rating).toFixed(1)}` : '—'}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${barPct}%`,
                    background: i === 0 ? 'var(--primary)' : i === 1 ? '#f59e0b' : i === 2 ? '#6366f1' : 'var(--border)',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cancellation Reasons ──────────────────────────────────────
function CancellationChart({ reasons, total, loading }) {
  if (loading) return <>{[0,1,2,3].map(i => <Sk key={i} h={14} mb={10} />)}</>;
  if (!reasons?.length) return <p style={{ ...css.empty, color: '#16a34a' }}>✓ No cancellations in this period.</p>;

  const maxCount = reasons[0]?.count || 1;
  const COLORS   = ['#dc2626','#f59e0b','#6366f1','#0284c7','#16a34a','#ec4899','#8b5cf6','#14b8a6'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {reasons.map((r, i) => {
        const pct = Math.round((r.count / (total || 1)) * 100);
        const barPct = Math.max(4, (r.count / maxCount) * 100);
        return (
          <div key={r.reason}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, maxWidth: '75%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.reason}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS[i % COLORS.length] }}>
                {r.count} <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>({pct}%)</span>
              </span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-2)' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${barPct}%`,
                background: COLORS[i % COLORS.length],
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Patna Delivery Zone SVG Map ───────────────────────────────
function PatnaMap({ gmv, orders }) {
  // Simplified SVG representation of Patna zones (no maps library)
  const zones = [
    { id: 'Patna City',     cx: 72,  cy: 55,  r: 16, label: 'Patna City',   traffic: 'high' },
    { id: 'Boring Road',    cx: 128, cy: 60,  r: 14, label: 'Boring Rd',    traffic: 'high' },
    { id: 'Kankarbagh',     cx: 170, cy: 72,  r: 12, label: 'Kankarbagh',   traffic: 'medium' },
    { id: 'Bailey Road',    cx: 115, cy: 38,  r: 11, label: 'Bailey Rd',    traffic: 'medium' },
    { id: 'Danapur',        cx: 42,  cy: 68,  r: 10, label: 'Danapur',      traffic: 'low' },
    { id: 'Rajendra Nagar', cx: 95,  cy: 82,  r: 10, label: 'Raj. Nagar',   traffic: 'medium' },
    { id: 'Ashok Rajpath',  cx: 148, cy: 44,  r: 9,  label: 'Ashok Rajpath',traffic: 'low' },
    { id: 'Phulwari',       cx: 58,  cy: 90,  r: 8,  label: 'Phulwari',     traffic: 'low' },
  ];
  const colorMap = { high: '#e8740c', medium: '#f59e0b', low: '#0284c7' };

  return (
    <div>
      <svg viewBox="0 0 220 120" style={{ width: '100%', maxHeight: 180, borderRadius: 8, background: 'var(--surface-2)' }}>
        {/* Ganges River (approx) */}
        <path d="M 0 15 Q 55 8 110 18 Q 165 28 220 22" stroke="#0284c7" strokeWidth="6" fill="none" opacity="0.3" />
        <text x="160" y="14" fontSize="6" fill="#0284c7" opacity="0.6">Ganges</text>

        {/* Roads */}
        <line x1="20" y1="60" x2="200" y2="60" stroke="var(--border)" strokeWidth="1.5" />
        <line x1="115" y1="25" x2="115" y2="105" stroke="var(--border)" strokeWidth="1.5" />
        <line x1="60" y1="38" x2="185" y2="80" stroke="var(--border)" strokeWidth="1" strokeDasharray="3,3" />

        {/* Zone circles */}
        {zones.map(z => (
          <g key={z.id}>
            <circle
              cx={z.cx} cy={z.cy} r={z.r}
              fill={colorMap[z.traffic]}
              opacity="0.25"
            />
            <circle
              cx={z.cx} cy={z.cy} r={z.r * 0.45}
              fill={colorMap[z.traffic]}
              opacity="0.75"
            />
            <text
              x={z.cx} y={z.cy + z.r + 7}
              textAnchor="middle" fontSize="5.5"
              fill="var(--text-2)" fontFamily="var(--font)"
            >
              {z.label}
            </text>
          </g>
        ))}

        {/* Shop marker */}
        <circle cx="128" cy="60" r="3" fill="var(--primary)" />
        <text x="128" y="52" textAnchor="middle" fontSize="5" fill="var(--primary)" fontWeight="bold">SHOP</text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
        {[['high', '#e8740c', 'High traffic'], ['medium', '#f59e0b', 'Medium'], ['low', '#0284c7', 'Low / expanding']].map(([k, c, l]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.75 }} />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{l}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{fmt.paise(gmv)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Total GMV</div>
        </div>
        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0284c7' }}>{fmt.num(orders)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Total Orders</div>
        </div>
      </div>
    </div>
  );
}

// ── Platform Health Row ───────────────────────────────────────
function HealthMetric({ label, value, sub, color = 'var(--primary)' }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 8px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AdminAnalyticsPage() {
  const [period,  setPeriod]  = useState('30d');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async (p) => {
    setLoading(true);
    setError('');
    try {
      const res = await analyticsApi.getPlatformAnalytics(p);
      setData(res.data || res);
    } catch (e) {
      setError(e.message || 'Failed to load platform analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const PERIODS = [
    { key: 'today', label: 'Today' },
    { key: '7d',   label: '7 Days' },
    { key: '30d',  label: '30 Days' },
  ];

  const d = data; // alias

  return (
    <div style={{ fontFamily: 'var(--font)', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s5)' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
            Platform Analytics
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0' }}>
            Cross-shop GMV, orders, and operational health
          </p>
        </div>
        {/* Period selector */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)} style={{
              padding: '7px 18px', border: 'none',
              borderRight: '1px solid var(--border)',
              background:  period === p.key ? 'var(--primary)' : 'var(--surface)',
              color:       period === p.key ? '#fff' : 'var(--text)',
              fontWeight:  period === p.key ? 700 : 400,
              fontSize: 13, cursor: 'pointer', transition: 'background 0.15s',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #dc2626', borderRadius: 8, padding: 14, marginBottom: 20, color: '#dc2626', fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Row 1: KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s4)', marginBottom: 'var(--s5)' }}>
        {loading ? [0,1,2,3].map(i => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 'var(--s5)' }}>
            <Sk h={36} mb={8} /><Sk h={14} w="60%" />
          </div>
        )) : (
          <>
            <KpiCard
              data-testid="gmv-card"
              icon="💰" label="Gross Merchandise Value" accent="var(--primary)"
              value={fmt.paise(d?.gmv?.total_paise)}
              trend={d?.gmv?.trend_vs_previous}
              sub={`Quick: ${fmt.paise(d?.gmv?.by_tier?.quick_paise)} · Sched: ${fmt.paise(d?.gmv?.by_tier?.scheduled_paise)}`}
            />
            <KpiCard
              icon="📦" label="Total Orders" accent="#0284c7"
              value={fmt.num(d?.orders?.total)}
              sub={`${fmt.num(d?.orders?.completed)} delivered · ${d?.orders?.cancel_rate ?? 0}% cancel rate`}
            />
            <KpiCard
              icon="🏪" label="Active Shops" accent="#16a34a"
              value={fmt.num(d?.shops?.total_active)}
              sub={d?.shops?.new_this_period ? `+${d.shops.new_this_period} new this period` : 'No new shops'}
            />
            <KpiCard
              icon="🛵" label="Active Riders" accent="#7c3aed"
              value={fmt.num(d?.riders?.total_active)}
              sub={d?.riders?.avg_deliveries_per_day ? `~${d.riders.avg_deliveries_per_day} deliveries/rider/day` : 'No delivery data'}
            />
          </>
        )}
      </div>

      {/* ── Wallet Liability Banner (P4-1C) ── */}
      <div data-testid="wallet-liability-card">
        <WalletLiabilityBanner data={d} loading={loading} />
      </div>

      {/* ── Row 2: Daily GMV chart (full width) ── */}
      <div style={{ marginBottom: 'var(--s5)' }}>
        <Card
          title="Daily GMV"
          subtitle={`${period === 'today' ? 'Today vs Yesterday' : period === '7d' ? 'Last 7 days' : 'Last 30 days'} · hover bars for detail`}
          accent="var(--primary)"
        >
          {loading ? <Sk h={100} /> : <DailyGmvChart data={d?.daily_gmv} />}
        </Card>
      </div>

      {/* ── Row 3: Shop Leaderboard + Cancellation reasons ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 'var(--s4)', marginBottom: 'var(--s5)' }}>
        <Card title="Shop Leaderboard" subtitle="Top shops by revenue · click pills to sort" accent="#f59e0b">
          <ShopLeaderboard shops={d?.shops?.top_by_revenue} loading={loading} />
        </Card>

        <Card title="Cancellation Reasons" subtitle={`${fmt.num(d?.orders?.cancelled)} cancelled orders`} accent="#dc2626">
          <CancellationChart
            reasons={d?.cancellation_reasons}
            total={d?.orders?.cancelled}
            loading={loading}
          />
        </Card>
      </div>

      {/* ── Row 4: Patna Map + Platform Health ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s4)' }}>
        <Card title="Patna Delivery Zones" subtitle="Active coverage map · multi-city expansion planned">
          {loading
            ? <Sk h={180} />
            : <PatnaMap gmv={d?.cities?.patna?.gmv_paise} orders={d?.cities?.patna?.orders} />
          }
        </Card>

        <Card title="Platform Health" subtitle="Operational metrics">
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[0,1,2,3,4,5].map(i => <Sk key={i} h={60} />)}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <HealthMetric
                  label="Peak Day"
                  value={d?.peak_day ?? '—'}
                  sub="Most orders placed"
                  color="var(--primary)"
                />
                <HealthMetric
                  label="Peak Hour"
                  value={fmt.hour(d?.peak_hour)}
                  sub="Busiest hour (IST)"
                  color="#7c3aed"
                />
                <HealthMetric
                  label="Avg Delivery Time"
                  value={fmt.mins(d?.riders?.avg_delivery_time_minutes)}
                  sub="Confirmed → delivered"
                  color={d?.riders?.avg_delivery_time_minutes <= 90 ? '#16a34a' : '#f59e0b'}
                />
                <HealthMetric
                  label="Platform Take Rate"
                  value={`${((d?.take_rate || 0.05) * 100).toFixed(0)}%`}
                  sub="Commission placeholder"
                  color="#0284c7"
                />
                <HealthMetric
                  label="Potential Commission"
                  value={fmt.paise((d?.gmv?.total_paise || 0) * (d?.take_rate || 0.05))}
                  sub="At current take rate"
                  color="#16a34a"
                />
                <HealthMetric
                  label="Cancel Rate"
                  value={`${d?.orders?.cancel_rate ?? 0}%`}
                  sub={d?.orders?.cancel_rate > 10 ? '⚠️ Above 10% threshold' : '✓ Within target'}
                  color={d?.orders?.cancel_rate > 10 ? '#dc2626' : '#16a34a'}
                />
              </div>

              {/* Tier split bar */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Revenue by Tier
                </div>
                {(() => {
                  const quick = d?.gmv?.by_tier?.quick_paise || 0;
                  const sched = d?.gmv?.by_tier?.scheduled_paise || 0;
                  const total = quick + sched || 1;
                  const qPct  = Math.round((quick / total) * 100);
                  return (
                    <>
                      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{ width: `${qPct}%`, background: 'var(--primary)', transition: 'width 0.5s' }} />
                        <div style={{ flex: 1, background: '#0284c7' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          <span style={{ color: 'var(--primary)', fontWeight: 700 }}>⚡ Quick</span>
                          {' '}{fmt.paise(quick)} ({qPct}%)
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          <span style={{ color: '#0284c7', fontWeight: 700 }}>📅 Scheduled</span>
                          {' '}{fmt.paise(sched)} ({100 - qPct}%)
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ── P4-2B: Cashback Rules Management ── */}
      {/* P4-2C: Wrapped in Suspense — cashback table loads async, rest of page renders immediately */}
      <Suspense fallback={<TableSkeleton rows={4} cols={6} />}>
        <CashbackRulesManager />
      </Suspense>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

// ── Cashback Rules Manager (P4-2B) ───────────────────────────
function CashbackRulesManager() {
  const [rules,      setRules]    = useState([]);
  const [loading,    setLoading]  = useState(true);
  const [error,      setError]    = useState(null);
  const [editId,     setEditId]   = useState(null);   // rule being inline-edited
  const [editPct,    setEditPct]  = useState('');
  const [saving,     setSaving]   = useState(false);
  const [showAdd,    setShowAdd]  = useState(false);
  const [newRule,    setNewRule]  = useState({ min_order_paise: 0, max_order_paise: '', cashback_percent: '', shop_id: '' });
  const [preview,    setPreview]  = useState({ amount: '', result: null });

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const data = await fetchCashbackRules();
      setRules(data);
    } catch (e) {
      setError(e.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (rule) => {
    try {
      await updateCashbackRule(rule.id, { is_active: !rule.is_active });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
    } catch (e) { alert('Failed: ' + e.message); }
  };

  const handleSavePct = async (ruleId) => {
    const pct = parseFloat(editPct);
    if (isNaN(pct) || pct < 0 || pct > 100) return alert('Invalid %');
    try {
      setSaving(true);
      const updated = await updateCashbackRule(ruleId, { cashback_percent: pct });
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, ...updated } : r));
      setEditId(null);
    } catch (e) { alert('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (ruleId) => {
    if (!confirm('Deactivate this rule?')) return;
    try {
      await deleteCashbackRule(ruleId);
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, is_active: false } : r));
    } catch (e) { alert('Failed: ' + e.message); }
  };

  const handleAdd = async () => {
    try {
      setSaving(true);
      const pct = parseFloat(newRule.cashback_percent);
      if (isNaN(pct)) return alert('Invalid %');
      const created = await createCashbackRule({
        ...newRule,
        max_order_paise:  newRule.max_order_paise  ? parseInt(newRule.max_order_paise)  : null,
        shop_id:          newRule.shop_id          || null,
        cashback_percent: pct,
      });
      setRules(prev => [...prev, created]);
      setShowAdd(false);
      setNewRule({ min_order_paise: 0, max_order_paise: '', cashback_percent: '', shop_id: '' });
    } catch (e) { alert('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const handlePreview = () => {
    const amtPaise = parseInt(preview.amount) * 100;
    if (isNaN(amtPaise) || amtPaise <= 0) return;
    const tiers = [{ min: 0, max: 49999, pct: 1 }, { min: 50000, max: 199999, pct: 2 }, { min: 200000, max: null, pct: 3 }];
    const tier  = tiers.find(t => amtPaise >= t.min && (t.max === null || amtPaise <= t.max));
    if (!tier) return setPreview(p => ({ ...p, result: 'No rule matches' }));
    const cashback = Math.floor(amtPaise * tier.pct / 100);
    setPreview(p => ({ ...p, result: `₹${cashback / 100} (${tier.pct}% of ₹${preview.amount})` }));
  };

  const fmt2 = v => v == null ? '∞' : `₹${(v / 100).toLocaleString('en-IN')}`;

  return (
    <div style={{ marginTop: 'var(--s5)' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', padding: 'var(--s5)',
        boxShadow: 'var(--shadow-sm)', borderLeft: '3px solid #059669',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>💰 Cashback Rules</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Awarded on delivery · expires 90 days · shop rules override platform rules
            </div>
          </div>
          <button
            onClick={() => setShowAdd(s => !s)}
            style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >+ Add Rule</button>
        </div>

        {/* Add rule form */}
        {showAdd && (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12, color: '#166534' }}>Min order (₹)
              <input type="number" value={newRule.min_order_paise / 100} onChange={e => setNewRule(p => ({ ...p, min_order_paise: parseInt(e.target.value || 0) * 100 }))}
                style={{ display: 'block', marginTop: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid #BBF7D0', width: 100 }} /></label>
            <label style={{ fontSize: 12, color: '#166534' }}>Max order (₹, blank=∞)
              <input type="number" value={newRule.max_order_paise ? newRule.max_order_paise / 100 : ''} onChange={e => setNewRule(p => ({ ...p, max_order_paise: e.target.value ? parseInt(e.target.value) * 100 : '' }))}
                style={{ display: 'block', marginTop: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid #BBF7D0', width: 100 }} /></label>
            <label style={{ fontSize: 12, color: '#166534' }}>Cashback %
              <input type="number" step="0.1" value={newRule.cashback_percent} onChange={e => setNewRule(p => ({ ...p, cashback_percent: e.target.value }))}
                style={{ display: 'block', marginTop: 4, padding: '4px 8px', borderRadius: 6, border: '1px solid #BBF7D0', width: 80 }} /></label>
            <button onClick={handleAdd} disabled={saving}
              style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontWeight: 600 }}>Save</button>
            <button onClick={() => setShowAdd(false)}
              style={{ background: 'transparent', border: '1px solid #BBF7D0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#166534' }}>Cancel</button>
          </div>
        )}

        {loading ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-3)' }}>Loading…</div>
          : error ? <div style={{ color: '#dc2626', padding: 10 }}>{error}</div>
          : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Min Order', 'Max Order', 'Cashback %', 'Scope', 'Active', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: 'var(--text-2)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} style={{ borderBottom: '1px solid var(--border)', opacity: rule.is_active ? 1 : 0.45 }}>
                  <td style={{ padding: '8px 10px' }}>{fmt2(rule.min_order_paise)}</td>
                  <td style={{ padding: '8px 10px' }}>{fmt2(rule.max_order_paise)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {editId === rule.id ? (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="number" step="0.1" value={editPct} onChange={e => setEditPct(e.target.value)}
                          style={{ width: 60, padding: '2px 6px', borderRadius: 4, border: '1px solid #059669' }} autoFocus />
                        <button onClick={() => handleSavePct(rule.id)} disabled={saving}
                          style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>✓</button>
                        <button onClick={() => setEditId(null)}
                          style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>✕</button>
                      </span>
                    ) : (
                      <span>
                        <strong style={{ color: '#059669' }}>{Number(rule.cashback_percent).toFixed(2)}%</strong>
                        <button onClick={() => { setEditId(rule.id); setEditPct(rule.cashback_percent); }}
                          style={{ marginLeft: 8, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-3)' }}>✏️</button>
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 11, borderRadius: 4, padding: '2px 8px', background: rule.shop_id ? '#FEF3C7' : '#DBEAFE', color: rule.shop_id ? '#92400E' : '#1E40AF' }}>
                      {rule.shop_id ? `Shop: ${rule.shops?.name || rule.shop_id.slice(0, 8)}` : 'Platform-wide'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <button onClick={() => handleToggle(rule)}
                      style={{ background: rule.is_active ? '#059669' : 'var(--surface-2)', color: rule.is_active ? '#fff' : 'var(--text-3)', border: 'none', borderRadius: 12, padding: '2px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      {rule.is_active ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {rule.is_active && (
                      <button onClick={() => handleDelete(rule.id)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 12 }}>Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Preview calculator */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>Preview cashback:</span>
          <input
            type="number" placeholder="Order amount in ₹" value={preview.amount}
            onChange={e => setPreview({ amount: e.target.value, result: null })}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, width: 160 }}
          />
          <button onClick={handlePreview}
            style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>Calculate</button>
          {preview.result && (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{preview.result}</span>
          )}
        </div>
      </div>

      {/* P4-4B: Settlements — pending payouts to shop owners */}
      <SettlementsSection />
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────
const css = {
  empty: {
    fontSize: 13, color: 'var(--text-3)',
    textAlign: 'center', padding: '20px 0',
  },
};

// ── P4-4B: Admin Settlements Section ───────────────────────────
function SettlementsSection() {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [payModal, setPayModal]   = useState(null); // batch to pay
  const [payForm, setPayForm]     = useState({ method: 'upi', ref: '', notes: '' });
  const [paying, setPaying]       = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [trigMsg, setTrigMsg]     = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchPendingSettlements()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePay = async () => {
    if (!payModal || !payForm.ref.trim()) return;
    setPaying(true);
    try {
      await markSettlementPaid(payModal.id, {
        payment_method:    payForm.method,
        payment_reference: payForm.ref.trim(),
        notes:             payForm.notes.trim() || undefined,
      });
      setPayModal(null);
      setPayForm({ method: 'upi', ref: '', notes: '' });
      load();
    } catch (e) {
      alert('Error: ' + (e.message || 'Failed to mark as paid'));
    } finally {
      setPaying(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    setTrigMsg(null);
    try {
      const result = await triggerSettlement();
      setTrigMsg(`✅ ${result.message}`);
      load();
    } catch (e) {
      setTrigMsg('❌ ' + (e.message || 'Failed to trigger settlement'));
    } finally {
      setTriggering(false);
    }
  };

  const fmtPaise = (p) =>
    `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const batches  = data?.batches || [];
  const outstanding = data?.total_outstanding_paise || 0;

  return (
    <div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>💰 Settlements</h2>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
            Pending payouts to shop owners
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Total outstanding KPI */}
          <div style={{
            background: outstanding > 0 ? 'rgba(245,158,11,0.1)' : 'var(--surface-2)',
            border: `1px solid ${outstanding > 0 ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
            borderRadius: 10, padding: '8px 16px',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Outstanding: </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: outstanding > 0 ? '#d97706' : 'var(--text)' }}>
              {fmtPaise(outstanding)}
            </span>
          </div>
          {/* Manual trigger */}
          <button
            onClick={handleTrigger}
            disabled={triggering}
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text-2)',
              fontWeight: 600,
            }}
          >
            {triggering ? 'Running…' : '▶ Run now'}
          </button>
          <button
            onClick={load}
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--text-2)',
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Trigger result message */}
      {trigMsg && (
        <div style={{
          fontSize: 12, padding: '8px 14px', borderRadius: 8, marginBottom: 16,
          background: trigMsg.startsWith('✅') ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
          border: `1px solid ${trigMsg.startsWith('✅') ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}`,
          color: trigMsg.startsWith('✅') ? '#16a34a' : '#dc2626',
        }}>
          {trigMsg}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={4} />
      ) : !batches.length ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: 13 }}>
          No pending settlements. All shops are up-to-date.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Shop', 'Period', 'Orders', 'Gross', 'Commission', 'Net', 'Status', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 14px', textAlign: i >= 3 && i <= 5 ? 'right' : 'left',
                    fontWeight: 600, fontSize: 11, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: 0.3,
                    borderBottom: '1px solid var(--border)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((b, i) => (
                <tr key={b.id} style={{
                  borderBottom: '1px solid var(--border)',
                  background: i % 2 === 0 ? 'var(--background)' : 'var(--surface)',
                }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text)' }}>
                    {b.shops?.name || '—'}
                    {b.shops?.phone && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400, marginTop: 2 }}>
                        {b.shops.phone}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-3)', fontSize: 12 }}>
                    {fmtDate(b.period_start)} – {fmtDate(b.period_end)}
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-3)' }}>{b.order_count}</td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', color: 'var(--text-2)' }}>
                    {fmtPaise(b.gross_amount_paise)}
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', color: '#dc2626', fontSize: 12 }}>
                    −{fmtPaise(b.commission_paise)}
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                    {fmtPaise(b.net_amount_paise)}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: b.status === 'processing' ? 'rgba(59,130,246,0.1)' : 'rgba(245,158,11,0.1)',
                      color: b.status === 'processing' ? '#2563eb' : '#d97706',
                    }}>
                      {b.status === 'processing' ? 'Processing' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                    <button
                      onClick={() => { setPayModal(b); setPayForm({ method: 'upi', ref: '', notes: '' }); }}
                      style={{
                        background: 'var(--primary)', color: '#fff', border: 'none',
                        borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      }}
                    >
                      Mark paid
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mark Paid Modal */}
      {payModal && (
        <>
          <div
            onClick={() => setPayModal(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 299 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--surface)', borderRadius: 16, padding: 28,
            width: '100%', maxWidth: 440, zIndex: 300,
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--text)' }}>Mark Settlement as Paid</h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 20px' }}>
              {payModal.shops?.name} — <strong style={{ color: 'var(--primary)' }}>{fmtPaise(payModal.net_amount_paise)}</strong>
            </p>

            {/* Payment method */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Payment method</label>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {['upi', 'bank_transfer'].map(m => (
                <button
                  key={m}
                  onClick={() => setPayForm(f => ({ ...f, method: m }))}
                  style={{
                    flex: 1, padding: '8px 0', border: `2px solid ${payForm.method === m ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 8, background: payForm.method === m ? 'rgba(var(--primary-rgb),0.08)' : 'var(--background)',
                    color: payForm.method === m ? 'var(--primary)' : 'var(--text-3)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
                    transition: 'all 0.15s',
                  }}
                >
                  {m === 'upi' ? 'UPI' : 'Bank Transfer'}
                </button>
              ))}
            </div>

            {/* Reference */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
              {payForm.method === 'upi' ? 'UPI Transaction ID' : 'Bank Reference / UTR'} *
            </label>
            <input
              value={payForm.ref}
              onChange={e => setPayForm(f => ({ ...f, ref: e.target.value }))}
              placeholder={payForm.method === 'upi' ? 'e.g. 419312345678' : 'e.g. SBIN0001234'}
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
                borderRadius: 8, fontSize: 13, background: 'var(--background)',
                color: 'var(--text)', marginBottom: 14, boxSizing: 'border-box',
              }}
            />

            {/* Notes */}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Notes (optional)</label>
            <textarea
              value={payForm.notes}
              onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Any note for the shop owner..."
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
                borderRadius: 8, fontSize: 13, background: 'var(--background)',
                color: 'var(--text)', marginBottom: 20, resize: 'vertical', boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setPayModal(null)}
                style={{
                  flex: 1, padding: '10px 0', border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--background)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePay}
                disabled={!payForm.ref.trim() || paying}
                style={{
                  flex: 2, padding: '10px 0', border: 'none', borderRadius: 8,
                  background: !payForm.ref.trim() || paying ? 'var(--surface-2)' : 'var(--primary)',
                  color: !payForm.ref.trim() || paying ? 'var(--text-3)' : '#fff',
                  cursor: !payForm.ref.trim() || paying ? 'default' : 'pointer',
                  fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
                }}
              >
                {paying ? 'Processing…' : '✔ Confirm Payment'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
