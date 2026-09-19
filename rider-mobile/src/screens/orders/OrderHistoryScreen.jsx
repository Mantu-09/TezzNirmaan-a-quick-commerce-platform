// ────────────────────────────────────────────────────────────
// OrderHistoryScreen — P2-D fix
//
// Changes from the broken Phase-1 version:
//   OLD: optimistically adds items to local cart store using stale
//        inventory_id / prices from order_items (often wrong or
//        null by the time the component renders).
//
//   NEW: calls POST /orders/:id/reorder (server-side)
//        → server validates current stock & prices
//        → returns { added, skipped, price_changes, skipped_items }
//        → shows appropriate bottom-sheet / alert based on result
//
// UX flows:
//   1. All items available + no price changes → success toast → Cart
//   2. Some unavailable → bottom sheet: "X added, Y unavailable: [list]"
//      + "View Cart" CTA
//   3. Price changes detected → price-change warning modal before Cart
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, ScrollView, Animated, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ordersApi from '../../api/orders';
import { OrderCardSkeleton } from '../../components/common/SkeletonLoader';
import EmptyState from '../../components/common/EmptyState';
import { formatPaise } from '../../utils/money';
import { formatOrderTime, timeAgo } from '../../utils/date';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import RatingBottomSheet from '../../components/order/RatingBottomSheet';

// ── Status → color mapping ────────────────────────────────────
const STATUS_STYLE = {
  pending:          { bg: Colors.warningLight,  text: Colors.warning  },
  confirmed:        { bg: Colors.infoLight,     text: Colors.info     },
  preparing:        { bg: Colors.infoLight,     text: Colors.info     },
  ready_for_pickup: { bg: Colors.primaryLight,  text: Colors.primary  },
  out_for_delivery: { bg: Colors.primaryLight,  text: Colors.primary  },
  delivered:        { bg: Colors.successLight,  text: Colors.success  },
  cancelled:        { bg: Colors.errorLight,    text: Colors.error    },
};

// ── Success toast (auto-dismiss) ─────────────────────────────
function SuccessToast({ visible, message }) {
  const opacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;
  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Ionicons name="checkmark-circle" size={18} color="#fff" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ── Reorder Result Bottom Sheet ──────────────────────────────
function ReorderSheet({ result, onViewCart, onClose }) {
  if (!result) return null;

  const hasPriceChanges = result.price_changes?.length > 0;
  const hasSkipped      = result.skipped > 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIconWrap, { backgroundColor: hasSkipped ? Colors.warningLight : Colors.successLight }]}>
              <Ionicons
                name={hasSkipped ? 'warning-outline' : 'checkmark-circle-outline'}
                size={28}
                color={hasSkipped ? Colors.warning : Colors.success}
              />
            </View>
            <Text style={styles.sheetTitle}>
              {hasSkipped
                ? `${result.added} added · ${result.skipped} unavailable`
                : `${result.added} item${result.added !== 1 ? 's' : ''} added to cart`
              }
            </Text>
            <Text style={styles.sheetSub}>
              {hasSkipped
                ? 'Some items are out of stock or no longer listed.'
                : 'Your cart is ready for checkout.'}
            </Text>
          </View>

          {/* Price change warning */}
          {hasPriceChanges && (
            <View style={styles.priceWarnBox}>
              <Ionicons name="pricetag-outline" size={14} color={Colors.warning} />
              <Text style={styles.priceWarnText}>
                Prices have changed since your last order for {result.price_changes.length} item{result.price_changes.length !== 1 ? 's' : ''}.
              </Text>
            </View>
          )}

          {/* Price changes detail */}
          {hasPriceChanges && (
            <View style={styles.priceList}>
              {result.price_changes.map((pc, i) => {
                const higher = pc.diff_paise > 0;
                return (
                  <View key={i} style={styles.priceRow}>
                    <Text style={styles.priceProduct} numberOfLines={1}>{pc.product_name}</Text>
                    <View style={styles.priceValues}>
                      <Text style={styles.priceOld}>{formatPaise(pc.original_price_paise)}</Text>
                      <Ionicons name={higher ? 'arrow-up' : 'arrow-down'} size={12} color={higher ? Colors.error : Colors.success} />
                      <Text style={[styles.priceNew, { color: higher ? Colors.error : Colors.success }]}>
                        {formatPaise(pc.current_price_paise)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Skipped items list */}
          {hasSkipped && result.skipped_items?.length > 0 && (
            <View style={styles.skippedBox}>
              <Text style={styles.skippedLabel}>Not available:</Text>
              {result.skipped_items.map((name, i) => (
                <Text key={i} style={styles.skippedItem}>· {name}</Text>
              ))}
            </View>
          )}

          {/* CTAs */}
          <TouchableOpacity style={styles.sheetCta} onPress={onViewCart}>
            <Ionicons name="cart" size={18} color="#fff" />
            <Text style={styles.sheetCtaText}>
              {result.added > 0 ? 'View Cart' : 'Go to Cart'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetSecondary} onPress={onClose}>
            <Text style={styles.sheetSecondaryText}>Continue Browsing</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── OrderCard ─────────────────────────────────────────────────
function OrderCard({ order, onPress, onReorder, reordering, onRate }) {
  const subOrderCount = order.sub_orders?.length || 1;
  const status        = order.sub_orders?.[0]?.status || 'pending';
  const statusStyle   = STATUS_STYLE[status] || STATUS_STYLE.pending;
  const isDelivered   = status === 'delivered';

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

        <View style={styles.cardActions}>
          {/* Rate button — only for delivered orders */}
          {isDelivered && onRate && (
            <TouchableOpacity
              style={styles.rateBtn}
              onPress={(e) => { e.stopPropagation(); onRate(order.id); }}
              accessibilityLabel="Rate this order"
              activeOpacity={0.7}
            >
              <Ionicons name="star-outline" size={13} color={Colors.warning} />
              <Text style={styles.rateBtnText}>Rate</Text>
            </TouchableOpacity>
          )}

          {/* Reorder CTA */}
          <TouchableOpacity
            style={[styles.reorderBtn, reordering && styles.reorderBtnLoading]}
            onPress={onReorder}
            disabled={reordering}
          >
            {reordering
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="refresh-outline" size={14} color={Colors.primary} />
            }
            <Text style={styles.reorderText}>
              {reordering ? 'Adding…' : 'Reorder'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── BasketCard — P4-3B: Multi-shop order group ───────────────
function BasketCard({ basketId, orders, onPressOrder }) {
  const [expanded, setExpanded] = useState(true);

  const basketTotal = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const shopNames   = orders.map(o => o.shops?.name || `Shop`).join(', ');
  const allStatuses = orders.flatMap(o => o.sub_orders?.map(s => s.status) || []);
  const overallStatus = allStatuses.includes('pending')       ? 'pending'
                      : allStatuses.includes('confirmed')     ? 'confirmed'
                      : allStatuses.includes('out_for_delivery') ? 'out_for_delivery'
                      : allStatuses.every(s => s === 'delivered') ? 'delivered'
                      : allStatuses.every(s => s === 'cancelled')  ? 'cancelled'
                      : 'pending';

  const statusStyle = STATUS_STYLE[overallStatus] || STATUS_STYLE.pending;

  return (
    <View style={styles.basketCard}>
      {/* Basket header */}
      <TouchableOpacity
        style={styles.basketHeader}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.8}
      >
        <View style={styles.basketIconWrap}>
          <Text style={styles.basketEmoji}>🛒</Text>
        </View>
        <View style={styles.basketHeaderText}>
          <Text style={styles.basketTitle}>Multi-shop order · {orders.length} shops</Text>
          <Text style={styles.basketShops} numberOfLines={1}>{shopNames}</Text>
        </View>
        <View style={styles.basketHeaderRight}>
          <Text style={styles.basketTotal}>{formatPaise(basketTotal)}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusStyle.bg, marginTop: 4 }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {overallStatus.replace(/_/g, ' ')}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={16}
            color={Colors.textSecondary}
            style={{ marginTop: 4 }}
          />
        </View>
      </TouchableOpacity>

      {/* Expanded shop order rows */}
      {expanded && (
        <View style={styles.basketOrders}>
          {orders.map((order, idx) => {
            const shopStatus = order.sub_orders?.[0]?.status || 'pending';
            const shopStyle  = STATUS_STYLE[shopStatus] || STATUS_STYLE.pending;
            return (
              <TouchableOpacity
                key={order.id}
                style={[styles.basketOrderRow, idx < orders.length - 1 && styles.basketOrderDivider]}
                onPress={() => onPressOrder(order.id)}
                activeOpacity={0.85}
              >
                <View style={styles.basketOrderLeft}>
                  <Text style={styles.basketOrderShop} numberOfLines={1}>
                    🏪 {order.shops?.name || 'Shop'}
                  </Text>
                  <Text style={styles.basketOrderNum}>#{order.order_number}</Text>
                </View>
                <View style={styles.basketOrderRight}>
                  <Text style={styles.basketOrderTotal}>{formatPaise(order.total_amount)}</Text>
                  <View style={[styles.statusPill, { backgroundColor: shopStyle.bg, marginTop: 2 }]}>
                    <Text style={[styles.statusText, { color: shopStyle.text }]}>
                      {shopStatus.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Filter constants ──────────────────────────────────────────
const STATUS_FILTERS = [
  { label: 'All',       value: null },
  { label: 'Pending',   value: 'pending' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled' },
];

// ── ReorderReminderCard ───────────────────────────────────────
function ReorderReminderCard({ order, onReorder, reordering }) {
  // Find the primary item with a reminder_days value
  const primaryItem = order.sub_orders?.[0]?.order_items?.find(
    item => item.reminder_days != null
  );
  if (!primaryItem) return null;

  // Calculate how many days since the order was placed
  const orderDate = new Date(order.created_at);
  const daysSince = Math.floor((Date.now() - orderDate) / (1000 * 60 * 60 * 24));
  if (daysSince < primaryItem.reminder_days) return null;

  return (
    <View style={styles.reminderCard}>
      <View style={styles.reminderIconWrap}>
        <Text style={styles.reminderEmoji}>📦</Text>
      </View>
      <View style={styles.reminderBody}>
        <Text style={styles.reminderProduct} numberOfLines={1}>
          {primaryItem.product_name}
        </Text>
        <Text style={styles.reminderSub}>
          Ordered {daysSince} days ago — Running low?
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.reminderCta, reordering && styles.reorderBtnLoading]}
        onPress={onReorder}
        disabled={reordering}
      >
        {reordering
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.reminderCtaText}>Order Again →</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function OrderHistoryScreen({ navigation }) {
  const queryClient = useQueryClient();

  // Per-order loading state (orderId → boolean)
  const [reorderingId, setReorderingId] = useState(null);

  // Rating sheet state — orderId of the order being rated
  const [rateOrderId, setRateOrderId] = useState(null);

  // Bottom sheet state
  const [sheetResult,  setSheetResult]  = useState(null);

  // Toast state
  const [toast,        setToast]        = useState({ visible: false, message: '' });

  // Search + filter state (P8-6)
  const [searchText,   setSearchText]   = useState('');
  const [statusFilter, setStatusFilter] = useState(null); // null = All
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef(null);

  const handleSearchChange = useCallback((text) => {
    setSearchText(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(text), 400);
  }, []);

  const {
    data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage,
  } = useInfiniteQuery({
    queryKey:          ['orders', debouncedSearch, statusFilter],
    queryFn:           ({ pageParam = 1 }) =>
      ordersApi.getOrders(pageParam, { search: debouncedSearch, status: statusFilter }),
    getNextPageParam:  (last, pages) => last?.pagination?.hasMore ? pages.length + 1 : undefined,
    staleTime:         60 * 1000,
  });

  const orders = data?.pages?.flatMap(p => p?.orders || []) || [];

  // P4-3B: Group orders by basket_id for multi-shop display
  // Returns an array of items that are either:
  //   { type: 'basket', basketId, orders: [...] }  — multi-shop group
  //   { type: 'order', ...order }                  — single order (basket_id === null)
  const listItems = React.useMemo(() => {
    const baskets = {};
    const result  = [];
    const seen    = new Set();

    for (const order of orders) {
      if (order.basket_id) {
        if (!baskets[order.basket_id]) {
          baskets[order.basket_id] = [];
        }
        baskets[order.basket_id].push(order);
      }
    }

    for (const order of orders) {
      if (seen.has(order.id)) continue;
      if (order.basket_id) {
        if (!seen.has(order.basket_id)) {
          seen.add(order.basket_id);
          baskets[order.basket_id].forEach(o => seen.add(o.id));
          result.push({ type: 'basket', key: order.basket_id, basketId: order.basket_id, orders: baskets[order.basket_id] });
        }
      } else {
        seen.add(order.id);
        result.push({ type: 'order', key: order.id, ...order });
      }
    }
    return result;
  }, [orders]);

  // ── Reorder handler (P2-D fixed) ─────────────────────────────
  const handleReorder = useCallback(async (order) => {
    setReorderingId(order.id);
    try {
      const result = await ordersApi.reorder(order.id);

      if (result.added === 0) {
        // All items unavailable
        setSheetResult(result);
        return;
      }

      if (result.skipped > 0 || result.price_changes?.length > 0) {
        // Partial add or price changes → show bottom sheet
        setSheetResult(result);
        return;
      }

      // All items added, no warnings → toast + navigate
      setToast({ visible: true, message: `${result.added} item${result.added !== 1 ? 's' : ''} added to cart ✓` });
      setTimeout(() => {
        navigation.navigate('CartTab');
      }, 1200);

    } catch (e) {
      setSheetResult({
        added: 0, skipped: 0,
        price_changes: [],
        skipped_items: ['Failed to load order — please try again'],
      });
    } finally {
      setReorderingId(null);
    }
  }, [navigation]);

  const handleViewCart = useCallback(() => {
    setSheetResult(null);
    navigation.navigate('CartTab');
  }, [navigation]);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'basket') {
      return (
        <BasketCard
          key={item.basketId}
          basketId={item.basketId}
          orders={item.orders}
          onPressOrder={(orderId) => navigation.navigate('OrderTracking', { orderId })}
        />
      );
    }
    // Single-shop order — show reminder card if applicable
    return (
      <View>
        <OrderCard
          order={item}
          onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
          onReorder={() => handleReorder(item)}
          reordering={reorderingId === item.id}
          onRate={(orderId) => setRateOrderId(orderId)}
        />
        <ReorderReminderCard
          order={item}
          onReorder={() => handleReorder(item)}
          reordering={reorderingId === item.id}
        />
      </View>
    );
  }, [navigation, handleReorder, reorderingId]);

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
      {/* Success toast */}
      <SuccessToast visible={toast.visible} message={toast.message} />

      {/* ── Search bar (P8-6) ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={handleSearchChange}
            placeholder="Search by product or order #"
            placeholderTextColor={Colors.textTertiary}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchText(''); setDebouncedSearch(''); }}>
              <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Status filter chips (P8-6) ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={String(f.value)}
            style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, statusFilter === f.value && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={listItems}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptySearch}>
              <Text style={styles.emptySearchIcon}>🔍</Text>
              <Text style={styles.emptySearchText}>
                {debouncedSearch
                  ? `No orders matching "${debouncedSearch}"`
                  : 'No orders yet'}
              </Text>
            </View>
          ) : null
        }
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.3}
      />

      {/* Reorder result bottom sheet */}
      <ReorderSheet
        result={sheetResult}
        onViewCart={handleViewCart}
        onClose={() => setSheetResult(null)}
      />

      {/* Rating bottom sheet — opened when user taps Rate on a delivered order */}
      <RatingBottomSheet
        visible={!!rateOrderId}
        orderId={rateOrderId}
        onDismiss={() => setRateOrderId(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing[4], paddingBottom: Spacing[8] },

  // Search bar (P8-6)
  searchRow: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[2],
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.text,
    paddingVertical: 2,
  },

  // Filter chips (P8-6)
  filterScroll:  { flexGrow: 0 },
  filterContent: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[3], gap: Spacing[2] },
  filterChip: {
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[2],
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  filterChipText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  filterChipTextActive: { color: '#fff' },

  // Empty search state
  emptySearch: { alignItems: 'center', paddingVertical: Spacing[10] },
  emptySearchIcon: { fontSize: 36, marginBottom: Spacing[3] },
  emptySearchText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Reminder card (P8-6)
  reminderCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primaryLight || '#FFF5EB',
    borderRadius: BorderRadius.lg,
    marginHorizontal: 0,
    marginBottom: Spacing[3],
    marginTop: -Spacing[2],
    padding: Spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    gap: Spacing[2],
  },
  reminderIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  reminderEmoji: { fontSize: 16 },
  reminderBody:  { flex: 1 },
  reminderProduct: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.xs,
    color: Colors.text,
    marginBottom: 1,
  },
  reminderSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  reminderCta: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  reminderCtaText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.xs,
    color: '#fff',
  },

  // Order card
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[4], ...Shadow.md,
  },
  cardHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing[3] },
  orderNum:      { fontFamily: Typography.fontFamily.bold,    fontSize: Typography.size.md,  color: Colors.text },
  orderTime:     { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs,  color: Colors.textSecondary, marginTop: 2 },
  statusPill:    { paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], borderRadius: BorderRadius.full },
  statusText:    { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, textTransform: 'capitalize' },

  tierRow:       { flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[2] },
  tierPill:      { backgroundColor: Colors.surface2, borderRadius: BorderRadius.full, paddingHorizontal: Spacing[3], paddingVertical: 3 },
  tierPillText:  { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, color: Colors.textSecondary },

  itemPreview:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: 2 },
  moreItems:     { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: Spacing[2] },

  cardFooter:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing[3], borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[3] },
  total:            { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  cardActions:      { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  reorderBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.full, paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] },
  reorderBtnLoading:{ opacity: 0.65 },
  reorderText:      { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.primary },
  rateBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warning + '18', borderRadius: BorderRadius.full, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderWidth: 1, borderColor: Colors.warning + '40' },
  rateBtnText:      { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.warning },

  // Toast
  toast: {
    position: 'absolute', top: Spacing[4], alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.success, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[3],
    zIndex: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 8,
  },
  toastText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: '#fff' },

  // Bottom sheet
  sheetOverlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing[5], paddingBottom: Spacing[8], paddingTop: Spacing[3],
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing[4],
  },
  sheetHeader: { alignItems: 'center', marginBottom: Spacing[4] },
  sheetIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center', marginBottom: Spacing[3],
  },
  sheetTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.lg,
    color:      Colors.text,
    textAlign:  'center',
    marginBottom: Spacing[1],
  },
  sheetSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    textAlign:  'center',
  },

  // Price change warning
  priceWarnBox: {
    flexDirection:   'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.warningLight,
    borderRadius:    10, padding: Spacing[3], marginBottom: Spacing[3],
    borderLeftWidth: 3, borderLeftColor: Colors.warning,
  },
  priceWarnText: {
    flex: 1,
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.warning,
  },

  priceList:   { marginBottom: Spacing[3] },
  priceRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing[2], borderBottomWidth: 1, borderBottomColor: Colors.border },
  priceProduct:{ fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text, flex: 1, marginRight: 8 },
  priceValues: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceOld:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, textDecorationLine: 'line-through' },
  priceNew:    { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },

  // Skipped items
  skippedBox:  { backgroundColor: Colors.errorLight, borderRadius: 10, padding: Spacing[3], marginBottom: Spacing[4], borderLeftWidth: 3, borderLeftColor: Colors.error },
  skippedLabel:{ fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[1] },
  skippedItem: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.error, marginTop: 2 },

  // Sheet CTAs
  sheetCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[4], marginTop: Spacing[2],
  },
  sheetCtaText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: '#fff' },
  sheetSecondary: { alignItems: 'center', paddingVertical: Spacing[3] },
  sheetSecondaryText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },

  // ── P4-3B: Basket card styles ─────────────────────────────
  basketCard: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.xl,
    overflow:        'hidden',
    marginBottom:    Spacing[3],
    ...Shadow.sm,
    borderWidth:     1,
    borderColor:     Colors.primary + '25',
  },
  basketHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    padding:        Spacing[4],
    gap:            Spacing[3],
  },
  basketIconWrap: {
    width: 38, height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight || '#FFF5EB',
    alignItems: 'center', justifyContent: 'center',
  },
  basketEmoji: { fontSize: 20 },
  basketHeaderText: { flex: 1 },
  basketTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.base,
    color:      Colors.text,
    marginBottom: 2,
  },
  basketShops: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
  },
  basketHeaderRight: { alignItems: 'flex-end' },
  basketTotal: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.md,
    color:      Colors.text,
  },
  basketOrders: {
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  basketOrderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        Spacing[4],
    paddingVertical: Spacing[3],
  },
  basketOrderDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  basketOrderLeft:  { flex: 1, marginRight: Spacing[3] },
  basketOrderShop: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.text,
    marginBottom: 2,
  },
  basketOrderNum: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
  },
  basketOrderRight: { alignItems: 'flex-end' },
  basketOrderTotal: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      Colors.text,
    marginBottom: 2,
  },
});
