// ─────────────────────────────────────────────────────────────
// (storefront)/track/page.jsx — P13-1
//
// Live order tracking with Leaflet map and Socket.IO.
// No auth required. Reads order_number from ?num= query param.
//
// Features:
//   • Leaflet map showing rider pin + destination pin
//   • Socket.IO /customer namespace for real-time rider:location
//   • Polling fallback (every 10s) if WebSocket disconnects
//   • Animated marker movement between GPS updates
//   • ETA estimation from straight-line distance
//   • Status timeline (existing behaviour preserved)
// ─────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';

// Leaflet must be loaded client-side only (no SSR — uses window)
const RiderMap = dynamic(() => import('./RiderMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 280, borderRadius: 16, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>
      🗺️ Loading map…
    </div>
  ),
});

// ── Constants ─────────────────────────────────────────────────
const POLL_INTERVAL_MS  = 10_000;
const TERMINAL_STATUSES = new Set(['delivered', 'cancelled', 'returned', 'rejected']);

// ── Status helpers ─────────────────────────────────────────────
const STATUS_STEPS = [
  { key: 'pending',        label: 'Order Placed',    icon: '📋' },
  { key: 'confirmed',      label: 'Confirmed',        icon: '✅' },
  { key: 'rider_assigned', label: 'Rider Assigned',   icon: '🏍' },
  { key: 'on_the_way',     label: 'Out for Delivery', icon: '🚴' },
  { key: 'delivered',      label: 'Delivered',        icon: '🎉' },
];

const STATUS_RANK = {
  pending: 0, confirmed: 1, rider_assigned: 2, on_the_way: 3, delivered: 4, cancelled: -1,
};

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function formatRelativeTime(date) {
  if (!date) return '';
  const diff = Math.round((Date.now() - date.getTime()) / 1000);
  if (diff < 5)  return 'just now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.round(diff / 60)}m ago`;
}

// ── Haversine distance (km) ───────────────────────────────────
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── StatusTimeline ────────────────────────────────────────────
function StatusTimeline({ status }) {
  const currentRank = STATUS_RANK[status] ?? 0;
  return (
    <div className="sf-track-timeline">
      {STATUS_STEPS.map((step, idx) => {
        const rank    = STATUS_RANK[step.key] ?? 0;
        const done    = rank <= currentRank && currentRank >= 0;
        const current = step.key === status;
        return (
          <div key={step.key} className={`sf-track-step${done ? ' done' : ''}${current ? ' current' : ''}`}>
            <div className="sf-track-step-dot">
              {done ? <span className="sf-track-check">✓</span> : <span>{idx + 1}</span>}
            </div>
            <div className="sf-track-step-label">
              <span>{step.icon}</span> {step.label}
            </div>
            {idx < STATUS_STEPS.length - 1 && <div className={`sf-track-step-line${done ? ' done' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ── SubOrderCard ──────────────────────────────────────────────
function SubOrderCard({ sub }) {
  const totalRupees = sub.total_amount
    ? `₹${Math.round(sub.total_amount / 100).toLocaleString('en-IN')}`
    : '';
  return (
    <div className="sf-track-suborder">
      <div className="sf-track-suborder-header">
        <span className="sf-track-shop-name">🏪 {sub.shop_name}</span>
        <span className="sf-track-status-badge">
          {STATUS_STEPS.find(s => s.key === sub.status)?.icon || '📦'}{' '}
          {STATUS_STEPS.find(s => s.key === sub.status)?.label || sub.status}
        </span>
      </div>
      {totalRupees && (
        <div className="sf-track-amount">Order Total: <strong>{totalRupees}</strong></div>
      )}
      <div className="sf-track-amount" style={{ textTransform: 'capitalize' }}>
        Payment: {sub.payment_method || 'Online'}
      </div>
      {sub.status === 'on_the_way' && sub.delivery?.rider_phone && (
        <div className="sf-track-rider-info">
          🛵 Your order is on its way!{' '}
          <a href={`tel:${sub.delivery.rider_phone}`} className="sf-track-call-rider">
            Call rider
          </a>
        </div>
      )}
      {sub.delivery && (
        <div className="sf-track-delivery-steps">
          {sub.delivery.assigned_at  && <div className="sf-track-event">🏍 Rider assigned — {formatDate(sub.delivery.assigned_at)}</div>}
          {sub.delivery.picked_up_at && <div className="sf-track-event">📦 Picked up — {formatDate(sub.delivery.picked_up_at)}</div>}
          {sub.delivery.delivered_at && <div className="sf-track-event">✅ Delivered — {formatDate(sub.delivery.delivered_at)}</div>}
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
function TrackSkeleton() {
  return (
    <div className="sf-wrap">
      <div className="sf-track-wrap">
        <div style={{ height: 280, borderRadius: 16, background: 'var(--sf-border)', marginBottom: 20, animation: 'sf-shimmer 1.4s infinite' }} />
        <div style={{ height: 28, width: 200, borderRadius: 8, background: 'var(--sf-border)', marginBottom: 20, animation: 'sf-shimmer 1.4s infinite' }} />
        <div style={{ height: 80, borderRadius: 12, background: 'var(--sf-border)', marginBottom: 20, animation: 'sf-shimmer 1.4s infinite' }} />
        <div style={{ height: 120, borderRadius: 12, background: 'var(--sf-border)', animation: 'sf-shimmer 1.4s infinite' }} />
      </div>
    </div>
  );
}

// ── TrackSearchForm ───────────────────────────────────────────
function TrackSearchForm() {
  return (
    <div className="sf-wrap">
      <div className="sf-track-wrap">
        <h1 className="sf-track-title">Track Your Order</h1>
        <p className="sf-track-sub">Enter your order number (e.g. TN-2026-ABCD) to see delivery status.</p>
        <form action="/track" method="GET" className="sf-track-search-form">
          <input
            type="text"
            name="num"
            className="sf-input"
            placeholder="TN-2026-XXXX"
            style={{ textTransform: 'uppercase', letterSpacing: 1 }}
            required
          />
          <button type="submit" className="sf-checkout-btn" style={{ marginTop: 12 }}>
            Track Order →
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function TrackPage() {
  const searchParams  = useSearchParams();
  const orderNumber   = searchParams.get('num') || searchParams.get('order_number') || '';

  const [trackData,   setTrackData]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState(null);
  const [polling,     setPolling]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [riderPos,    setRiderPos]    = useState(null); // { lat, lng }
  const [, setTick] = useState(0);

  const socketRef = useRef(null);

  if (!orderNumber) return <TrackSearchForm />;

  const fetchOrder = useCallback(async () => {
    try {
      const res  = await fetch(
        `/api/backend/public/orders/track?order_number=${encodeURIComponent(orderNumber.toUpperCase())}`,
        { cache: 'no-store' }
      );
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        setFetchError(json.message || 'Order not found');
        setPolling(false);
        return;
      }

      setTrackData(json.data);
      setFetchError(null);
      setLastUpdated(new Date());

      const statuses = json.data?.sub_orders?.map(s => s.status) || [];
      const isTerminal = statuses.length > 0 && statuses.every(s => TERMINAL_STATUSES.has(s));
      if (isTerminal) setPolling(false);
    } catch {
      setFetchError('Could not reach tracking service. Please try again.');
      setPolling(false);
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  // Poll rider location as fallback
  const pollRiderLocation = useCallback(async () => {
    try {
      const res  = await fetch(`/api/backend/public/orders/track/${orderNumber}/rider-location`);
      const json = await res.json().catch(() => ({}));
      if (json.success && json.data) {
        setRiderPos({ lat: json.data.lat, lng: json.data.lng });
      }
    } catch { /* Non-fatal */ }
  }, [orderNumber]);

  // Initial fetch
  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // Polling — order status every 10s
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(fetchOrder, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [polling, fetchOrder]);

  // Rider location polling fallback (every 10s when no Socket.IO)
  useEffect(() => {
    if (!polling) return;
    pollRiderLocation();
    const interval = setInterval(pollRiderLocation, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [polling, pollRiderLocation]);

  // Socket.IO real-time rider location
  useEffect(() => {
    if (!orderNumber || !trackData) return;

    let socket;
    (async () => {
      try {
        const { io } = await import('socket.io-client');
        const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
        socket = io(`${BACKEND}/customer`, {
          transports: ['websocket', 'polling'],
          query:      { orderId: trackData.id },
          // Public tracking page — no auth token needed for location reads
          auth:       {},
        });

        socket.on('RIDER_LOCATION', (data) => {
          if (typeof data.lat === 'number' && typeof data.lng === 'number') {
            setRiderPos({ lat: data.lat, lng: data.lng });
          }
        });

        socket.on('ORDER_STATUS', () => {
          fetchOrder(); // Refresh order when status changes
        });

        socketRef.current = socket;
      } catch { /* Socket.IO unavailable — polling already covers this */ }
    })();

    return () => {
      if (socket) socket.disconnect();
    };
  }, [orderNumber, trackData?.id, fetchOrder]);

  // Tick every 5s for relative-time refresh
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <TrackSkeleton />;

  // P15-7: Compute ETA — use API data if available, else fall back to local estimate
  let etaText = null;
  let etaMinutes = null;
  let etaProgressPct = 0;
  if (riderPos && trackData?.delivery_address) {
    const destLat = trackData.delivery_address.lat;
    const destLng = trackData.delivery_address.lng;
    if (destLat && destLng) {
      const km  = distanceKm(riderPos.lat, riderPos.lng, destLat, destLng);
      const min = Math.round(km / 0.3 * 2); // ~18km/h fallback
      etaMinutes = min;
      etaText = km < 0.3 ? '🏁 Rider is nearly there!' : `🛵 Rider is ${km.toFixed(1)} km away · ~${min} min`;
      etaProgressPct = Math.min(95, Math.round((1 - km / 5) * 100)); // Assume 5km max
    }
  }

  // Destination pin from first sub_order's shop or delivery address
  const destPin = trackData?.delivery_address
    ? { lat: trackData.delivery_address.lat || 25.5941, lng: trackData.delivery_address.lng || 85.1376 }
    : null;

  return (
    <div className="sf-wrap">
      <div className="sf-track-wrap">
        <h1 className="sf-track-title">Track Order</h1>

        {/* ── Error state ───────────────────────────── */}
        {fetchError && (
          <div className="sf-track-error">
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔍</div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Order Not Found</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--sf-text-3)', marginBottom: 20 }}>{fetchError}</div>
            <a href="/track" className="sf-btn sf-btn-ghost">Try Another Number</a>
          </div>
        )}

        {/* ── Order found ───────────────────────────── */}
        {trackData && (
          <>
            {/* Header */}
            <div className="sf-track-header">
              <div className="sf-track-order-num">#{trackData.order_number}</div>
              <div className="sf-track-placed">Placed: {formatDate(trackData.placed_at)}</div>
              {polling && <span className="sf-track-live-badge">🔴 Live</span>}
              {lastUpdated && (
                <span className="sf-track-updated-label">
                  Updated {formatRelativeTime(lastUpdated)}
                </span>
              )}
            </div>

            {/* P13-1: Live rider map — shown when rider is on the way */}
            {(trackData.status === 'rider_assigned' || trackData.status === 'on_the_way') && (
              <div style={{ marginBottom: 20 }}>
                <RiderMap
                  riderPos={riderPos}
                  destPos={destPin}
                  etaText={etaText}
                />
                {riderPos && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--sf-primary)', fontWeight: 700, marginBottom: 8 }}>
                      {etaText || '🛵 Rider is on the way!'}
                    </div>
                    {/* P15-7: ETA progress bar */}
                    {etaProgressPct > 0 && (
                      <div style={{ margin: '0 auto', maxWidth: 320 }}>
                        <div style={{ background: '#f3f4f6', borderRadius: 10, height: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: 'linear-gradient(90deg, #f97316, #ea580c)', borderRadius: 10, width: `${etaProgressPct}%`, transition: 'width 1s ease' }} />
                        </div>
                        {etaMinutes != null && (
                          <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                            Arriving in approximately {etaMinutes} min
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!riderPos && (
                  <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: 'var(--sf-text-3)' }}>
                    📍 Waiting for rider location…
                  </div>
                )}
              </div>
            )}

            {/* Status timeline */}
            <StatusTimeline status={trackData.status} />

            {trackData.status === 'cancelled' && (
              <div className="sf-track-cancelled-note">
                This order has been cancelled.
              </div>
            )}

            {/* Sub-order cards */}
            <div className="sf-track-suborders">
              <div className="sf-track-suborders-title">Delivery Details</div>
              {(trackData.sub_orders || []).map(sub => (
                <SubOrderCard key={sub.sub_order_id} sub={sub} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
