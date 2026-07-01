'use client';
import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import { ordersApi } from '../../../lib/api';

// ── Helpers ───────────────────────────────────────────────────
const STATUS_LABEL = {
  pending:          'New',
  confirmed:        'Confirmed',
  preparing:        'Preparing',
  ready_for_pickup: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
  cancelled:        'Cancelled',
};

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready_for_pickup'];

function TierBadge({ tier }) {
  return (
    <span className={`badge badge-${tier}`}>
      {tier === 'quick' ? '⚡ Quick' : '📅 Scheduled'}
    </span>
  );
}

function StatusBadge({ status }) {
  const cls = {
    pending:          'badge-pending',
    confirmed:        'badge-confirmed',
    preparing:        'badge-preparing',
    ready_for_pickup: 'badge-ready',
    out_for_delivery: 'badge-ready',
    delivered:        'badge-delivered',
    cancelled:        'badge-cancelled',
  }[status] || 'badge-pending';
  return <span className={`badge ${cls}`}>{STATUS_LABEL[status] || status}</span>;
}

function WaitingTime({ createdAt }) {
  if (!createdAt) return null;
  const mins = Math.floor((Date.now() - new Date(createdAt)) / 60000);
  const color = mins > 10 ? 'var(--error)' : mins > 5 ? 'var(--warning)' : 'var(--success)';
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color }}>
      ⏱ {mins}m ago
    </span>
  );
}

// ── OrderCard ─────────────────────────────────────────────────
function OrderCard({ order, isNew, onAction }) {
  const [expanded, setExpanded] = useState(isNew); // New orders open by default
  const queryClient = useQueryClient();

  const confirm = useMutation({
    mutationFn: () => ordersApi.confirmOrder(order.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-orders'] });
      onAction?.('confirmed', order.id);
    },
  });

  const reject = useMutation({
    mutationFn: () => ordersApi.rejectOrder(order.id, 'Rejected by shop'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-orders'] });
      onAction?.('rejected', order.id);
    },
  });

  const advance = useMutation({
    mutationFn: () => {
      if (order.status === 'confirmed')  return ordersApi.markPreparing(order.id);
      if (order.status === 'preparing')  return ordersApi.markReady(order.id);
      return Promise.resolve();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-orders'] }),
  });

  const items    = order.order_items || [];
  const isPending = order.status === 'pending';
  const totalAmt  = order.sub_total ? `₹${(order.sub_total / 100).toFixed(0)}` : '';

  return (
    <div className={`order-card tier-${order.delivery_tier}${isNew ? ' is-new' : ''}`}>
      {/* ── Card Header ── */}
      <div
        style={{
          padding: 'var(--s4) var(--s5)',
          display: 'flex', alignItems: 'center', gap: 'var(--s3)',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          background: isNew ? 'var(--new-order-light)' : 'transparent',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Left: tier + order number */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {isNew && <span className="badge badge-new">🔴 NEW</span>}
            <TierBadge tier={order.delivery_tier} />
            <StatusBadge status={order.status} />
          </div>
          <div style={{ marginTop: 4, fontWeight: 700, fontSize: 16 }}>
            #{order.order_number || order.id?.slice(0, 8)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {items.length} item{items.length !== 1 ? 's' : ''}
            {totalAmt && ` · ${totalAmt}`}
            {order.payment_method && ` · ${order.payment_method.toUpperCase()}`}
          </div>
        </div>

        {/* Right: time + expand toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <WaitingTime createdAt={order.created_at} />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div style={{ padding: 'var(--s4) var(--s5)' }}>
          {/* Items list */}
          <div style={{ marginBottom: 'var(--s4)' }}>
            {items.map(item => (
              <div
                key={item.id}
                style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '6px 0', borderBottom: '1px solid var(--border)',
                  fontSize: 14,
                }}
              >
                <span style={{ fontWeight: 500 }}>
                  {item.product_name || item.product_id}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  × {item.quantity} {item.unit}
                  &nbsp;·&nbsp;
                  ₹{((item.unit_price || 0) / 100 * item.quantity).toFixed(0)}
                </span>
              </div>
            ))}
          </div>

          {/* Customer address */}
          {order.delivery_address && (
            <div style={{
              background: 'var(--surface-2)', borderRadius: 'var(--r-lg)',
              padding: '10px 14px', marginBottom: 'var(--s4)', fontSize: 13,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>📍 Delivery Address</div>
              <div style={{ color: 'var(--text-secondary)' }}>
                {order.delivery_address.address_line1}
                {order.delivery_address.address_line2 && `, ${order.delivery_address.address_line2}`}
                {order.delivery_address.landmark && ` · ${order.delivery_address.landmark}`}
              </div>
              {order.distance_km && (
                <div style={{ color: 'var(--primary)', fontWeight: 600, marginTop: 4, fontSize: 12 }}>
                  ~{order.distance_km.toFixed(1)} km away
                </div>
              )}
            </div>
          )}

          {/* Payment status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--s4)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Payment:</span>
            <span className={`badge ${order.payment_status === 'paid' ? 'badge-paid' : 'badge-cod'}`}>
              {order.payment_status === 'paid' ? '✓ Paid' : '💵 Cash on Delivery'}
            </span>
          </div>

          {/* ── Action Buttons ── */}
          <div style={{ display: 'flex', gap: 'var(--s3)', flexWrap: 'wrap' }}>
            {isPending && (
              <>
                <button
                  className="btn btn-success btn-xl"
                  style={{ flex: 1 }}
                  onClick={() => confirm.mutate()}
                  disabled={confirm.isPending}
                >
                  {confirm.isPending ? '…' : '✓ Accept'}
                </button>
                <button
                  className="btn btn-danger btn-xl"
                  style={{ flex: 1 }}
                  onClick={() => {
                    if (window.confirm('Reject this order?')) reject.mutate();
                  }}
                  disabled={reject.isPending}
                >
                  {reject.isPending ? '…' : '✗ Reject'}
                </button>
              </>
            )}

            {order.status === 'confirmed' && (
              <button
                className="btn btn-primary btn-xl"
                style={{ flex: 1 }}
                onClick={() => advance.mutate()}
                disabled={advance.isPending}
              >
                {advance.isPending ? '…' : '📦 Mark Preparing'}
              </button>
            )}

            {order.status === 'preparing' && (
              <button
                className="btn btn-primary btn-xl"
                style={{ flex: 1 }}
                onClick={() => advance.mutate()}
                disabled={advance.isPending}
              >
                {advance.isPending ? '…' : '✅ Mark Ready'}
              </button>
            )}

            <Link
              href={`/dashboard/orders/${order.id}`}
              className="btn btn-outline btn-lg"
            >
              Full Details →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Orders Page ──────────────────────────────────────────
const TABS = ['All Active', '⚡ Quick', '📅 Scheduled', '✓ Done'];

export default function OrdersPage() {
  const [activeTab,   setActiveTab]   = useState(0);
  const [newOrderIds, setNewOrderIds] = useState(new Set());
  const queryClient = useQueryClient();

  const statusFilter = {
    0: ACTIVE_STATUSES,
    1: ACTIVE_STATUSES,
    2: ACTIVE_STATUSES,
    3: ['delivered', 'cancelled'],
  }[activeTab];

  const tierFilter = {
    0: null,
    1: 'quick',
    2: 'scheduled',
    3: null,
  }[activeTab];

  const { data, isLoading, refetch } = useQuery({
    queryKey:        ['shop-orders', statusFilter, tierFilter],
    queryFn:         () => ordersApi.getShopOrders({
      status: statusFilter?.join(',') || undefined,
      tier:   tierFilter || undefined,
    }),
    refetchInterval: 30000, // Poll every 30s as fallback to realtime
    staleTime:       15000,
  });

  const orders    = data?.orders || [];
  const quickCount = orders.filter(o => o.delivery_tier === 'quick' && o.status === 'pending').length;
  const schedCount = orders.filter(o => o.delivery_tier === 'scheduled' && o.status === 'pending').length;

  return (
    <div className="page-body">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s5)' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Order Queue</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
            {format(new Date(), "EEEE, d MMMM")} · {orders.length} active order{orders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => refetch()}>
          ↻ Refresh
        </button>
      </div>

      {/* ⚡ Quick orders urgent notice */}
      {quickCount > 0 && activeTab !== 1 && (
        <div
          onClick={() => setActiveTab(1)}
          style={{
            background: 'var(--quick-light)', border: '2px solid var(--quick)',
            borderRadius: 'var(--r-xl)', padding: 'var(--s4)', marginBottom: 'var(--s5)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--s3)',
          }}
        >
          <span style={{ fontSize: 24 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--quick)', fontSize: 16 }}>
              {quickCount} Quick Order{quickCount > 1 ? 's' : ''} Need Attention!
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Tap to view — these need to be packed and ready within 60-90 min
            </div>
          </div>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--quick)' }}>→</span>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 'var(--s5)' }}>
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`tab-btn${activeTab === i ? ' active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {tab}
            {i === 0 && orders.length > 0 && (
              <span style={{
                background: 'var(--primary)', color: '#fff',
                borderRadius: 'var(--r-full)', fontSize: 11, fontWeight: 700,
                padding: '1px 7px', marginLeft: 4,
              }}>
                {orders.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Order cards */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 'var(--s16)', color: 'var(--text-secondary)' }}>
          Loading orders…
        </div>
      ) : orders.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 'var(--s16)',
          color: 'var(--text-secondary)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {activeTab === 3 ? '📦' : '🎉'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            {activeTab === 3 ? 'No completed orders yet today' : 'No orders right now'}
          </div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            {activeTab === 3 ? 'Completed orders will appear here' : 'New orders will appear here and you\'ll hear an alert 🔔'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
          {orders
            .filter(o => !tierFilter || o.delivery_tier === tierFilter)
            .sort((a, b) => {
              // Quick + pending first
              if (a.status === 'pending' && b.status !== 'pending') return -1;
              if (b.status === 'pending' && a.status !== 'pending') return  1;
              if (a.delivery_tier === 'quick' && b.delivery_tier !== 'quick') return -1;
              if (b.delivery_tier === 'quick' && a.delivery_tier !== 'quick') return  1;
              return new Date(a.created_at) - new Date(b.created_at);
            })
            .map(order => (
              <OrderCard
                key={order.id}
                order={order}
                isNew={newOrderIds.has(order.id)}
                onAction={(action, id) => {
                  if (action === 'confirmed' || action === 'rejected') {
                    setNewOrderIds(s => { const n = new Set(s); n.delete(id); return n; });
                  }
                }}
              />
            ))
          }
        </div>
      )}
    </div>
  );
}
