'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, riderApi } from '../../../lib/api';
import { format } from 'date-fns';

const STATUS_LABEL = {
  ready_for_pickup: '✅ Ready',
  out_for_delivery: '🛵 Out for Delivery',
  delivered:        '🏠 Delivered',
};

export default function DeliveryPage() {
  const queryClient = useQueryClient();

  const { data: ordersData, isLoading } = useQuery({
    queryKey:        ['delivery-orders'],
    queryFn:         () => ordersApi.getShopOrders({ status: 'ready_for_pickup,out_for_delivery', limit: 50 }),
    refetchInterval: 30000,
  });

  const { data: ridersData } = useQuery({
    queryKey: ['riders'],
    queryFn:  riderApi.getRiders,
    staleTime: 5 * 60 * 1000,
  });

  const assign = useMutation({
    mutationFn: ({ orderId, riderId }) => ordersApi.assignRider(orderId, riderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['delivery-orders'] }),
  });

  const orders = ordersData?.orders || [];
  const riders = ridersData?.riders || [];

  const ready    = orders.filter(o => o.status === 'ready_for_pickup');
  const enRoute  = orders.filter(o => o.status === 'out_for_delivery');

  return (
    <div className="page-body">
      <div style={{ marginBottom: 'var(--s5)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Delivery Board</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
          {format(new Date(), "EEEE, d MMMM")} · {orders.length} active deliveries
        </p>
      </div>

      {/* Riders on duty */}
      <div className="card card-pad" style={{ marginBottom: 'var(--s5)' }}>
        <div style={{ fontWeight: 600, marginBottom: 'var(--s3)' }}>🛵 Delivery Team</div>
        {riders.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            No delivery people set up yet. Add them via the admin panel.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--s3)', flexWrap: 'wrap' }}>
            {riders.map(rider => {
              const myOrders = enRoute.filter(o => o.rider_id === rider.id);
              return (
                <div key={rider.id} style={{
                  background:   'var(--surface-2)',
                  border:       '1.5px solid var(--border)',
                  borderRadius: 'var(--r-xl)',
                  padding:      'var(--s4)',
                  minWidth:     160,
                }}>
                  <div style={{ fontWeight: 600 }}>{rider.full_name || rider.phone}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {myOrders.length} order{myOrders.length !== 1 ? 's' : ''} en route
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Waiting for rider */}
      {ready.length > 0 && (
        <div style={{ marginBottom: 'var(--s6)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 'var(--s4)', color: 'var(--warning)' }}>
            ⏳ Waiting for Pickup ({ready.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
            {ready.map(order => (
              <div key={order.id} className="card card-pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--s3)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      #{order.order_number}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {order.order_items?.length || 0} items
                      {order.delivery_address && ` · ${order.delivery_address.address_line1}`}
                    </div>
                  </div>
                  <span className={`badge badge-${order.delivery_tier}`}>
                    {order.delivery_tier === 'quick' ? '⚡ Quick' : '📅 Scheduled'}
                  </span>
                </div>

                {/* Rider assign buttons */}
                {riders.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Assign to:</div>
                    <div style={{ display: 'flex', gap: 'var(--s2)', flexWrap: 'wrap' }}>
                      {riders.map(rider => (
                        <button
                          key={rider.id}
                          className={`btn btn-sm ${order.rider_id === rider.id ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => assign.mutate({ orderId: order.id, riderId: rider.id })}
                          disabled={assign.isPending}
                        >
                          {order.rider_id === rider.id ? '✓ ' : ''}{rider.full_name?.split(' ')[0] || rider.phone?.slice(-4)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* En route */}
      {enRoute.length > 0 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 'var(--s4)', color: 'var(--primary)' }}>
            🛵 Out for Delivery ({enRoute.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
            {enRoute.map(order => {
              const rider = riders.find(r => r.id === order.rider_id);
              const addr  = order.delivery_address || {};
              return (
                <div key={order.id} className="card card-pad" style={{ borderLeft: '4px solid var(--primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>#{order.order_number}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                        📍 {addr.address_line1}, {addr.city}
                      </div>
                      {rider && (
                        <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 4, fontWeight: 600 }}>
                          🛵 {rider.full_name || rider.phone}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {addr.recipient_phone && (
                        <a
                          href={`tel:${addr.recipient_phone}`}
                          className="btn btn-outline btn-sm"
                          style={{ display: 'inline-flex' }}
                        >
                          📞 Call
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isLoading && orders.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--s16)', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>No active deliveries</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>Orders ready for pickup will appear here</div>
        </div>
      )}
    </div>
  );
}
