'use client';
// dashboard/forecast/page.jsx — P17-2 (UPGRADED)
// AI Demand Forecast for shop owners.
// Shows predicted units for next N days with traffic-light restocking signals.
import { useEffect, useState } from 'react';

const LIGHT = {
  red:    { bg: '#fff1f2', border: '#fecaca', badge: '#ef4444', text: '🔴 Restock NOW',  description: 'Stock will run out before forecast period ends' },
  yellow: { bg: '#fffbeb', border: '#fde68a', badge: '#f59e0b', text: '🟡 Restock Soon', description: 'Stock running low — order within 2–3 days'       },
  green:  { bg: '#f0fdf4', border: '#bbf7d0', badge: '#22c55e', text: '🟢 Sufficient',   description: 'Stock should last the forecast period'             },
};

function ForecastRow({ item }) {
  const light = LIGHT[item.traffic_light] || LIGHT.green;
  return (
    <tr style={{ background: light.bg, borderBottom: `1px solid ${light.border}` }}>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>{item.product_name}</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{item.category}</div>
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        <span style={{ background: `${light.badge}20`, color: light.badge, fontWeight: 800, fontSize: 18, padding: '2px 0' }}>{item.current_stock}</span>
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: 18, color: '#f97316' }}>{item.predicted_units}</td>
      <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, color: '#374151' }}>
        {item.avg_daily}/day
        <div style={{ fontSize: 11, color: item.trend === 'rising' ? '#16a34a' : item.trend === 'falling' ? '#ef4444' : '#9ca3af' }}>
          {item.trend === 'rising' ? '↑' : item.trend === 'falling' ? '↓' : '→'} {item.trend} {item.trend_pct > 0 ? `+${item.trend_pct}%` : item.trend_pct < 0 ? `${item.trend_pct}%` : ''}
        </div>
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        <span style={{ padding: '3px 8px', borderRadius: 20, background: `${light.badge}20`, color: light.badge, fontSize: 11, fontWeight: 700 }}>
          {item.confidence}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: light.badge }}>{light.text}</span>
        {item.restock_suggestion && (
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{item.restock_suggestion}</div>
        )}
        {item.monsoon_applied && (
          <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 2 }}>🌧️ Monsoon boost applied</div>
        )}
      </td>
    </tr>
  );
}

export default function ForecastPage() {
  const [forecast, setForecast]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [days, setDays]             = useState(7);
  const [filter, setFilter]         = useState('all');
  const [generatedAt, setGenAt]     = useState('');

  useEffect(() => { loadForecast(); }, [days]);

  async function loadForecast() {
    setLoading(true);
    const r = await fetch(`/api/backend/shop/demand-forecast?days=${days}`, { credentials: 'include' });
    const d = await r.json();
    setForecast(d.data?.forecast || []);
    setGenAt(d.data?.generated_at ? new Date(d.data.generated_at).toLocaleTimeString('en-IN') : '');
    setLoading(false);
  }

  const filtered = forecast.filter(item => filter === 'all' || item.traffic_light === filter);
  const redCount    = forecast.filter(i => i.traffic_light === 'red').length;
  const yellowCount = forecast.filter(i => i.traffic_light === 'yellow').length;
  const greenCount  = forecast.filter(i => i.traffic_light === 'green').length;

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>📈 Demand Forecast</h1>
        <p style={{ color: '#9ca3af', margin: 0, fontSize: 13 }}>
          AI-powered stock prediction · Moving average + day-of-week + monsoon seasonality
          {generatedAt && ` · Generated at ${generatedAt}`}
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, background: '#f3f4f6', borderRadius: 10, padding: 4 }}>
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: days === d ? '#f97316' : 'transparent', color: days === d ? '#fff' : '#374151', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {d} days
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {[['all', '🔍 All', '#6b7280'], ['red', '🔴 Urgent', '#ef4444'], ['yellow', '🟡 Soon', '#f59e0b'], ['green', '🟢 OK', '#16a34a']].map(([v, l, c]) => (
            <button key={v} onClick={() => setFilter(v)} style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${filter === v ? c : '#e5e7eb'}`, background: filter === v ? `${c}15` : '#fff', color: filter === v ? c : '#374151', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
              {l} {v === 'red' ? redCount : v === 'yellow' ? yellowCount : v === 'green' ? greenCount : forecast.length}
            </button>
          ))}
        </div>
      </div>

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[['🔴 Restock Urgent', redCount, '#ef4444'], ['🟡 Restock Soon', yellowCount, '#f59e0b'], ['🟢 Sufficient', greenCount, '#22c55e']].map(([l, v, c]) => (
          <div key={l} style={{ background: `${c}10`, border: `1.5px solid ${c}30`, borderRadius: 12, padding: '14px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: c, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>Calculating forecast...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', background: '#fff', borderRadius: 14 }}>
          {forecast.length === 0 ? 'No inventory data yet — add products to your shop to see demand forecasts' : 'No items match this filter'}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <tr>
                {['Product', 'In Stock', `Predicted (${days}d)`, 'Avg / Day', 'Confidence', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Product' || h === 'Action' ? 'left' : 'center', fontSize: 12, fontWeight: 700, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => <ForecastRow key={item.inventory_id} item={item} />)}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, padding: '12px 16px', background: '#eff6ff', borderRadius: 10, fontSize: 12, color: '#1e40af' }}>
        💡 <strong>How forecasting works:</strong> Blends 7-day (70%) and 28-day (30%) moving averages · Adjusts for day-of-week patterns · Applies Bihar monsoon seasonal boost for paints, waterproofing and plumbing (June–September)
      </div>
    </div>
  );
}
