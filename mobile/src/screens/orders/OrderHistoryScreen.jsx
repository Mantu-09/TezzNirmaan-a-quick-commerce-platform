import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ordersApi from '../../api/orders';
import { OrderCardSkeleton } from '../../components/common/SkeletonLoader';
import EmptyState from '../../components/common/EmptyState';
import { formatPaise } from '../../utils/money';
import { formatOrderTime, timeAgo } from '../../utils/date';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useCartStore from '../../store/cartStore';

// Status → color mapping
const STATUS_STYLE = {
  pending:          { bg: Colors.warningLight,  text: Colors.warning  },
  confirmed:        { bg: Colors.infoLight,     text: Colors.info     },
  preparing:        { bg: Colors.infoLight,     text: Colors.info     },
  ready_for_pickup: { bg: Colors.primaryLight,  text: Colors.primary  },
  out_for_delivery: { bg: Colors.primaryLight,  text: Colors.primary  },
  delivered:        { bg: Colors.successLight,  text: Colors.success  },
  cancelled:        { bg: Colors.errorLight,    text: Colors.error    },
};

function OrderCard({ order, onPress, onReorder }) {
  const subOrderCount = order.sub_orders?.length || 1;
  const status        = order.sub_orders?.[0]?.status || 'pending';
  const statusStyle   = STATUS_STYLE[status] || STATUS_STYLE.pending;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.orderNum}>#{order.order_number}</Text>
          <Text style={styles.orderTime}>{timeAgo(order.created_at)}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {status.replace(/_/g, ' ')}
          </Text>
        </View>
      </View>

      {/* Sub-order tier badges */}
      {subOrderCount > 1 && (
        <View style={styles.tierRow}>
          {order.sub_orders.map(s => (
            <View key={s.id} style={styles.tierPill}>
              <Text style={styles.tierPillText}>
                {s.delivery_tier === 'quick' ? '⚡ Quick' : '📅 Scheduled'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Item preview */}
      {order.sub_orders?.[0]?.order_items?.slice(0, 2).map(item => (
        <Text key={item.id} style={styles.itemPreview} numberOfLines={1}>
          · {item.product_name} × {item.quantity}
        </Text>
      ))}
      {(order.sub_orders?.[0]?.order_items?.length || 0) > 2 && (
        <Text style={styles.moreItems}>
          +{order.sub_orders[0].order_items.length - 2} more items
        </Text>
      )}

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.total}>{formatPaise(order.total_amount)}</Text>
        {/* Reorder — prominent CTA */}
        <TouchableOpacity style={styles.reorderBtn} onPress={onReorder}>
          <Ionicons name="refresh-outline" size={14} color={Colors.primary} />
          <Text style={styles.reorderText}>Reorder</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function OrderHistoryScreen({ navigation }) {
  const { addItem } = useCartStore();

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey:          ['orders'],
    queryFn:           ({ pageParam = 1 }) => ordersApi.getOrders(pageParam),
    getNextPageParam:  (last, pages) => last?.pagination?.hasMore ? pages.length + 1 : undefined,
    staleTime:         60 * 1000,
  });

  const orders = data?.pages?.flatMap(p => p?.orders || []) || [];

  const handleReorder = useCallback((order) => {
    const items = order.sub_orders?.flatMap(s => s.order_items || []) || [];
    if (items.length === 0) return;

    // Optimistically add all items back to cart
    items.forEach(item => {
      addItem({
        productId:      item.product_id,
        inventoryId:    item.inventory_id,
        shopId:         order.shop_id,
        name:           item.product_name,
        imageUrl:       item.product_image || null,
        unit:           item.unit,
        deliveryTier:   item.delivery_tier,
        unitPricePaise: item.unit_price,
        quantity:       item.quantity,
      });
    });

    Alert.alert('Added to Cart', `${items.length} item${items.length !== 1 ? 's' : ''} added to your cart.`, [
      { text: 'View Cart', onPress: () => navigation.navigate('HomeTab', { screen: 'CartTab' }) },
      { text: 'OK' },
    ]);
  }, [addItem, navigation]);

  const renderItem = useCallback(({ item: order }) => (
    <OrderCard
      order={order}
      onPress={() => navigation.navigate('OrderTracking', { orderId: order.id })}
      onReorder={() => handleReorder(order)}
    />
  ), [navigation, handleReorder]);

  const renderFooter = () =>
    isFetchingNextPage ? <OrderCardSkeleton /> : null;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.list}>
          {[1, 2, 3].map(i => <OrderCardSkeleton key={i} />)}
        </View>
      </SafeAreaView>
    );
  }

  if (orders.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          variant="orders"
          onAction={() => navigation.navigate('HomeTab')}
          actionLabel="Start Shopping"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={orders}
        keyExtractor={o => o.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={renderFooter}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.3}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing[4], paddingBottom: Spacing[8] },

  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[4], ...Shadow.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing[3] },
  orderNum:   { fontFamily: Typography.fontFamily.bold,    fontSize: Typography.size.md,  color: Colors.text },
  orderTime:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs,  color: Colors.textSecondary, marginTop: 2 },
  statusPill: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], borderRadius: BorderRadius.full },
  statusText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, textTransform: 'capitalize' },

  tierRow: { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[2] },
  tierPill: { backgroundColor: Colors.surface2, borderRadius: BorderRadius.full, paddingHorizontal: Spacing[3], paddingVertical: 3 },
  tierPillText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, color: Colors.textSecondary },

  itemPreview: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: 2 },
  moreItems:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: Spacing[2] },

  cardFooter:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[3] },
  total:        { fontFamily: Typography.fontFamily.bold,    fontSize: Typography.size.lg,  color: Colors.text },
  reorderBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.full, paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] },
  reorderText:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.primary },
});
