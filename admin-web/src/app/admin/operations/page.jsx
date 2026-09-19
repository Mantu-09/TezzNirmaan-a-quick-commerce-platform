// admin/operations/page.jsx — P15-9
// Live dispatch board: orders pipeline + active rider overview.
'use client';
import { useEffect, useState } from 'react';

const STATUS_STAGES = ['pending','confirmed','preparing','out_for_delivery','delivered'];
const STATUS_ICON = { pending: '🕐', confirmed: '✅', preparing: '👨‍🍳', out_for_delivery: '🛵', delivered: '📦', cancelled: '❌' };
const STATUS_COLOR = { pending: '#f97316', confirmed: '#3b82f6', preparing: '#a855f7', out_for_delivery: '#06b6d4', delivered: '#22c55e', cancelled: '#9ca3af' };

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '18px 16px', textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,.06)' }}>
      <div style={{ fontSize: 30, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || '#1f2937' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{label}</div>
    </div>
  );
}

export default function AdminOperationsPage() {
  const [orders, setOrders]   = useState([]);
  const [stats, setStats]     = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const iv = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(iv);
  }, []);

  async function loadData() {
    try {
      // Fetch today's active orders
      const r = await fetch('/api/backend/admin/orders?status=active&limit=200', { credentials: 'include' });
      const d = await r.json();
      const allOrders = d.data?.orders || d.orders || [];

      // Compute stats
      const today = new Date().toLocaleDateString('en-IN');
      const todayOrders = allOrders.filter(o => new Date(o.created_at).toLocaleDateString('en-IN') === today);
      const delivered   = todayOrders.filter(o => o.status === 'delivered' || o.sub_orders?.some(s => s.status === 'delivered'));
      const active      = todayOrders.filter(o => !['delivered','cancelled'].includes(o.status));
      const cancelled   = todayOrders.filter(o => o.status === 'cancelled');

      setOrders(allOrders.slice(0, 100));
      setStats({
        total_today:  todayOrders.length,
        delivered:    delivered.length,
        active:       active.length,
        cancelled:    cancelled.length,
        completion:   todayOrders.length ? Math.round(delivered.length / todayOrders.length * 100) : 0,
      });
    } catch {}
    setLoading(false);
  }

  // Group orders by status
  const grouped = {};
  STATUS_STAGES.forEach(s => { grouped[s] = []; });
  orders.forEach(o => {
    const status = o.sub_orders?.[0]?.status || o.status || 'pending';
    if (grouped[status]) grouped[status].push(o);
    else if (!['delivered'].includes(status)) grouped['pending'].push(o);
  });

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>⚡ Operations Dashboard</h1>
          <p style={{ color: '#9ca3af', margin: '4px 0 0', fontSize: 13 }}>Live delivery pipeline • Auto-refreshes every 30s</p>
        </div>
        <button onClick={loadData} style={{ padding: '8px 16px', background: '#f97316', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>🔄 Refresh</button>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard icon="📦" label="Today's Orders" value={stats.total_today} />
        <StatCard icon="🟢" label="Active" value={stats.active} color="#f97316" />
        <StatCard icon="✅" label="Delivered" value={stats.delivered} color="#22c55e" />
        <StatCard icon="❌" label="Cancelled" value={stats.cancelled} color="#ef4444" />
        <StatCard icon="📈" label="Completion Rate" value={`${stats.completion || 0}%`} color={stats.completion >= 90 ? '#22c55e' : stats.completion >= 70 ? '#f97316' : '#ef4444'} />
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>Loading dispatch board...</div>
      ) : (
        /* Kanban-style dispatch board */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {['pending','confirmed','preparing','out_for_delivery'].map(status => (
            <div key={status} style={{ background: '#f9fafb', borderRadius: 14, padding: 14 }}>
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 16 }}>{STATUS_ICON[status]}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: STATUS_COLOR[status] }}>
                  {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
                <span style={{ marginLeft: 'auto', background: STATUS_COLOR[status], color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {grouped[status]?.length || 0}
                </span>
              </div>

              {/* Order cards */}
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {(grouped[status] || []).length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: '#d1d5db', fontSize: 13 }}>Empty</div>
                ) : (grouped[status] || []).map(order => (
                  <div key={order.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1f2937', marginBottom: 3 }}>
                      #{order.order_number || order.id?.slice(0,8).toUpperCase()}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>
                      {order.customer?.name || 'Customer'} • {order.sub_orders?.[0]?.shop?.name || '—'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      {new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      {order.sub_orders?.[0]?.delivery_assignments?.[0]?.rider && (
                        <span style={{ marginLeft: 6, color: '#06b6d4', fontWeight: 600 }}>
                          🛵 {order.sub_orders[0].delivery_assignments[0].rider?.name || 'Assigned'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Overdue B2B section */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 20, marginTop: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: '#1f2937' }}>💳 B2B Credit Overview</h2>
        <a href="/admin/b2b" style={{ fontSize: 13, color: '#f97316', textDecoration: 'none', fontWeight: 600 }}>
          View contractor credit management →
        </a>
      </div>
    </div>
  );
}
