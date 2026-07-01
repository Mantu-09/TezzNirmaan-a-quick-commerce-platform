'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { riderApi } from '../../lib/api';

const STATUS_LABEL = {
  assigned:         '📋 Assigned',
  accepted:         '✓ Accepted',
  picked_up:        '📦 Picked Up',
  out_for_delivery: '🛵 Delivering',
  delivered:        '✅ Delivered',
};

function DeliveryCard({ delivery }) {
  const queryClient = useQueryClient();
  const addr  = delivery.delivery_address || {};
  const items = delivery.order_items      || [];

  const accept = useMutation({
    mutationFn: () => riderApi.acceptDelivery(delivery.id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['my-deliveries'] }),
  });
  const pickup = useMutation({
    mutationFn: () => riderApi.markPickup(delivery.id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['my-deliveries'] }),
  });
  const deliver = useMutation({
    mutationFn: () => riderApi.markDelivered(delivery.id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['my-deliveries'] }),
  });

  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(
    [addr.address_line1, addr.landmark, addr.city, addr.state].filter(Boolean).join(', ')
  )}`;

  const isCompleted = delivery.status === 'delivered' || delivery.status === 'cancelled';

  return (
    <div
      className="rider-card"
      style={{ borderColor: isCompleted ? 'var(--border)' : 'var(--primary)', opacity: isCompleted ? 0.7 : 1 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>
            #{delivery.order_number || delivery.id?.slice(0, 8)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {STATUS_LABEL[delivery.status] || delivery.status}
          </div>
        </div>
        <span className={`badge badge-${delivery.delivery_tier}`} style={{ fontSize: 13 }}>
          {delivery.delivery_tier === 'quick' ? '⚡ Quick' : '📅 Scheduled'}
        </span>
      </div>

      {/* Items summary */}
      <div style={{
        background:   'var(--surface-2)',
        borderRadius: 'var(--r-lg)',
        padding:      '10px 14px',
        marginBottom: 12,
        fontSize:     14,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>📦 Items ({items.length})</div>
        {items.slice(0, 3).map(item => (
          <div key={item.id} style={{ color: 'var(--text-secondary)' }}>
            · {item.product_name} × {item.quantity}
          </div>
        ))}
        {items.length > 3 && (
          <div style={{ color: 'var(--text-tertiary)' }}>+{items.length - 3} more items</div>
        )}
      </div>

      {/* Address — large, tappable */}
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display:        'block',
          background:     'var(--secondary-light)',
          border:         '1.5px solid var(--secondary)',
          borderRadius:   'var(--r-xl)',
          padding:        '14px 16px',
          marginBottom:   12,
          textDecoration: 'none',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--secondary)', marginBottom: 4 }}>
          🗺 Tap to Open in Maps
        </div>
        <div style={{ fontSize: 14, color: 'var(--text)' }}>
          {addr.recipient_name && <strong>{addr.recipient_name}</strong>}
          {addr.recipient_name && <br />}
          {addr.address_line1}
          {addr.address_line2 && `, ${addr.address_line2}`}
          {addr.landmark && (
            <><br /><span style={{ color: 'var(--text-secondary)' }}>Near: {addr.landmark}</span></>
          )}
          <br />
          {addr.city}, {addr.pin_code}
        </div>
      </a>

      {/* Call customer */}
      {addr.recipient_phone && (
        <a
          href={`tel:${addr.recipient_phone}`}
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            8,
            background:     'var(--success-light)',
            border:         '1.5px solid var(--success)',
            borderRadius:   'var(--r-xl)',
            padding:        '12px 16px',
            marginBottom:   12,
            textDecoration: 'none',
            fontWeight:     700,
            fontSize:       16,
            color:          'var(--success)',
          }}
        >
          📞 Call Customer — {addr.recipient_phone}
        </a>
      )}

      {/* COD reminder */}
      {delivery.payment_method === 'cod' && delivery.status !== 'delivered' && (
        <div style={{
          background: 'var(--warning-light)', border: '1.5px solid var(--warning)',
          borderRadius: 'var(--r-lg)', padding: '10px 14px', marginBottom: 12,
          fontSize: 14, fontWeight: 600, color: 'var(--warning)',
        }}>
          💵 Collect Cash — ₹{((delivery.total_amount || 0) / 100).toFixed(0)}
        </div>
      )}

      {/* Action buttons — large, single clear action */}
      {!isCompleted && (
        <div className="rider-actions">
          {delivery.status === 'assigned' && (
            <button
              className="rider-action-btn"
              style={{ background: 'var(--primary)', color: '#fff' }}
              onClick={() => accept.mutate()}
              disabled={accept.isPending}
            >
              {accept.isPending ? '…' : '✓ Accept Delivery'}
            </button>
          )}
          {delivery.status === 'accepted' && (
            <button
              className="rider-action-btn"
              style={{ background: 'var(--secondary)', color: '#fff' }}
              onClick={() => pickup.mutate()}
              disabled={pickup.isPending}
            >
              {pickup.isPending ? '…' : '📦 Picked Up from Shop'}
            </button>
          )}
          {(delivery.status === 'picked_up' || delivery.status === 'out_for_delivery') && (
            <button
              className="rider-action-btn"
              style={{ background: 'var(--success)', color: '#fff', fontSize: 18 }}
              onClick={() => {
                if (window.confirm('Mark this order as delivered?')) deliver.mutate();
              }}
              disabled={deliver.isPending}
            >
              {deliver.isPending ? '…' : '✅ Mark Delivered'}
            </button>
          )}
        </div>
      )}

      {isCompleted && (
        <div style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 700, padding: '12px 0', fontSize: 16 }}>
          ✅ Delivered
        </div>
      )}
    </div>
  );
}

export default function RiderPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey:        ['my-deliveries'],
    queryFn:         riderApi.getMyDeliveries,
    refetchInterval: 60000, // Poll every 60s
  });

  const deliveries = data?.deliveries || [];
  const active     = deliveries.filter(d => d.status !== 'delivered' && d.status !== 'cancelled');
  const done       = deliveries.filter(d => d.status === 'delivered');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>My Deliveries</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            {format(new Date(), "d MMMM, h:mm a")}
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => refetch()}>
          ↻ Refresh
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
          Loading your deliveries…
        </div>
      ) : active.length === 0 && done.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🛵</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>No deliveries assigned yet</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
            The shop will assign orders to you when they're ready
          </div>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--primary)' }}>
                Active ({active.length})
              </h2>
              {active.map(d => <DeliveryCard key={d.id} delivery={d} />)}
            </>
          )}

          {done.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 12px', color: 'var(--text-secondary)' }}>
                Completed Today ({done.length})
              </h2>
              {done.map(d => <DeliveryCard key={d.id} delivery={d} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
