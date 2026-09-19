// admin/retention/page.jsx — P14-7
// Customer retention metrics: new, repeat, churned, top customers.
'use client';
import { useEffect, useState } from 'react';

export default function AdminRetentionPage() {
  const [data, setData]   = useState(null);
  const [days, setDays]   = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [days]);

  async function loadData() {
    setLoading(true);
    const r = await fetch(`/api/backend/admin/retention-metrics?days=${days}`, { credentials: 'include' });
    const d = await r.json();
    setData(d.data);
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📊 Customer Retention</h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0' }}>Understand repeat purchase behavior</p>
        </div>
        <select value={days} onChange={e => setDays(+e.target.value)}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, fontWeight: 600 }}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { icon: '🆕', label: 'New Customers', value: data?.new_customers, color: '#3b82f6' },
              { icon: '🔄', label: 'Repeat Customers', value: data?.repeat_customers, color: '#16a34a' },
              { icon: '📈', label: 'Repeat Rate', value: `${data?.repeat_rate_pct}%`, color: '#f97316' },
              { icon: '💤', label: 'Est. Churned', value: data?.estimated_churned, color: '#ef4444' },
            ].map(c => (
              <div key={c.label} style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.06)', textAlign: 'center' }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>{c.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Top customers */}
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 15 }}>
              🏆 Top Repeat Customers
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151' }}>#</th>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151' }}>Name</th>
                  <th style={{ padding: '10px 18px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151' }}>Phone</th>
                  <th style={{ padding: '10px 18px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#374151' }}>Orders</th>
                </tr>
              </thead>
              <tbody>
                {(data?.top_customers || []).map((c, i) => (
                  <tr key={c.customer_id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 18px', color: '#9ca3af', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: '10px 18px', fontWeight: 600 }}>{c.name || 'Anonymous'}</td>
                    <td style={{ padding: '10px 18px', color: '#6b7280' }}>{c.phone || '—'}</td>
                    <td style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 800, color: '#f97316' }}>{c.orders}</td>
                  </tr>
                ))}
                {!data?.top_customers?.length && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
