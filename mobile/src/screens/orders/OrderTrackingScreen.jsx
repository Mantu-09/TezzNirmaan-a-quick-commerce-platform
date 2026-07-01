import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ordersApi from '../../api/orders';
import SubOrderCard from '../../components/order/SubOrderCard';
import Button from '../../components/common/Button';
import { formatOrderTime } from '../../utils/date';
import { subscribeToOrderStatus } from '../../utils/supabase';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

export default function OrderTrackingScreen({ route, navigation }) {
  const { orderId } = route.params;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn:  () => ordersApi.getOrder(orderId),
    staleTime: 30 * 1000, // 30 seconds — realtime handles live updates
  });

  const order     = data?.order;
  const subOrders = order?.sub_orders || [];
  const hasTwoTiers = subOrders.length > 1;

  // Tab state for mixed-tier orders
  const [activeTab, setActiveTab] = useState(0);
  const activeSubOrder = subOrders[activeTab] || subOrders[0];

  // ── Supabase Realtime subscription ──────────────────────────
  useEffect(() => {
    if (!orderId) return;
    const unsub = subscribeToOrderStatus(orderId, (updatedSubOrder) => {
      // Merge the updated sub_order into the React Query cache
      queryClient.setQueryData(['order', orderId], (old) => {
        if (!old?.order) return old;
        return {
          ...old,
          order: {
            ...old.order,
            sub_orders: old.order.sub_orders.map(s =>
              s.id === updatedSubOrder.id ? { ...s, ...updatedSubOrder } : s
            ),
          },
        };
      });
    });
    return unsub;
  }, [orderId]);

  // ── Cancel mutation ──────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: (reason) => ordersApi.cancelOrder(orderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e) => Alert.alert('Cannot cancel', e.message),
  });

  const handleCancel = () => {
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'Keep Order', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: () => cancelMutation.mutate('Customer requested') },
      ]
    );
  };

  const canCancel = activeSubOrder && CANCELLABLE_STATUSES.includes(activeSubOrder.status);

  if (isLoading) {
    return (
      <View style={styles.loadingCenter}>
        <Ionicons name="hourglass-outline" size={40} color={Colors.textTertiary} />
        <Text style={styles.loadingText}>Loading order…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Order meta header */}
      <View style={styles.metaHeader}>
        <Text style={styles.orderNum}>#{order?.order_number}</Text>
        <Text style={styles.orderTime}>{formatOrderTime(order?.created_at)}</Text>
      </View>

      {/* Tier tabs — only shown for mixed-tier orders */}
      {hasTwoTiers && (
        <View style={styles.tabs}>
          {subOrders.map((sub, i) => {
            const isQuick = sub.delivery_tier === 'quick';
            return (
              <TouchableOpacity
                key={sub.id}
                style={[styles.tab, activeTab === i && styles.tabActive]}
                onPress={() => setActiveTab(i)}
              >
                <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>
                  {isQuick ? '⚡ Quick' : '📅 Scheduled'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Active sub-order card */}
        {activeSubOrder && <SubOrderCard subOrder={activeSubOrder} />}

        {/* Shop contact */}
        {order?.shop && (
          <View style={styles.shopBox}>
            <Ionicons name="storefront-outline" size={18} color={Colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.shopName}>{order.shop.name}</Text>
              {order.shop.phone && (
                <Text style={styles.shopPhone}>{order.shop.phone}</Text>
              )}
            </View>
            <Ionicons name="call-outline" size={18} color={Colors.primary} />
          </View>
        )}

        {/* Cancel button */}
        {canCancel && (
          <Button
            variant="outline"
            size="md"
            fullWidth
            loading={cancelMutation.isPending}
            onPress={handleCancel}
            style={styles.cancelBtn}
            textStyle={{ color: Colors.error }}
          >
            Cancel Order
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: Colors.background },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] },
  loadingText:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textTertiary },

  metaHeader: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  orderNum:  { fontFamily: Typography.fontFamily.bold,    fontSize: Typography.size.lg,  color: Colors.text },
  orderTime: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm,  color: Colors.textSecondary, marginTop: 2 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1, paddingVertical: Spacing[3], alignItems: 'center',
    borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  tabActive:     { borderBottomColor: Colors.primary },
  tabText:       { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.semiBold },

  scroll: { padding: Spacing[4] },

  shopBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[4], ...Shadow.sm,
  },
  shopName:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text },
  shopPhone: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },

  cancelBtn: { borderColor: Colors.error, marginTop: Spacing[2] },
});
