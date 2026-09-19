/**
 * Supabase realtime client for the dashboard.
 * Used exclusively for subscribing to live order updates.
 * Does NOT use the service role key — uses anon key with RLS.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] Missing env vars — realtime disabled');
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

/**
 * Subscribe to new sub_orders for a shop.
 * Calls onNewOrder(subOrder) whenever a new order arrives.
 * Returns an unsubscribe function.
 */
export function subscribeToNewOrders(shopId, onNewOrder) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`shop-orders-${shopId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'sub_orders',
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        onNewOrder(payload.new);
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error('[Supabase] Realtime channel error for shop', shopId);
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to status updates on a specific order.
 * Calls onUpdate(updated) on every UPDATE event.
 */
export function subscribeToOrderStatus(orderId, onUpdate) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`order-status-${orderId}`)
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'sub_orders',
        filter: `id=eq.${orderId}`,
      },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Subscribe to new notifications for a user (B1).
 * Calls onNotification(notification) on every INSERT event.
 * Returns an unsubscribe function.
 */
export function subscribeToNotifications(userId, onNotification) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) onNotification(payload.new);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

