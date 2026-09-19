'use client';
// ────────────────────────────────────────────────────────────
// Admin Cities Page — P4-4A
//
// /admin/cities
//
// Sections:
//   1. City list table: name, status badge, shop/order counts, GMV
//   2. Toggle active/inactive per city
//   3. "Activate City" button with confirmation modal
//   4. Per-city analytics drawer (top shops, GMV, avg delivery time)
//   5. Waitlist count per coming-soon city
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { fetchCities, fetchCityAnalytics, toggleCity, activateCity } from '../../../lib/cityApi';

// ── Formatters ─────────────────────────────────────────────
const fmt = {
  paise:  (v) => `₹${((v || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
  num:    (v) => (v ?? 0).toLocaleString('en-IN'),
  date:   (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  mins:   (v) => v == null ? '—' : v < 60 ? `${v}m` : `${Math.floor(v / 60)}h ${v % 60}m`,
};

// ── Status Badge ───────────────────────────────────────────
function StatusBadge({ active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
      background: active ? 'rgba(22,163,74,0.12)' : 'rgba(100,116,139,0.12)',
      color: active ? '#16a34a' : '#64748b',
      border: `1px solid ${active ? 'rgba(22,163,74,0.3)' : 'rgba(100,116,139,0.3)'}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? '#16a34a' : '#94a3b8',
        boxShadow: active ? '0 0 4px #16a34a' : 'none',
      }} />
      {active ? 'Active' : 'Coming Soon'}
    </span>
  );
}

// ── Confirm Modal ──────────────────────────────────────────
function ConfirmModal({ city, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', padding: 32, maxWidth: 440, width: '90%',
        boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>🚀</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>
          Activate {city.name}?
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
          This will set <strong>{city.name}</strong> to <em>Active</em>, set the launch date to today, and send an internal notification.
          Customers will immediately be able to select this city in the app.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 'var(--r-md)',
              border: 'none', background: 'var(--primary)',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Activate City
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Analytics Drawer ───────────────────────────────────────
function AnalyticsDrawer({ cityId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCityAnalytics(cityId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [cityId]);

  const city       = data?.city;
  const analytics  = data?.analytics;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 150,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        style={{
          width: 420, height: '100%', background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.2)',
          overflowY: 'auto', padding: 28,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>
              {loading ? '...' : city?.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>City Analytics</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-3)' }}>✕</button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--primary)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Total Orders',     value: fmt.num(analytics?.total_orders) },
                { label: 'Delivered',         value: fmt.num(analytics?.delivered_orders) },
                { label: 'GMV',               value: fmt.paise(analytics?.gmv_paise) },
                { label: 'Avg Delivery',      value: fmt.mins(analytics?.avg_delivery_time_mins) },
                { label: 'Waitlist Signups',  value: fmt.num(analytics?.waitlist_count) },
                { label: 'Launch Date',       value: fmt.date(city?.launch_date) },
              ].map((k) => (
                <div key={k.label} style={{
                  background: 'var(--bg)', borderRadius: 'var(--r-md)',
                  padding: '12px 14px', border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Top Shops */}
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 12 }}>
              Top Shops by GMV
            </div>
            {analytics?.top_shops?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {analytics.top_shops.map((shop, i) => (
                  <div key={shop.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--bg)', borderRadius: 'var(--r-md)',
                    padding: '10px 12px', border: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : '#cd7c2b',
                      color: '#fff', fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>#{i + 1}</div>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{shop.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{fmt.paise(shop.gmv_paise)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20, padding: '12px 0' }}>No orders yet in this city.</div>
            )}

            {/* Map hint */}
            <div style={{
              background: 'rgba(var(--primary-rgb, 232,116,12),0.08)',
              border: '1px solid rgba(var(--primary-rgb, 232,116,12),0.2)',
              borderRadius: 'var(--r-md)', padding: '12px 14px',
              fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6,
            }}>
              📍 <strong>{city?.name}</strong> centre: {city?.center_lat?.toFixed(4)}°N, {city?.center_lng?.toFixed(4)}°E
              &nbsp;·&nbsp; {city?.delivery_radius_km} km radius
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────
export default function CitiesPage() {
  const [cities, setCities]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [activating, setActivating] = useState(null); // city being confirmed
  const [toggling, setToggling]     = useState(null); // cityId being toggled
  const [drawer, setDrawer]         = useState(null); // cityId for analytics drawer
  const [toast, setToast]           = useState(null); // { msg, ok }

  const load = useCallback(() => {
    setLoading(true);
    fetchCities()
      .then((d) => setCities(d?.cities || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleToggle = async (city) => {
    const newActive = !city.is_active;
    if (newActive) {
      // Activation requires confirmation modal
      setActivating(city);
      return;
    }
    setToggling(city.id);
    try {
      await toggleCity(city.id, false);
      showToast(`${city.name} set to Coming Soon`);
      load();
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setToggling(null);
    }
  };

  const handleActivateConfirm = async () => {
    const city = activating;
    setActivating(null);
    setToggling(city.id);
    try {
      await activateCity(city.id);
      showToast(`🚀 ${city.name} is now live!`);
      load();
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 300,
          padding: '12px 20px', borderRadius: 'var(--r-md)',
          background: toast.ok ? '#16a34a' : '#dc2626',
          color: '#fff', fontWeight: 600, fontSize: 14,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          animation: 'slideUp 0.3s ease',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Confirm Modal */}
      {activating && (
        <ConfirmModal
          city={activating}
          onConfirm={handleActivateConfirm}
          onCancel={() => setActivating(null)}
        />
      )}

      {/* Analytics Drawer */}
      {drawer && (
        <AnalyticsDrawer cityId={drawer} onClose={() => setDrawer(null)} />
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>
            🏙️ City Operations
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
            Bihar expansion — manage city rollout, monitor GMV, activate new markets
          </p>
        </div>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '8px 16px',
          fontSize: 12, color: 'var(--text-3)', fontWeight: 500,
        }}>
          {cities.filter((c) => c.is_active).length} / {cities.length} cities live
        </div>
      </div>

      {/* Bihar map hint */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(232,116,12,0.08) 0%, rgba(13,59,110,0.08) 100%)',
        border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
        padding: '16px 20px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{ fontSize: 28 }}>🗺️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>
            Bihar Expansion Strategy
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Patna is live. Target: Muzaffarpur → Bhagalpur → Gaya → Darbhanga by Q4.
            Activate cities one at a time to manage logistics and rider capacity.
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 'var(--r-md)', padding: '12px 16px',
          color: '#dc2626', fontSize: 13, marginBottom: 20,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* City Cards */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} style={{
              height: 200, borderRadius: 'var(--r-lg)',
              background: 'var(--surface-2)',
              animation: 'pulse 1.4s ease infinite',
            }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {cities.map((city) => (
            <CityCard
              key={city.id}
              city={city}
              toggling={toggling === city.id}
              onToggle={() => handleToggle(city)}
              onViewAnalytics={() => setDrawer(city.id)}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes pulse   { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
      `}</style>
    </div>
  );
}

// ── City Card ──────────────────────────────────────────────
function CityCard({ city, toggling, onToggle, onViewAnalytics }) {
  const isActive = city.is_active;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      transition: 'box-shadow 0.2s',
    }}>
      {/* Top accent line */}
      <div style={{
        height: 4,
        background: isActive
          ? 'linear-gradient(90deg, #16a34a, #4ade80)'
          : 'linear-gradient(90deg, #94a3b8, #cbd5e1)',
      }} />

      <div style={{ padding: '20px 20px 16px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{CITY_EMOJI[city.name] || '🏙️'}</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{city.name}</span>
            </div>
            <StatusBadge active={isActive} />
          </div>
          {!isActive && (
            <button
              onClick={onToggle}
              disabled={toggling}
              style={{
                background: 'var(--primary)', color: '#fff',
                border: 'none', borderRadius: 'var(--r-md)',
                padding: '8px 14px', fontSize: 12, fontWeight: 700,
                cursor: toggling ? 'wait' : 'pointer',
                opacity: toggling ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {toggling ? '...' : '🚀 Activate'}
            </button>
          )}
          {isActive && (
            <button
              onClick={onToggle}
              disabled={toggling}
              style={{
                background: 'transparent', color: '#dc2626',
                border: '1px solid rgba(220,38,38,0.3)', borderRadius: 'var(--r-md)',
                padding: '6px 12px', fontSize: 11, fontWeight: 600,
                cursor: toggling ? 'wait' : 'pointer',
                opacity: toggling ? 0.7 : 1,
              }}
            >
              Pause
            </button>
          )}
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Shops',    value: city.shop_count },
            { label: 'Orders',   value: city.order_count },
            { label: 'GMV',      value: fmt.paise(city.gmv_paise) },
          ].map((s) => (
            <div key={s.label} style={{
              background: 'var(--bg)', borderRadius: 8,
              padding: '8px 10px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {isActive
              ? `Launched ${fmt.date(city.launch_date)}`
              : city.waitlist_count > 0
                ? `${fmt.num(city.waitlist_count)} on waitlist`
                : 'No waitlist yet'
            }
          </div>
          <button
            onClick={onViewAnalytics}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)', padding: '5px 12px',
              fontSize: 11, color: 'var(--text-2)', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Analytics →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── City emojis ────────────────────────────────────────────
const CITY_EMOJI = {
  Patna:       '🏛️',
  Muzaffarpur: '🌿',
  Bhagalpur:   '🏺',
  Gaya:        '🕌',
  Darbhanga:   '🌾',
};
