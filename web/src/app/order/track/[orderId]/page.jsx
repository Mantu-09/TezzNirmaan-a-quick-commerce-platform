'use client';
// ─────────────────────────────────────────────────────────────
// web/src/app/order/track/[orderId]/page.jsx — Order Tracking
// P9-5: TezzNirmaan web storefront
//
// Public page — no auth required.
// Fetches: GET /api/v1/public/orders/track?order_number=:orderId
//
// Shows: status timeline, shop breakdown, delivery timeline.
// Auto-polls every 30 seconds if order is active.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// ── Status config ─────────────────────────────────────────────
const STATUS_STEPS = [
  { key: 'pending',        label: 'Order Placed',       icon: '📝' },
  { key: 'confirmed',      label: 'Confirmed',           icon: '✅' },
  { key: 'rider_assigned', label: 'Rider Assigned',      icon: '🏍️' },
  { key: 'on_the_way',     label: 'On the Way',          icon: '🚀' },
  { key: 'delivered',      label: 'Delivered',           icon: '🎉' },
];

const STATUS_RANK = { pending: 0, confirmed: 1, rider_assigned: 2, on_the_way: 3, delivered: 4, cancelled: -1 };

function getStepIndex(status) {
  return STATUS_RANK[status] ?? 0;
}

// ── Helper ────────────────────────────────────────────────────
function fmtRupee(p) {
  return p ? `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';
}

function fmtTime(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Status Timeline ───────────────────────────────────────────
function StatusTimeline({ currentStatus }) {
  const currentIdx = getStepIndex(currentStatus);
  const isCancelled = currentStatus === 'cancelled';

  if (isCancelled) {
    return (
      <div style={{
        textAlign: 'center', padding: '32px 0',
        color: '#dc2626', fontWeight: 700, fontSize: 18,
      }}>
        ❌ Order Cancelled
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {STATUS_STEPS.map((step, i) => {
        const done    = i <= currentIdx;
        const active  = i === currentIdx;
        const pending = i > currentIdx;

        return (
          <div key={step.key} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: i < STATUS_STEPS.length - 1 ? 0 : 0 }}>
            {/* Indicator + line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                backgroundColor: done ? '#E8521A' : 'var(--surface-2)',
                border: `2px solid ${done ? '#E8521A' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: active ? 18 : 14,
                transition: 'all 0.3s',
                flexShrink: 0,
                boxShadow: active ? '0 0 0 4px rgba(232,82,26,0.2)' : 'none',
              }}>
                {done ? (active ? step.icon : '✓') : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{i + 1}</span>}
              </div>
              {i < STATUS_STEPS.length - 1 && (
                <div style={{
                  width: 2, height: 40, marginTop: 2,
                  backgroundColor: i < currentIdx ? '#E8521A' : 'var(--border)',
                  transition: 'background-color 0.3s',
                }} />
              )}
            </div>

            {/* Label */}
            <div style={{ paddingTop: 6, paddingBottom: 24 }}>
              <div style={{
                fontWeight: done ? 700 : 500,
                fontSize: 15,
                color: done ? 'var(--text)' : 'var(--text-3)',
              }}>
                {step.label}
              </div>
              {active && (
                <div style={{ fontSize: 12, color: '#E8521A', fontWeight: 600, marginTop: 2 }}>
                  Current status
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function OrderTrackPage({ params }) {
  // Next.js 15+ requires React.use() for params in client components
  const resolvedParams = typeof params?.then === 'function' ? use(params) : params;
  const orderId = resolvedParams?.orderId || '';

  const [order,   setOrder]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [lastFetched, setLastFetched] = useState(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res  = await fetch(`${API_URL}/api/v1/public/orders/track?order_number=${encodeURIComponent(orderId.toUpperCase())}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || 'Order not found');
        return;
      }
      setOrder(json.data);
      setError('');
      setLastFetched(new Date());
    } catch (_) {
      setError('Could not connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // ── Auto-poll every 30s while order is active ────────────────
  useEffect(() => {
    const activeStatuses = ['pending', 'confirmed', 'rider_assigned', 'on_the_way'];
    if (!order || !activeStatuses.includes(order.status)) return;

    const t = setInterval(fetchOrder, 30_000);
    return () => clearInterval(t);
  }, [order, fetchOrder]);

  return (
    <div style={{ minHeight: '70vh', padding: 'var(--s8) 0 var(--s12)' }}>
      <div className="container" style={{ maxWidth: 640 }}>

        {/* ── Header ────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <Link href="/" style={{ fontSize: 13, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
            ← Back to Home
          </Link>
          <h1 style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Track Order
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 4 }}>
            Order #{orderId.toUpperCase()}
          </p>
        </div>

        {/* ── Loading ─────────────────────────────── */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[80, 60, 100, 50].map((w, i) => (
              <div key={i} className="skeleton" style={{ height: 20, width: `${w}%` }} />
            ))}
          </div>
        )}

        {/* ── Error ───────────────────────────────── */}
        {!loading && error && (
          <div style={{
            backgroundColor: '#fee2e2', border: '1px solid #dc2626',
            borderRadius: 'var(--r-lg)', padding: 'var(--s6)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>{error}</div>
            <p style={{ fontSize: 14, color: '#7f1d1d' }}>
              Check the order number on your confirmation screen and try again.
            </p>
          </div>
        )}

        {/* ── Order found ─────────────────────────── */}
        {!loading && !error && order && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Timeline card ──────────────────── */}
            <div className="card" style={{ padding: 'var(--s6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>Placed</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{fmtTime(order.placed_at)}</div>
                </div>
                {lastFetched && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Last updated</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtTime(lastFetched.toISOString())}</div>
                  </div>
                )}
              </div>
              <StatusTimeline currentStatus={order.status} />
            </div>

            {/* ── Sub-orders ─────────────────────── */}
            {order.sub_orders.map((sub) => (
              <div key={sub.sub_order_id} className="card" style={{ padding: 'var(--s5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{sub.shop_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>📍 {sub.shop_city}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{fmtRupee(sub.total_amount)}</div>
                    {sub.payment_method === 'cod' && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706', backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>COD</span>
                    )}
                  </div>
                </div>

                {/* Delivery timeline (if rider assigned) */}
                {sub.delivery && (
                  <div style={{
                    backgroundColor: 'var(--surface-2)', borderRadius: 'var(--r-md)',
                    padding: 'var(--s4)', marginTop: 8,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Delivery Timeline
                    </div>
                    {[
                      { ts: sub.delivery.assigned_at,  label: 'Rider assigned' },
                      { ts: sub.delivery.picked_up_at, label: 'Picked up from shop' },
                      { ts: sub.delivery.delivered_at, label: 'Delivered' },
                    ].map(({ ts, label }) => ts && (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-2)' }}>✓ {label}</span>
                        <span style={{ color: 'var(--text-3)' }}>{fmtTime(ts)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* ── App CTA ────────────────────────── */}
            <div style={{
              textAlign: 'center', padding: 'var(--s6)',
              backgroundColor: 'var(--surface-2)', borderRadius: 'var(--r-lg)',
            }}>
              <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 12 }}>
                Get live updates and real-time rider tracking in the app
              </p>
              <a
                href="https://play.google.com/store/apps/details?id=in.tezznirmaan.app"
                className="btn btn-primary"
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 14 }}
              >
                📱 Track in App
              </a>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
