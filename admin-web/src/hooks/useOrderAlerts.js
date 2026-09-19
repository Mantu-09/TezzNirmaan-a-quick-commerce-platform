'use client';
import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToNewOrders } from '../lib/supabase';
import { playOrderAlertUrgent, setTitleBadge, unlockAudio } from '../lib/sounds';
import useAuthStore from '../store/authStore';

/**
 * useOrderAlerts — subscribes to realtime new orders for the shop.
 *
 * Mount this ONCE in the dashboard layout (not per-page).
 * It invalidates the React Query orders cache on every new order,
 * plays the chime alert, and updates the tab title badge.
 *
 * @param {(subOrder: object) => void} onNewOrder - callback with the new sub_order row
 */
export function useOrderAlerts(onNewOrder) {
  const shopId      = useAuthStore(s => s.shopId);
  const queryClient = useQueryClient();
  const pendingRef  = useRef(0);

  // Unlock audio on first user interaction
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener('click',     unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
    return () => {
      document.removeEventListener('click',     unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Reset tab badge when window is focused
  useEffect(() => {
    const onFocus = () => {
      pendingRef.current = 0;
      setTitleBadge(0);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const handleNewOrder = useCallback((subOrder) => {
    // Play alert sound
    playOrderAlertUrgent();

    // Update tab title badge (useful when tab is not visible)
    if (!document.hasFocus()) {
      pendingRef.current += 1;
      setTitleBadge(pendingRef.current);
    }

    // Browser notification (if granted)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🛒 New Order — TezzNirmaan', {
        body:    `Order ${subOrder.order_number || ''} received!`,
        icon:    '/icon.png',
        badge:   '/icon.png',
        vibrate: [200, 100, 200],
      });
    }

    // Refresh orders list in React Query cache
    queryClient.invalidateQueries({ queryKey: ['shop-orders'] });

    // Call parent callback (to highlight the new card)
    onNewOrder?.(subOrder);
  }, [queryClient, onNewOrder]);

  // Subscribe to Supabase realtime
  useEffect(() => {
    if (!shopId) return;
    const unsub = subscribeToNewOrders(shopId, handleNewOrder);
    return unsub;
  }, [shopId, handleNewOrder]);

  // Request notification permission (non-blocking)
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);
}
