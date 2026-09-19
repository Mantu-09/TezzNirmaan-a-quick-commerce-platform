// ────────────────────────────────────────────────────────────
// ShopOrderQueueScreen — P8-4A
//
// The primary shop-owner mobile view.
// Shows pending + in-progress sub-orders with one-tap actions.
//
// Features:
//   • Real-time new order alerts via Supabase Postgres changes
//   • Sound + vibration + badge on new order
//   • Swipe right = accept, swipe left = reject (Swipeable)
//   • Button fallback for both actions
//   • Filter tabs: Quick ⚡ | Scheduled 📅 | All
//   • In-progress section (preparing, confirmed, ready)
//   • Pull-to-refresh
// ────────────────────────────────────────────────────────────
import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, Animated, Vibration,
  Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView }   from 'react-native-safe-area-context';
import { Ionicons }       from '@expo/vector-icons';
import { useNavigation }  from '@react-navigation/native';
import * as Haptics       from 'expo-haptics';
import { Audio }          from 'expo-av';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useAuthStore       from '../../store/authStore';
import { subscribeToShopOrders } from '../../utils/supabase';
import {
  getShopOrderQueue,
  confirmShopOrder,
  rejectShopOrder,
  startPreparing,
  markReady,
} from '../../api/shopOwner';

// ── Constants ─────────────────────────────────────────────────
const REJECT_REASONS = [
  'Item out of stock',
  'Shop is closing early',
  'Too many orders right now',
  'Customer unreachable',
  'Other',
];

const STATUS_CONFIG = {
  new:        { label: 'New',        color: Colors.error,   bg: Colors.errorLight   },
  confirmed:  { label: 'Confirmed',  color: Colors.success, bg: Colors.successLight },
  preparing:  { label: 'Preparing',  color: Colors.warning, bg: Colors.warningLight },
  ready:      { label: 'Ready',      color: Colors.info,    bg: Colors.infoLight    },
  dispatched: { label: 'Dispatched', color: Colors.secondary, bg: Colors.secondaryLight },
};

// ── Helpers ────────────────────────────────────────────────────
const fmtPaise = (p) => `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ── Status Badge ──────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Tier Badge ────────────────────────────────────────────────
function TierBadge({ tier }) {
  const isQuick = tier === 'quick';
  return (
    <View style={[styles.tierBadge, { backgroundColor: isQuick ? Colors.quickLight : Colors.scheduledLight }]}>
      <Text style={[styles.tierText, { color: isQuick ? Colors.quickText : Colors.scheduledText }]}>
        {isQuick ? '⚡ Quick' : '📅 Sched'}
      </Text>
    </View>
  );
}

// ── Reject Sheet ──────────────────────────────────────────────
function RejectReasonSheet({ visible, onSelect, onCancel }) {
  if (!visible) return null;
  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>Reason for Rejection</Text>
        {REJECT_REASONS.map(r => (
          <TouchableOpacity
            key={r}
            style={styles.sheetRow}
            onPress={() => onSelect(r)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            <Text style={styles.sheetRowText}>{r}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.sheetCancel} onPress={onCancel}>
          <Text style={styles.sheetCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Order Card ────────────────────────────────────────────────
function OrderCard({ order, onAccept, onReject, onAction, actioning }) {
  const isNew        = order.status === 'new';
  const isInProgress = ['confirmed', 'preparing', 'ready'].includes(order.status);
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  // Pulse animation for new orders to draw attention
  useEffect(() => {
    if (!isNew) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.92, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isNew]);

  const itemsSummary = order.items
    ?.slice(0, 2)
    .map(i => `${i.product_name} × ${i.quantity}`)
    .join(', ') + (order.items?.length > 2 ? ` +${order.items.length - 2} more` : '');

  const nextAction = order.status === 'confirmed'
    ? { label: '▶ Start Preparing', fn: () => onAction('preparing', order.id) }
    : order.status === 'preparing'
    ? { label: '✓ Mark Ready',      fn: () => onAction('ready',     order.id) }
    : null;

  return (
    <Animated.View style={[
      styles.card,
      isNew && styles.cardNew,
      { transform: isNew ? [{ scale: pulseAnim }] : [] },
    ]}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <StatusBadge status={order.status} />
          <TierBadge   tier={order.delivery_tier} />
        </View>
        <Text style={styles.timeAgo}>{timeAgo(order.created_at)}</Text>
      </View>

      {/* Order meta */}
      <View style={styles.cardMeta}>
        <Text style={styles.orderNum}>#{order.order_number}</Text>
        <Text style={styles.orderAmount}>{fmtPaise(order.total_amount)}</Text>
      </View>

      {/* Payment indicator */}
      <View style={styles.paymentRow}>
        <Ionicons
          name={order.payment_method === 'online' ? 'checkmark-circle' : 'cash'}
          size={14}
          color={order.payment_method === 'online' ? Colors.success : Colors.warning}
        />
        <Text style={[
          styles.paymentText,
          { color: order.payment_method === 'online' ? Colors.success : Colors.warning },
        ]}>
          {order.payment_method === 'online' ? 'UPI Paid ✓' : 'Cash on Delivery'}
        </Text>
        {/* R3: COD status pill — only shown for COD orders with a tracked status */}
        {order.payment_method !== 'online' && order.cod_status && order.cod_status !== 'not_applicable' && (
          <View style={[
            styles.codStatusPill,
            order.cod_status === 'collected' && styles.codPillCollected,
            order.cod_status === 'remitted'  && styles.codPillRemitted,
          ]}>
            <Text style={styles.codStatusText}>
              {order.cod_status === 'pending'   ? '⏳ Pending' :
               order.cod_status === 'collected' ? '✓ Collected' :
               order.cod_status === 'remitted'  ? '✓ Remitted' : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Items summary */}
      {itemsSummary ? (
        <Text style={styles.itemsSummary} numberOfLines={2}>{itemsSummary}</Text>
      ) : null}

      {/* Address */}
      {order.delivery_address && (
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={13} color={Colors.textTertiary} />
          <Text style={styles.addressText} numberOfLines={1}>
            {order.delivery_address.address_line1}, {order.delivery_address.area}
          </Text>
        </View>
      )}

      {/* Actions */}
      {isNew ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onReject(order.id)}
            disabled={!!actioning}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={18} color={Colors.error} />
            <Text style={[styles.actionBtnText, { color: Colors.error }]}>Reject</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={() => onAccept(order.id)}
            disabled={!!actioning}
            activeOpacity={0.8}
          >
            {actioning === order.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={[styles.actionBtnText, { color: '#fff' }]}>Accept</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : nextAction ? (
        <TouchableOpacity
          style={styles.nextActionBtn}
          onPress={nextAction.fn}
          disabled={!!actioning}
          activeOpacity={0.8}
        >
          {actioning === order.id ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.nextActionText}>{nextAction.label}</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {/* View detail link */}
      <TouchableOpacity
        style={styles.detailLink}
        onPress={() => {/* Navigation handled by parent */}}
        activeOpacity={0.6}
      >
        <Text style={styles.detailLinkText}>View full details →</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function ShopOrderQueueScreen() {
  const navigation             = useNavigation();
  const { user }               = useAuthStore();
  const shopId                 = user?.shop_id;

  const [orders,      setOrders]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [actioning,   setActioning]   = useState(null);  // subOrderId being actioned
  const [rejectingId, setRejectingId] = useState(null);  // sheet open for this id
  const [filter,      setFilter]      = useState('all'); // all | quick | scheduled
  const [newCount,    setNewCount]    = useState(0);

  // ── Load orders ──────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getShopOrderQueue({
        status: 'new,confirmed,preparing,ready',
        limit:  100,
      });
      const orderList = Array.isArray(data) ? data : (data?.sub_orders || []);
      setOrders(orderList);
      setNewCount(orderList.filter(o => o.status === 'new').length);
    } catch (e) {
      Alert.alert('Error', 'Could not load orders: ' + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Realtime subscription ────────────────────────────────
  useEffect(() => {
    if (!shopId) return;

    const unsub = subscribeToShopOrders(shopId, async (updatedRow) => {
      // Trigger haptic + refresh on any change
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Vibration.vibrate([0, 250, 100, 250]);
      
      // Play audio alert (R16)
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../../../assets/notify.wav')
        );
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) sound.unloadAsync();
        });
      } catch (err) {
        console.warn('Failed to play order alert sound:', err);
      }

      load(); // Re-fetch to get full data with items & address
    });

    return unsub;
  }, [shopId, load]);

  // ── Actions ──────────────────────────────────────────────
  const handleAccept = useCallback(async (subOrderId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActioning(subOrderId);
    try {
      await confirmShopOrder(subOrderId);
      setOrders(prev =>
        prev.map(o => o.id === subOrderId ? { ...o, status: 'confirmed' } : o)
      );
      setNewCount(c => Math.max(0, c - 1));
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setActioning(null);
    }
  }, []);

  const handleRejectOpen = useCallback((subOrderId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRejectingId(subOrderId);
  }, []);

  const handleRejectConfirm = useCallback(async (reason) => {
    const subOrderId = rejectingId;
    setRejectingId(null);
    setActioning(subOrderId);
    try {
      await rejectShopOrder(subOrderId, reason);
      setOrders(prev => prev.filter(o => o.id !== subOrderId));
      setNewCount(c => Math.max(0, c - 1));
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setActioning(null);
    }
  }, [rejectingId]);

  const handleAction = useCallback(async (type, subOrderId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActioning(subOrderId);
    try {
      if (type === 'preparing') await startPreparing(subOrderId);
      else if (type === 'ready')    await markReady(subOrderId);
      setOrders(prev =>
        prev.map(o => o.id === subOrderId ? { ...o, status: type } : o)
      );
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setActioning(null);
    }
  }, []);

  // ── Filter ───────────────────────────────────────────────
  const filtered = orders.filter(o => {
    if (filter === 'quick')     return o.delivery_tier === 'quick';
    if (filter === 'scheduled') return o.delivery_tier === 'scheduled';
    return true;
  });

  const newOrders  = filtered.filter(o => o.status === 'new');
  const inProgress = filtered.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status));

  // ── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading orders…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>
            {newCount > 0
              ? `🔴 ${newCount} New Order${newCount > 1 ? 's' : ''}`
              : '📋 Order Queue'}
          </Text>
          <Text style={styles.headerSub}>{user?.shop_name || 'Your Shop'}</Text>
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {[
            { key: 'all',       label: 'All' },
            { key: 'quick',     label: '⚡' },
            { key: 'scheduled', label: '📅' },
          ].map(f => (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {/* ── New Orders Section ── */}
        {newOrders.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>⚡ New Orders</Text>
            {newOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                onAccept={handleAccept}
                onReject={handleRejectOpen}
                onAction={handleAction}
                actioning={actioning}
              />
            ))}
          </>
        )}

        {/* ── In Progress Section ── */}
        {inProgress.length > 0 && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>In Progress</Text>
              <View style={styles.dividerLine} />
            </View>
            {inProgress.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                onAccept={handleAccept}
                onReject={handleRejectOpen}
                onAction={handleAction}
                actioning={actioning}
              />
            ))}
          </>
        )}

        {/* ── Empty State ── */}
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySub}>No active orders right now. New orders appear here instantly.</Text>
          </View>
        )}
      </ScrollView>

      {/* Reject reason bottom sheet */}
      <RejectReasonSheet
        visible={!!rejectingId}
        onSelect={handleRejectConfirm}
        onCancel={() => setRejectingId(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontFamily: Typography.fontFamily.medium },

  header: {
    backgroundColor:  Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.lg,
    color:      Colors.text,
  },
  headerSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    marginTop:  2,
  },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius:      20,
    backgroundColor:   Colors.surface2,
    borderWidth:       1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText:       { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  filterTextActive: { color: '#fff' },

  list: { padding: Spacing.md, gap: 12, paddingBottom: 100 },

  sectionLabel: {
    fontFamily:  Typography.fontFamily.bold,
    fontSize:    Typography.size.sm,
    color:       Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom:  4,
  },

  divider:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  dividerLine:  { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textTertiary },

  card: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.lg,
    padding:         Spacing.md,
    ...Shadow.sm,
    gap: 6,
  },
  cardNew: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
  },

  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderLeft: { flexDirection: 'row', gap: 6 },
  timeAgo:        { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs },

  tierBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  tierText:   { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs },

  cardMeta:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNum:    { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: Colors.text },
  orderAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },

  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  paymentText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs },

  // R3: COD status pill
  codStatusPill: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  codPillCollected: { backgroundColor: 'rgba(22,163,74,0.12)' },
  codPillRemitted:  { backgroundColor: 'rgba(59,130,246,0.12)' },
  codStatusText: {
    fontSize: 10, fontWeight: '700',
    color: '#d97706',
  },

  itemsSummary: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    lineHeight: 18,
  },

  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addressText: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textTertiary,
  },

  actionRow:   { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn:   {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: BorderRadius.md,
  },
  rejectBtn:   { backgroundColor: Colors.errorLight, borderWidth: 1, borderColor: Colors.error + '40' },
  acceptBtn:   { backgroundColor: Colors.primary },
  actionBtnText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md },

  nextActionBtn: {
    backgroundColor: Colors.primaryLight,
    borderWidth:     1, borderColor: Colors.primary + '40',
    paddingVertical: 10, borderRadius: BorderRadius.md,
    alignItems:      'center', marginTop: 4,
  },
  nextActionText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.sm,
    color:      Colors.primary,
  },

  detailLink:     { alignItems: 'flex-end' },
  detailLinkText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.primary },

  empty:      { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontFamily: Typography.fontFamily.bold,   fontSize: Typography.size.xl,  color: Colors.text, marginBottom: 6 },
  emptySub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', maxWidth: 260 },

  // Reject bottom sheet
  overlay: {
    position: 'absolute', inset: 0,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius:  24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40, gap: 4,
  },
  sheetTitle:       { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text, marginBottom: 8 },
  sheetRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetRowText:     { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.md, color: Colors.text },
  sheetCancel:      { marginTop: 12, alignItems: 'center', paddingVertical: 12, backgroundColor: Colors.surface2, borderRadius: BorderRadius.md },
  sheetCancelText:  { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.textSecondary },
});
