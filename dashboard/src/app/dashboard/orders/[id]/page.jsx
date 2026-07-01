'use client';
import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ordersApi, riderApi } from '../../../../lib/api';

const STATUS_STEPS = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];
const STATUS_LABEL = {
  pending:          '⏳ Pending',
  confirmed:        '✓ Confirmed',
  preparing:        '📦 Preparing',
  ready_for_pickup: '✅ Ready',
  out_for_delivery: '🛵 Out for Delivery',
  delivered:        '🏠 Delivered',
  cancelled:        '✗ Cancelled',
};

export default function OrderDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sub-order', id],
    queryFn:  () => ordersApi.getSubOrder(id),
  });

  const { data: ridersData } = useQuery({
    queryKey: ['riders'],
    queryFn:  riderApi.getRiders,
    staleTime: 5 * 60 * 1000,
  });

  const order   = data?.subOrder || data?.order;
  const riders  = ridersData?.riders || [];

  const advance = useMutation({
    mutationFn: () => {
      if (order?.status === 'confirmed')  return ordersApi.markPreparing(id);
      if (order?.status === 'preparing')  return ordersApi.markReady(id);
      return Promise.resolve();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sub-order', id] }),
  });

  const assignRider = useMutation({
    mutationFn: (riderId) => ordersApi.assignRider(id, riderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sub-order', id] }),
  });

  if (isLoading) return (
    <div className="page-body" style={{ textAlign: 'center', paddingTop: 80 }}>
      Loading order details…
    </div>
  );
  if (!order) return (
    <div className="page-body">Order not found.</div>
  );

  const items       = order.order_items || [];
  const currentStep = STATUS_STEPS.indexOf(order.status);
  const addr        = order.delivery_address || {};

  return (
    <div className="page-body" style={{ maxWidth: 800 }}>
      {/* Back */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => router.back()}
        style={{ marginBottom: 'var(--s4)', paddingLeft: 0 }}
      >
        ← Back to Orders
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--s5)' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>
            Order #{order.order_number || id.slice(0, 8)}
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {order.delivery_tier === 'quick'
              ? <span style={{ color: 'var(--quick)', fontWeight: 600 }}>⚡ Quick Delivery</span>
              : <span style={{ color: 'var(--scheduled)', fontWeight: 600 }}>📅 Scheduled Delivery</span>
            }
            {order.created_at && ` · Placed ${format(new Date(order.created_at), 'dd MMM, h:mm a')}`}
          </div>
        </div>
        <span className={`badge badge-${order.status?.replace(/_/g, '-') || 'pending'}`} style={{ fontSize: 14, padding: '6px 14px' }}>
          {STATUS_LABEL[order.status] || order.status}
        </span>
      </div>

      {/* Status timeline */}
      <div className="card card-pad" style={{ marginBottom: 'var(--s5)' }}>
        <div style={{ fontWeight: 600, marginBottom: 'var(--s4)' }}>Order Progress</div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {STATUS_STEPS.slice(0, -1).map((step, i) => {
            const done    = i <= currentStep;
            const current = i === currentStep;
            return (
              <div key={step} style={{ flex: 1, textAlign: 'center', minWidth: 80 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', margin: '0 auto 6px',
                  background: done ? 'var(--success)' : 'var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: current ? '3px solid var(--primary)' : 'none',
                  fontSize: 14, color: done ? '#fff' : 'var(--text-tertiary)',
                  fontWeight: 700,
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <div style={{ fontSize: 11, color: done ? 'var(--text)' : 'var(--text-tertiary)', fontWeight: current ? 600 : 400 }}>
                  {step.replace(/_/g, ' ')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Items */}
      <div className="card card-pad" style={{ marginBottom: 'var(--s5)' }}>
        <div style={{ fontWeight: 600, marginBottom: 'var(--s4)' }}>Items ({items.length})</div>
        {items.map(item => (
          <div key={item.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <div style={{ fontWeight: 500 }}>{item.product_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {item.unit} · ₹{((item.unit_price || 0) / 100).toFixed(0)} each
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>× {item.quantity}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                ₹{((item.unit_price || 0) * item.quantity / 100).toFixed(0)}
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, fontWeight: 700, fontSize: 16 }}>
          <span>Total</span>
          <span>₹{((order.total_amount || 0) / 100).toFixed(0)}</span>
        </div>
      </div>

      {/* Delivery address */}
      <div className="card card-pad" style={{ marginBottom: 'var(--s5)' }}>
        <div style={{ fontWeight: 600, marginBottom: 'var(--s3)' }}>📍 Delivery Address</div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text)' }}>{addr.recipient_name}</strong><br />
          {addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''}<br />
          {addr.landmark && <>{addr.landmark}<br /></>}
          {addr.city}, {addr.state} – {addr.pin_code}
        </div>
        {addr.recipient_phone && (
          <a
            href={`tel:${addr.recipient_phone}`}
            className="btn btn-outline btn-sm"
            style={{ marginTop: 12, display: 'inline-flex' }}
          >
            📞 Call Customer
          </a>
        )}
        {/* Open in Google Maps */}
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent([addr.address_line1, addr.city, addr.state].join(', '))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline btn-sm"
          style={{ marginTop: 12, marginLeft: 8, display: 'inline-flex' }}
        >
          🗺 Maps
        </a>
      </div>

      {/* Rider assignment */}
      {order.status === 'ready_for_pickup' && (
        <div className="card card-pad" style={{ marginBottom: 'var(--s5)' }}>
          <div style={{ fontWeight: 600, marginBottom: 'var(--s3)' }}>🛵 Assign Delivery Person</div>
          <div style={{ display: 'flex', gap: 'var(--s3)', flexWrap: 'wrap' }}>
            {riders.map(rider => (
              <button
                key={rider.id}
                className={`btn btn-lg ${order.rider_id === rider.id ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => assignRider.mutate(rider.id)}
                disabled={assignRider.isPending}
              >
                {order.rider_id === rider.id ? '✓ ' : ''}{rider.full_name || rider.id}
              </button>
            ))}
            {riders.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                No delivery people set up yet. Add them from the admin panel.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Action controls */}
      {['confirmed', 'preparing'].includes(order.status) && (
        <button
          className="btn btn-primary btn-xl btn-full"
          onClick={() => advance.mutate()}
          disabled={advance.isPending}
          style={{ marginBottom: 'var(--s4)' }}
        >
          {advance.isPending ? 'Updating…' : (
            order.status === 'confirmed' ? '📦 Start Preparing' : '✅ Mark Ready for Pickup'
          )}
        </button>
      )}
    </div>
  );
}
