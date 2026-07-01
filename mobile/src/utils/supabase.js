import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl     = Constants.expoConfig?.extra?.supabaseUrl     || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY — realtime will not work.');
}

// This client is used ONLY for Supabase Realtime subscriptions.
// All regular data fetching goes through the Express backend API (src/api/client.js).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // We manage auth ourselves via the backend — disable Supabase auth auto-refresh
    persistSession:     false,
    autoRefreshToken:   false,
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

/**
 * Subscribe to sub_order status changes for a given order.
 * Returns an unsubscribe function to call on cleanup.
 *
 * @param {string}   orderId
 * @param {function} onStatusChange - called with the updated sub_order row
 * @param {string}   token          - user's JWT (to scope the subscription)
 */
export function subscribeToOrderStatus(orderId, onStatusChange, token) {
  const channel = supabase
    .channel(`order-tracking-${orderId}`)
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'sub_orders',
        filter: `order_id=eq.${orderId}`,
      },
      (payload) => {
        if (payload.new) onStatusChange(payload.new);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Subscribed to order ${orderId}`);
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to new notifications for the current user.
 * Returns an unsubscribe function.
 */
export function subscribeToNotifications(userId, onNotification) {
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
