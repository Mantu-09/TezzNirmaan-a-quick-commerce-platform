'use client';
// ────────────────────────────────────────────────────────────
// AIInsightsCard.jsx — P5-5B
//
// Renders the Claude-powered demand forecast section inside
// the shop analytics page. Calls GET /shop/demand-forecast.
//
// Graceful degradation: if ANTHROPIC_API_KEY is not set on the
// server, the API returns { aiEnabled: false } — we render a
// polite "AI unavailable" state instead of an error.
// ────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { aiApi } from '../lib/api';

// ── Helpers ───────────────────────────────────────────────────
function relativeTime(date) {
  if (!date) return '';
  const diffMs   = Date.now() - new Date(date).getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1)  return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  const diffHrs = Math.round(diffMins / 60);
  return `${diffHrs} hour${diffHrs !== 1 ? 's' : ''} ago`;
}

// ── Restock Item row ──────────────────────────────────────────
function RestockRow({ item, urgency }) {
  const isUrgent = urgency === 'urgent';
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:            12,
      padding:        '10px 0',
      borderBottom:   '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{isUrgent ? '🚨' : '⚠️'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font)' }}>
          {item.product}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font)', marginTop: 2 }}>
          {item.currentStock != null
            ? `${item.currentStock} left · threshold: ${item.threshold}`
            : 'Check stock levels'}
        </div>
      </div>
      <Link
        href={`/dashboard/inventory${item.inventoryId ? `?edit=${item.inventoryId}` : ''}`}
        style={{
          padding:        '6px 14px',
          borderRadius:   8,
          fontSize:       12,
          fontWeight:     700,
          textDecoration: 'none',
          background:     isUrgent ? '#DC2626' : '#D97706',
          color:          '#fff',
          flexShrink:     0,
          fontFamily:     'var(--font)',
          whiteSpace:     'nowrap',
        }}
      >
        {isUrgent ? '🛒 Restock Now' : 'Restock Soon →'}
      </Link>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function AIInsightsCard() {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [lastFetched, setLastFetched] = useState(null);
  const [refreshKey,  setRefreshKey]  = useState(0);

  const loadForecast = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await aiApi.getDemandForecast(7);
      setData(res);
      setLastFetched(new Date());
    } catch (e) {
      setError(e.message || 'Could not load AI insights');
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => { loadForecast(); }, [loadForecast]);

  // ── Loading skeleton ──────────────────────────────────────
  if (loading) {
    return (
      <div style={css.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
          <span style={css.cardTitle}>🤖 AI Insights</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font)' }}>Thinking…</span>
        </div>
        {[100, 70, 85, 60].map((w, i) => (
          <div key={i} style={{
            height: i === 0 ? 20 : 14, width: `${w}%`, borderRadius: 6,
            background: 'var(--surface-2)',
            animation: 'pulse 1.4s ease infinite',
            marginBottom: 12,
          }} />
        ))}
      </div>
    );
  }

  // ── AI unavailable ────────────────────────────────────────
  if (error || data?.aiEnabled === false) {
    return (
      <div style={{ ...css.card, background: 'var(--surface-2)', border: '1px dashed var(--border)' }}>
        <div style={css.cardTitle}>🤖 AI Insights</div>
        <p style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text-3)', marginTop: 12 }}>
          {data?.aiEnabled === false
            ? 'AI insights are disabled (no ANTHROPIC_API_KEY configured).'
            : `Could not load insights: ${error}`}
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
          Inventory restock alerts are still available in the Low Stock section above ↑
        </p>
      </div>
    );
  }

  if (!data) return null;

  const { urgentRestock = [], soonRestock = [], demandTrend, seasonalNote, generatedAt } = data;
  const hasAlerts = urgentRestock.length > 0 || soonRestock.length > 0;

  return (
    <div style={css.card}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <span style={css.cardTitle}>🤖 AI Insights</span>
          <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
            Powered by Claude · 7-day demand forecast
          </div>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: '1px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Restock alerts */}
      {hasAlerts ? (
        <div style={{ marginBottom: 20 }}>
          {urgentRestock.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                🚨 Restock urgently
              </div>
              {urgentRestock.map((item, i) => (
                <RestockRow key={i} item={item} urgency="urgent" />
              ))}
            </div>
          )}
          {soonRestock.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, marginTop: urgentRestock.length > 0 ? 16 : 0 }}>
                ⚠️ Restock soon
              </div>
              {soonRestock.map((item, i) => (
                <RestockRow key={i} item={item} urgency="soon" />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{
          padding: '16px', borderRadius: 10, marginBottom: 20,
          background: '#F0FDF4', border: '1px solid #BBF7D0',
          fontFamily: 'var(--font)', fontSize: 13, color: '#15803D',
        }}>
          ✅ All critical stock looks good for the next 7 days.
        </div>
      )}

      {/* Trend + Seasonal */}
      {(demandTrend || seasonalNote) && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {demandTrend && (
            <div>
              <div style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                📈 This week
              </div>
              <p style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: 0 }}>
                {demandTrend}
              </p>
            </div>
          )}
          {seasonalNote && (
            <div>
              <div style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                🌧️ Seasonal note
              </div>
              <p style={{ fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: 0 }}>
                {seasonalNote}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Timestamp */}
      {lastFetched && (
        <div style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'var(--text-3)', marginTop: 16, textAlign: 'right' }}>
          Last updated {relativeTime(lastFetched)}
        </div>
      )}
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
};
