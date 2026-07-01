'use client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ordersApi, inventoryApi } from '../../../lib/api';

function StatCard({ emoji, label, value, sub, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{emoji}</div>
      <div className="stat-value" style={{ color: color || 'var(--text)' }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AlertRow({ emoji, text, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <span style={{ fontSize: 14, color: color || 'var(--text)' }}>{text}</span>
    </div>
  );
}

export default function SummaryPage() {
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: ordersData, isLoading: ordLoading } = useQuery({
    queryKey: ['shop-orders-today'],
    queryFn:  () => ordersApi.getShopOrders({ date: today, limit: 100 }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: invData } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn:  () => inventoryApi.getInventory({ limit: 200 }),
    staleTime: 5 * 60 * 1000,
  });

  const allOrders  = ordersData?.orders || [];
  const inventory  = invData?.inventory || [];

  // Derived stats
  const delivered  = allOrders.filter(o => o.status === 'delivered');
  const pending    = allOrders.filter(o => ['pending','confirmed','preparing','ready_for_pickup'].includes(o.status));
  const cancelled  = allOrders.filter(o => o.status === 'cancelled');
  const revenue    = delivered.reduce((s, o) => s + (o.total_amount || 0), 0);
  const quickCount = allOrders.filter(o => o.delivery_tier === 'quick').length;
  const schedCount = allOrders.filter(o => o.delivery_tier === 'scheduled').length;

  const lowStock   = inventory.filter(i => i.stock_quantity < 5 && i.is_in_stock);
  const outOfStock = inventory.filter(i => !i.is_in_stock);

  return (
    <div className="page-body">
      <div style={{ marginBottom: 'var(--s5)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Today's Summary</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
          {format(new Date(), "EEEE, d MMMM yyyy")}
        </p>
      </div>

      {ordLoading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : (
        <>
          {/* Key stats */}
          <div className="grid-4" style={{ marginBottom: 'var(--s6)' }}>
            <StatCard
              emoji="💰"
              label="Revenue Today"
              value={`₹${(revenue / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              sub={`${delivered.length} order${delivered.length !== 1 ? 's' : ''} delivered`}
              color="var(--success)"
            />
            <StatCard
              emoji="📋"
              label="Total Orders"
              value={allOrders.length}
              sub={`${quickCount} quick · ${schedCount} scheduled`}
            />
            <StatCard
              emoji="⏳"
              label="Pending Now"
              value={pending.length}
              sub={pending.length > 0 ? 'Needs attention' : 'All clear!'}
              color={pending.length > 0 ? 'var(--warning)' : 'var(--success)'}
            />
            <StatCard
              emoji="✗"
              label="Cancelled"
              value={cancelled.length}
              sub={cancelled.length > 2 ? 'High — check why' : 'Within normal range'}
              color={cancelled.length > 2 ? 'var(--error)' : undefined}
            />
          </div>

          {/* Alerts */}
          <div style={{ marginBottom: 'var(--s6)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 'var(--s4)' }}>Alerts</h2>
            <div className="card" style={{ overflow: 'hidden' }}>
              {pending.length === 0 && lowStock.length === 0 && outOfStock.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--success)', fontWeight: 600 }}>
                  ✓ All good — no pending alerts
                </div>
              ) : (
                <>
                  {pending.length > 0 && (
                    <AlertRow
                      emoji="⏳"
                      text={`${pending.length} order${pending.length !== 1 ? 's' : ''} waiting to be processed`}
                      color="var(--warning)"
                    />
                  )}
                  {lowStock.map(item => (
                    <AlertRow
                      key={item.id}
                      emoji="📉"
                      text={`Low stock: ${item.products?.name || 'Item'} — only ${item.stock_quantity} left`}
                      color="var(--warning)"
                    />
                  ))}
                  {outOfStock.slice(0, 3).map(item => (
                    <AlertRow
                      key={item.id}
                      emoji="🚫"
                      text={`Out of stock: ${item.products?.name || 'Item'} — mark unavailable or restock`}
                      color="var(--error)"
                    />
                  ))}
                  {outOfStock.length > 3 && (
                    <AlertRow
                      emoji="…"
                      text={`+ ${outOfStock.length - 3} more out-of-stock items`}
                      color="var(--text-secondary)"
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Quick breakdown */}
          <div className="grid-2">
            <div className="card card-pad">
              <h3 style={{ fontWeight: 600, marginBottom: 'var(--s4)', fontSize: 16 }}>Order Breakdown</h3>
              {[
                { label: 'Delivered',   value: delivered.length,  color: 'var(--success)' },
                { label: 'In Progress', value: pending.length,    color: 'var(--warning)' },
                { label: 'Cancelled',   value: cancelled.length,  color: 'var(--error)'   },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{row.label}</span>
                  <span style={{ fontWeight: 700, color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div className="card card-pad">
              <h3 style={{ fontWeight: 600, marginBottom: 'var(--s4)', fontSize: 16 }}>Inventory Health</h3>
              {[
                { label: 'Total items',    value: inventory.length,    color: undefined },
                { label: 'Available',      value: inventory.filter(i => i.is_in_stock).length, color: 'var(--success)' },
                { label: 'Out of stock',   value: outOfStock.length,   color: outOfStock.length > 0 ? 'var(--error)' : undefined },
                { label: 'Low stock (<5)', value: lowStock.length,     color: lowStock.length > 0 ? 'var(--warning)' : undefined },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{row.label}</span>
                  <span style={{ fontWeight: 700, color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
