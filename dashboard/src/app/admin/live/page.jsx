'use client';
// ────────────────────────────────────────────────────────────
// /admin/live — P9-3: Founder Live Analytics Dashboard
//
// Designed for phone browser (375px viewport) — the founder
// watches the first real orders come in from their phone.
//
// Features:
//   • 30-second auto-refresh with visible countdown timer
//   • 4 KPI cards: GMV, Orders, Active Deliveries, Cities
//   • Orders-by-city table
//   • Sparkline bar chart (pure CSS, last 24h)
//   • Live order feed (last 10 orders, green flash on new)
//   • Red pulsing dot on "Live" nav link when active_deliveries > 0
//   • All data from GET /admin/analytics/live
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react';
import { liveAnalyticsApi } from '../../../lib/api';

// ── Constants ─────────────────────────────────────────────────
const REFRESH_INTERVAL = 30; // seconds
const PRIMARY   = '#E8521A';
const SUCCESS   = '#16a34a';
const BG        = '#0f1117';
const SURFACE   = '#1a1d27';
const SURFACE2  = '#22263a';
const BORDER    = 'rgba(255,255,255,0.08)';
const TEXT      = '#f1f5f9';
const TEXT2     = '#94a3b8';
const TEXT3     = '#64748b';

// ── Helpers ───────────────────────────────────────────────────
function fmtRupees(r) {
  if (r === undefined || r === null) return '₹0';
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  if (r >= 1000)   return `₹${(r / 1000).toFixed(1)}k`;
  return `₹${r.toLocaleString('en-IN')}`;
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const STATUS_COLOR = {
  pending:          '#94a3b8',
  confirmed:        '#3b82f6',
  preparing:        '#f59e0b',
  ready_for_pickup: '#8b5cf6',
  out_for_delivery: '#06b6d4',
  delivered:        SUCCESS,
  cancelled:        '#ef4444',
};

// ── Sub-components ────────────────────────────────────────────

function KpiCard({ label, value, sub, accent = PRIMARY, pulsing = false }) {
  return (
    <div style={{
      background:   SURFACE,
      border:       `1px solid ${BORDER}`,
      borderTop:    `3px solid ${accent}`,
      borderRadius: 12,
      padding:      '16px 14px',
      flex:         '1 1 0',
      minWidth:     0,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: 6 }}>
        {value}
        {pulsing && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: SUCCESS, flexShrink: 0,
            animation: 'live-pulse 1.5s ease-in-out infinite',
          }} />
        )}
      </div>
      <div style={{ fontSize: 11, color: TEXT2, marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: TEXT3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CityRow({ city, rank, maxOrders }) {
  const pct = maxOrders > 0 ? (city.order_count / maxOrders) * 100 : 0;
  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: SURFACE2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: TEXT3 }}>{rank}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{city.city_name}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: PRIMARY }}>{fmtRupees(city.gmv_rupees)}</span>
          <span style={{ fontSize: 11, color: TEXT3, marginLeft: 8 }}>{city.order_count} orders</span>
        </div>
      </div>
      <div style={{ height: 4, background: SURFACE2, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${PRIMARY}, #f59e0b)`, borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function SparklineChart({ hourlyData }) {
  if (!hourlyData || hourlyData.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: TEXT3, fontSize: 12 }}>
        No orders yet today — first bars appear here
      </div>
    );
  }

  const max = Math.max(...hourlyData.map(h => h.order_count), 1);

  // Build 24 slots (0-23) and fill in data
  const slots = Array.from({ length: 24 }, (_, i) => {
    const slot = hourlyData.find(h => new Date(h.hour).getHours() === i);
    return { hour: i, count: slot?.order_count || 0 };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 48, padding: '0 2px' }}>
      {slots.map(({ hour, count }) => {
        const heightPct = count > 0 ? Math.max((count / max) * 100, 8) : 2;
        const isNow     = hour === new Date().getHours();
        return (
          <div
            key={hour}
            title={`${hour}:00 — ${count} orders`}
            style={{
              flex:         1,
              height:       `${heightPct}%`,
              background:   count > 0
                ? (isNow ? PRIMARY : 'rgba(232,82,26,0.45)')
                : SURFACE2,
              borderRadius: '2px 2px 0 0',
              transition:   'height 0.4s ease',
              position:     'relative',
            }}
          />
        );
      })}
    </div>
  );
}

function SparklineLabels() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTop: `1px solid ${BORDER}` }}>
      {['12am','6am','12pm','6pm','Now'].map(l => (
        <span key={l} style={{ fontSize: 9, color: TEXT3, fontWeight: 500 }}>{l}</span>
      ))}
    </div>
  );
}

function OrderRow({ order, isNew }) {
  const statusColor = STATUS_COLOR[order.status] || TEXT3;
  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      gap:          10,
      padding:      '10px 0',
      borderBottom: `1px solid ${BORDER}`,
      background:   isNew ? 'rgba(22,163,74,0.12)' : 'transparent',
      transition:   'background 1.5s ease',
      borderRadius: 6,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, fontFamily: 'monospace' }}>
          #{order.order_number}
        </div>
        <div style={{ fontSize: 11, color: TEXT3, marginTop: 1 }}>{order.shop_name}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
          {fmtRupees(order.total_rupees)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 2 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: statusColor, fontWeight: 600, textTransform: 'capitalize' }}>
            {order.status?.replace(/_/g, ' ')}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 10, color: TEXT3, flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
        {timeAgo(order.created_at)}
      </div>
    </div>
  );
}

function CountdownRing({ seconds, total = REFRESH_INTERVAL }) {
  const pct = (seconds / total) * 100;
  const r   = 10;
  const c   = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={13} cy={13} r={r} fill="none" stroke={SURFACE2} strokeWidth={2.5} />
      <circle
        cx={13} cy={13} r={r}
        fill="none" stroke={PRIMARY} strokeWidth={2.5}
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function LivePage() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [countdown,  setCountdown]  = useState(REFRESH_INTERVAL);
  const [newOrders,  setNewOrders]  = useState(new Set()); // order_numbers that are "new"
  const prevOrderNos = useRef(new Set());
  const intervalRef  = useRef(null);
  const countRef     = useRef(null);

  const fetchData = useCallback(async (isManual = false) => {
    try {
      if (isManual) setLoading(true);
      const res = await liveAnalyticsApi.getLive();
      const d   = res?.data?.data || res?.data;

      // Detect newly appeared order numbers → flash green
      const incoming = new Set((d?.recent_orders || []).map(o => o.order_number));
      const brandNew  = new Set([...incoming].filter(n => !prevOrderNos.current.has(n)));
      if (brandNew.size > 0 && prevOrderNos.current.size > 0) {
        setNewOrders(brandNew);
        setTimeout(() => setNewOrders(new Set()), 2500); // flash duration
      }
      prevOrderNos.current = incoming;

      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load live data');
    } finally {
      setLoading(false);
      setCountdown(REFRESH_INTERVAL);
    }
  }, []);

  // Initial fetch
  useEffect(() => { fetchData(true); }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    intervalRef.current = setInterval(() => fetchData(), REFRESH_INTERVAL * 1000);
    return () => clearInterval(intervalRef.current);
  }, [fetchData]);

  // Countdown ticker (updates every second)
  useEffect(() => {
    countRef.current = setInterval(() => {
      setCountdown(c => (c <= 1 ? REFRESH_INTERVAL : c - 1));
    }, 1000);
    return () => clearInterval(countRef.current);
  }, []);

  const d           = data;
  const maxOrders   = Math.max(...(d?.cities || []).map(c => c.order_count), 1);
  const isLive      = (d?.today?.active_deliveries || 0) > 0;

  return (
    <>
      {/* ── Keyframes (injected once) ──────────────────────── */}
      <style>{`
        @keyframes live-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.5; transform:scale(1.4); }
        }
        @keyframes spin-in {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        body { background: ${BG} !important; }
      `}</style>

      <div style={{
        maxWidth:   480,
        margin:     '0 auto',
        padding:    '12px 14px 32px',
        fontFamily: 'var(--font, -apple-system, system-ui, sans-serif)',
        color:      TEXT,
        minHeight:  '100vh',
        background: BG,
      }}>

        {/* ── Header ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isLive ? '#22c55e' : TEXT3,
              animation:  isLive ? 'live-pulse 1.5s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px' }}>
              Live — TezzNirmaan
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <CountdownRing seconds={countdown} />
              <span style={{ fontSize: 11, color: TEXT3 }}>{countdown}s</span>
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={loading}
              style={{
                background:   SURFACE,
                border:       `1px solid ${BORDER}`,
                borderRadius: 8,
                padding:      '5px 10px',
                fontSize:     12,
                color:        loading ? TEXT3 : TEXT,
                cursor:       loading ? 'not-allowed' : 'pointer',
                fontWeight:   600,
              }}
            >
              {loading ? '…' : '↺'}
            </button>
          </div>
        </div>

        {/* ── Error ───────────────────────────────────────── */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 14,
            fontSize: 12, color: '#fca5a5',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── KPI Cards (2×2 grid) ─────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <KpiCard
            label="GMV Today"
            value={d ? fmtRupees(d.today?.gmv_rupees) : '—'}
            accent={PRIMARY}
          />
          <KpiCard
            label="Orders Today"
            value={d ? d.today?.orders : '—'}
            accent="#3b82f6"
          />
          <KpiCard
            label="Active Deliveries"
            value={d ? d.today?.active_deliveries : '—'}
            accent={SUCCESS}
            pulsing={isLive}
          />
          <KpiCard
            label="Cities Live"
            value={d ? (d.cities?.length || 0) : '—'}
            accent="#8b5cf6"
            sub={d?.cities?.length > 0 ? d.cities.map(c => c.city_name).join(', ') : null}
          />
        </div>

        {/* ── Orders by City ───────────────────────────── */}
        <Section title="Orders by City" icon="🏙️">
          {!d || d.cities?.length === 0 ? (
            <EmptyState msg="First city order appears here" />
          ) : (
            d.cities.map((city, i) => (
              <CityRow key={city.city_name} city={city} rank={i + 1} maxOrders={maxOrders} />
            ))
          )}
        </Section>

        {/* ── Hourly Sparkline Chart ───────────────────── */}
        <Section title="Orders / Hour (last 24h)" icon="📈">
          <SparklineChart hourlyData={d?.hourly_chart} />
          <SparklineLabels />
        </Section>

        {/* ── Live Order Feed ──────────────────────────── */}
        <Section title={`Recent Orders`} icon="📋" badge={d?.recent_orders?.length}>
          {!d || d.recent_orders?.length === 0 ? (
            <EmptyState msg="First order appears here on launch" />
          ) : (
            d.recent_orders.map(order => (
              <OrderRow
                key={order.order_number}
                order={order}
                isNew={newOrders.has(order.order_number)}
              />
            ))
          )}
        </Section>

        {/* ── Footer timestamp ─────────────────────────── */}
        {d?.timestamp && (
          <div style={{ textAlign: 'center', fontSize: 10, color: TEXT3, marginTop: 20 }}>
            Last synced: {new Date(d.timestamp).toLocaleTimeString('en-IN')}
          </div>
        )}
      </div>
    </>
  );
}

// ── Section wrapper ────────────────────────────────────────────
function Section({ title, icon, badge, children }) {
  return (
    <div style={{
      background:   SURFACE,
      border:       `1px solid ${BORDER}`,
      borderRadius: 12,
      padding:      '14px 14px 6px',
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT, flex: 1 }}>{title}</span>
        {badge > 0 && (
          <span style={{
            background: PRIMARY, color: '#fff',
            fontSize: 10, fontWeight: 700,
            padding: '1px 7px', borderRadius: 20,
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div style={{ padding: '18px 0', textAlign: 'center', color: TEXT3, fontSize: 12 }}>
      {msg}
    </div>
  );
}
