// ────────────────────────────────────────────────────────────
// OrderTrackingScreen.jsx — P5-1: Real-Time WebSocket Tracking
//
// Changes from previous version (P1-B / P4-2B):
//   • Supabase Realtime subscription replaced by WebSocket (wsClient)
//   • Live map panel: rider pin animates as location updates arrive
//   • Status progression bar with labelled steps
//   • ETA bubble derived from haversine distance to customer
//   • WS connection badge (●Live / ○ Connecting)
//   • All pre-existing features preserved:
//       – Tier tabs for multi-shop orders
//       – 30-min cancel countdown + CancelOrderSheet
//       – Cashback delivered banner (P4-2B)
//       – Rating bottom sheet (B4)
//       – Shop contact row
// ────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView }        from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Ionicons }            from '@expo/vector-icons';
import * as Haptics            from 'expo-haptics';
import * as ordersApi          from '../../api/orders';
import * as returnsApi         from '../../api/returns';  // P6-3
import SubOrderCard            from '../../components/order/SubOrderCard';
import Button                  from '../../components/common/Button';
import RatingBottomSheet       from '../../components/order/RatingBottomSheet';
import CancelOrderSheet        from '../../components/order/CancelOrderSheet';
import { formatOrderTime }     from '../../utils/date';
import { getRatingStatus }     from '../../api/ratings';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { estimateCashback }    from '../../api/cashback';
import { useNavigation }       from '@react-navigation/native';
import useAuthStore             from '../../store/authStore';
import { wsClient }            from '../../services/websocket';  // P5-1
import { openSupportChat }     from '../../services/freshchat';  // P7-4

// ── Map (optional dep) ────────────────────────────────────────
let MapView = null;
let Marker  = null;
let Polyline = null;
try {
  const maps = require('react-native-maps');
  MapView  = maps.default;
  Marker   = maps.Marker;
  Polyline = maps.Polyline;
} catch (_) {
  // react-native-maps not installed — map panel shows placeholder
}

// ── Constants ─────────────────────────────────────────────────
const CANCELLABLE_STATUSES = ['pending', 'confirmed'];
const CANCEL_WINDOW_MS     = 30 * 60 * 1000;
const ONLINE_METHODS       = ['upi', 'card', 'netbanking', 'wallet'];
const { width: SCREEN_W }  = Dimensions.get('window');
const MAP_HEIGHT           = Math.round(SCREEN_W * 0.6);

// Status progression steps (for the progress bar)
const STATUS_STEPS = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];
const STATUS_LABELS = {
  pending:          'Placed',
  confirmed:        'Confirmed',
  preparing:        'Packing',
  ready_for_pickup: 'Ready',
  out_for_delivery: 'On the way',
  delivered:        'Delivered',
};

// ── Haversine distance (km) ───────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R  = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(dLat / 2) ** 2 +
             Math.cos(lat1 * Math.PI / 180) *
             Math.cos(lat2 * Math.PI / 180) *
             Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── MapPanel ─────────────────────────────────────────────────
function MapPanel({ riderLocation, customerLocation, wsConnected }) {
  const mapRef = useRef(null);

  // Animate map to follow rider on each location update
  useEffect(() => {
    if (riderLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude:      riderLocation.latitude,
        longitude:     riderLocation.longitude,
        latitudeDelta:  0.012,
        longitudeDelta: 0.012,
      }, 600);
    }
  }, [riderLocation]);

  if (!MapView) {
    // Graceful fallback: map package not installed
    return (
      <View style={[styles.mapPlaceholder, { height: MAP_HEIGHT }]}>
        <Ionicons name="map-outline" size={40} color={Colors.textTertiary} />
        <Text style={styles.mapPlaceholderText}>Live map coming soon</Text>
      </View>
    );
  }

  const initialRegion = riderLocation
    ? { latitude: riderLocation.latitude, longitude: riderLocation.longitude, latitudeDelta: 0.015, longitudeDelta: 0.015 }
    : customerLocation
    ? { latitude: customerLocation.latitude, longitude: customerLocation.longitude, latitudeDelta: 0.015, longitudeDelta: 0.015 }
    : { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.05, longitudeDelta: 0.05 }; // Bengaluru fallback

  return (
    <View style={{ height: MAP_HEIGHT, position: 'relative' }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {/* Rider pin */}
        {riderLocation && (
          <Marker coordinate={riderLocation} title="Your rider" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.riderPin}>
              <Text style={{ fontSize: 22 }}>🏍️</Text>
            </View>
          </Marker>
        )}

        {/* Customer / destination pin */}
        {customerLocation && (
          <Marker coordinate={customerLocation} title="Delivery address" anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.destPin}>
              <Ionicons name="location" size={28} color={Colors.primary} />
            </View>
          </Marker>
        )}

        {/* Route line */}
        {riderLocation && customerLocation && (
          <Polyline
            coordinates={[riderLocation, customerLocation]}
            strokeColor={Colors.primary}
            strokeWidth={3}
            lineDashPattern={[8, 4]}
          />
        )}
      </MapView>

      {/* WS connection badge */}
      <View style={[styles.wsBadge, { backgroundColor: wsConnected ? 'rgba(22,163,74,0.85)' : 'rgba(100,100,100,0.75)' }]}>
        <View style={[styles.wsDot, { backgroundColor: wsConnected ? '#4ade80' : '#9ca3af' }]} />
        <Text style={styles.wsBadgeText}>{wsConnected ? 'Live' : 'Connecting…'}</Text>
      </View>
    </View>
  );
}

// ── StatusBar ─────────────────────────────────────────────────
function StatusProgressBar({ currentStatus }) {
  const currentIdx = STATUS_STEPS.indexOf(currentStatus);
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        {STATUS_STEPS.map((step, i) => {
          const done   = i <= currentIdx;
          const active = i === currentIdx;
          return (
            <React.Fragment key={step}>
              {/* Circle */}
              <View style={[styles.progressDot, done && styles.progressDotDone, active && styles.progressDotActive]}>
                {done && !active && <Ionicons name="checkmark" size={10} color="#fff" />}
                {active && <View style={styles.progressDotInner} />}
              </View>
              {/* Connector line */}
              {i < STATUS_STEPS.length - 1 && (
                <View style={[styles.progressLine, i < currentIdx && styles.progressLineDone]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
      {/* Labels below */}
      <View style={styles.progressLabels}>
        {STATUS_STEPS.map((step, i) => (
          <Text
            key={step}
            style={[
              styles.progressLabel,
              i === currentIdx && styles.progressLabelActive,
            ]}
            numberOfLines={1}
          >
            {STATUS_LABELS[step]}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function OrderTrackingScreen({ route, navigation }) {
  const { orderId }   = route.params;
  const queryClient   = useQueryClient();
  const token         = useAuthStore((s) => s.token);
  const navHook       = useNavigation();

  const { data, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn:  () => ordersApi.getOrder(orderId),
    staleTime: 30 * 1000,
  });

  const order      = data?.order;
  const subOrders  = order?.sub_orders || [];
  const hasTwoTiers = subOrders.length > 1;

  const [activeTab,       setActiveTab]      = useState(0);
  const [showRating,      setShowRating]     = useState(false);
  const [showCancel,      setShowCancel]     = useState(false);
  const [minutesLeft,     setMinutesLeft]    = useState(null);
  const [riderLocation,   setRiderLocation]  = useState(null); // { latitude, longitude }
  const [wsConnected,     setWsConnected]    = useState(false);
  const [etaMin,          setEtaMin]         = useState(null);
  const timerRef = useRef(null);
  const mapRef   = useRef(null);

  const activeSubOrder  = subOrders[activeTab] || subOrders[0];
  const isDelivered     = subOrders.some(s => s.status === 'delivered');
  const currentStatus   = activeSubOrder?.status || 'pending';
  const isOutForDelivery = currentStatus === 'out_for_delivery';

  // P6-3: Return eligibility for the active sub-order
  const { data: eligibilityData } = useQuery({
    queryKey: ['return-eligibility', activeSubOrder?.id],
    queryFn:  () => returnsApi.checkReturnEligibility(activeSubOrder.id),
    enabled:  !!activeSubOrder?.id && activeSubOrder?.status === 'delivered',
    staleTime: 60 * 1000,
  });
  const returnEligible = eligibilityData?.eligible === true;

  // Customer delivery coordinates (from order data if available)
  const customerLocation = order?.delivery_lat && order?.delivery_lng
    ? { latitude: order.delivery_lat, longitude: order.delivery_lng }
    : null;

  // ── Rating prompt on delivery ─────────────────────────────
  useEffect(() => {
    if (!isDelivered || !orderId) return;
    let cancelled = false;
    getRatingStatus(orderId)
      .then(d => { if (!cancelled && !d?.hasRated) setShowRating(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isDelivered, orderId]);

  // ── Cancel countdown ──────────────────────────────────────
  const allCancellable = subOrders.length > 0 &&
    subOrders.every(s => CANCELLABLE_STATUSES.includes(s.status));

  useEffect(() => {
    if (!order?.placed_at || !allCancellable) {
      setMinutesLeft(null);
      clearInterval(timerRef.current);
      return;
    }
    const updateTimer = () => {
      const elapsed   = Date.now() - new Date(order.placed_at).getTime();
      const remaining = CANCEL_WINDOW_MS - elapsed;
      setMinutesLeft(remaining <= 0 ? 0 : Math.ceil(remaining / 60000));
      if (remaining <= 0) clearInterval(timerRef.current);
    };
    updateTimer();
    timerRef.current = setInterval(updateTimer, 30_000);
    return () => clearInterval(timerRef.current);
  }, [order?.placed_at, allCancellable]);

  // ── P5-1: WebSocket connection ────────────────────────────
  // Connect when the screen mounts with a valid orderId + token.
  // Disconnect on unmount. Replaces Supabase Realtime.
  useEffect(() => {
    if (!orderId || !token) return;

    wsClient.connect(token, 'customer', orderId);

    const unsubConnected    = wsClient.on('connected',    () => setWsConnected(true));
    const unsubDisconnected = wsClient.on('disconnected', () => setWsConnected(false));

    // Rider location update — move pin + compute ETA
    const unsubLocation = wsClient.on('RIDER_LOCATION', ({ lat, lng }) => {
      const coord = { latitude: lat, longitude: lng };
      setRiderLocation(coord);

      if (customerLocation) {
        const distKm = haversineKm(lat, lng, customerLocation.latitude, customerLocation.longitude);
        // Rough ETA: 20 km/h average speed in city = 3 min/km
        setEtaMin(Math.max(1, Math.round(distKm * 3)));
      }
    });

    // Order status update from server — merge into React Query cache
    const unsubStatus = wsClient.on('ORDER_STATUS', ({ status, metadata }) => {
      queryClient.setQueryData(['order', orderId], (old) => {
        if (!old?.order) return old;
        const subOrderId = metadata?.sub_order_id;
        return {
          ...old,
          order: {
            ...old.order,
            sub_orders: old.order.sub_orders.map(s =>
              (!subOrderId || s.id === subOrderId) ? { ...s, status } : s
            ),
          },
        };
      });

      // Haptic feedback on key milestones
      if (status === 'out_for_delivery') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (status === 'delivered') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Invalidate so delivered state pulls fresh data
        queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      }
    });

    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubLocation();
      unsubStatus();
      wsClient.disconnect();
    };
  }, [orderId, token]);

  // ── Cancel mutation ───────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }) => ordersApi.cancelOrder(orderId, reason),
    onSuccess: (result) => {
      setShowCancel(false);
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      const refundMsg = result?.data?.refund_initiated
        ? '\n\nYour refund will be credited within 5–7 business days.'
        : '';
      Alert.alert('Order Cancelled', `Your order has been cancelled.${refundMsg}`);
    },
    onError: (err) => {
      setShowCancel(false);
      const shopPhone = err?.metadata?.shop_phone;
      Alert.alert(
        'Cannot Cancel',
        err.message + (shopPhone ? `\n\nFor help, contact the shop: ${shopPhone}` : ''),
        [{ text: 'OK' }]
      );
    },
  });

  const canCancel = allCancellable && minutesLeft !== null && minutesLeft > 0;
  const paymentMethod   = order?.payment_method;
  const isOnlinePayment = ONLINE_METHODS.includes(paymentMethod);

  const cashbackEarned = order?.total_amount > 0
    ? estimateCashback(order.total_amount)
    : { paise: 0, percent: 0 };

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

      {/* ── Live Map — only during out_for_delivery ─────────── */}
      {isOutForDelivery && (
        <MapPanel
          riderLocation={riderLocation}
          customerLocation={customerLocation}
          wsConnected={wsConnected}
        />
      )}

      {/* ── Order meta header ─────────────────────────────────*/}
      <View style={styles.metaHeader}>
        <View>
          <Text style={styles.orderNum}>#{order?.order_number}</Text>
          <Text style={styles.orderTime}>{formatOrderTime(order?.placed_at)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {/* WS live badge (when out for delivery) */}
          {isOutForDelivery && (
            <View style={[styles.liveBadge, { backgroundColor: wsConnected ? Colors.success + '18' : Colors.border }]}>
              <View style={[styles.liveDot, { backgroundColor: wsConnected ? Colors.success : Colors.textTertiary }]} />
              <Text style={[styles.liveBadgeText, { color: wsConnected ? Colors.success : Colors.textTertiary }]}>
                {wsConnected ? 'Live' : 'Connecting'}
              </Text>
            </View>
          )}
          {/* ETA bubble */}
          {isOutForDelivery && etaMin !== null && (
            <View style={styles.etaBadge}>
              <Ionicons name="time-outline" size={12} color={Colors.primary} />
              <Text style={styles.etaText}>~{etaMin} min away</Text>
            </View>
          )}
          {/* Cancel countdown */}
          {canCancel && (
            <View style={styles.countdownBadge}>
              <Ionicons name="time-outline" size={13} color={Colors.warning} />
              <Text style={styles.countdownText}>{minutesLeft} min to cancel</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Status progress bar ───────────────────────────────*/}
      <StatusProgressBar currentStatus={currentStatus} />

      {/* ── Tier tabs ─────────────────────────────────────────*/}
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
        {activeSubOrder && <SubOrderCard subOrder={activeSubOrder} />}

        {/* P4-2B: Cashback banner */}
        {isDelivered && cashbackEarned.paise > 0 && (
          <View style={styles.cashbackBanner}>
            <View style={styles.cashbackBannerLeft}>
              <Text style={styles.cashbackBannerEmoji}>🎉</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cashbackBannerTitle}>
                  Delivered!{' '}
                  <Text style={styles.cashbackBannerAmt}>
                    ₹{Math.floor(cashbackEarned.paise / 100)}
                  </Text>{' '}cashback added to wallet
                </Text>
                <Text style={styles.cashbackBannerSub}>
                  {cashbackEarned.percent}% cashback · expires in 90 days
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.cashbackViewBtn}
              onPress={() => navHook.navigate('WalletTab')}
              accessibilityLabel="View wallet"
            >
              <Text style={styles.cashbackViewBtnText}>View wallet</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.success} />
            </TouchableOpacity>
          </View>
        )}

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
            variant="outline" size="md" fullWidth
            loading={cancelMutation.isPending}
            onPress={() => setShowCancel(true)}
            style={styles.cancelBtn}
            textStyle={{ color: Colors.error }}
          >
            Cancel Order
          </Button>
        )}

        {/* Cancel window expired */}
        {allCancellable && minutesLeft === 0 && (
          <View style={styles.windowExpiredNotice}>
            <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.windowExpiredText}>
              Cancellation window has expired. Contact the shop for assistance.
            </Text>
          </View>
        )}

        {returnEligible && (
          <Button
            variant="outline"
            size="md"
            fullWidth
            onPress={() => navHook.navigate('RequestReturn', {
              subOrderId:  activeSubOrder.id,
              orderNumber: order?.order_number,
              shopName:    order?.shop?.name,
            })}
            style={[styles.cancelBtn, { borderColor: Colors.warning, marginTop: Spacing[3] }]}
            textStyle={{ color: Colors.warning }}
            testID="request-return-btn"
          >
            🔄 Request Return / Refund
          </Button>
        )}

        {/* P7-4: Need help? — visible once order is placed */}
        <TouchableOpacity
          style={styles.helpLink}
          onPress={() => openSupportChat({ order_number: order?.order_number })}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={Colors.primary} />
          <Text style={styles.helpLinkText}>Need help with this order?</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Rating sheet */}
      <RatingBottomSheet
        visible={showRating}
        orderId={orderId}
        onDismiss={() => setShowRating(false)}
      />

      {/* Cancel sheet */}
      {showCancel && (
        <CancelOrderSheet
          orderId={orderId}
          isOnlinePayment={isOnlinePayment}
          loading={cancelMutation.isPending}
          onConfirm={(reason) => cancelMutation.mutate({ orderId, reason })}
          onDismiss={() => setShowCancel(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: Colors.background },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] },
  loadingText:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textTertiary },

  // Map
  mapPlaceholder: {
    backgroundColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', gap: Spacing[2],
  },
  mapPlaceholderText: {
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textTertiary,
  },
  riderPin: { alignItems: 'center', justifyContent: 'center' },
  destPin:  { alignItems: 'center', justifyContent: 'center' },
  wsBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
  },
  wsDot:  { width: 6, height: 6, borderRadius: 3 },
  wsBadgeText: { color: '#fff', fontSize: 11, fontFamily: Typography.fontFamily.semiBold },

  // Header
  metaHeader: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  orderNum:  { fontFamily: Typography.fontFamily.bold,    fontSize: Typography.size.lg, color: Colors.text },
  orderTime: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },

  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing[2], paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  liveDot:      { width: 5, height: 5, borderRadius: 3 },
  liveBadgeText: { fontSize: 11, fontFamily: Typography.fontFamily.semiBold },

  etaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: Spacing[2], paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.primary + '30',
  },
  etaText: { fontFamily: Typography.fontFamily.semiBold, fontSize: 11, color: Colors.primary },

  countdownBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.warning + '18',
    paddingHorizontal: Spacing[2], paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.warning + '40',
  },
  countdownText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, color: Colors.warning },

  // Progress bar
  progressWrap:   { backgroundColor: Colors.surface, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.border },
  progressTrack:  { flexDirection: 'row', alignItems: 'center' },
  progressDot:    { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  progressDotDone:{ backgroundColor: Colors.primary },
  progressDotActive: { backgroundColor: Colors.primary, width: 18, height: 18, borderRadius: 9 },
  progressDotInner:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  progressLine:      { flex: 1, height: 2, backgroundColor: Colors.border },
  progressLineDone:  { backgroundColor: Colors.primary },
  progressLabels:    { flexDirection: 'row', marginTop: Spacing[1] },
  progressLabel:     { flex: 1, fontSize: 9, color: Colors.textTertiary, fontFamily: Typography.fontFamily.regular, textAlign: 'center' },
  progressLabelActive: { color: Colors.primary, fontFamily: Typography.fontFamily.semiBold },

  // Tabs
  tabs: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: Spacing[3], alignItems: 'center', borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabActive:     { borderBottomColor: Colors.primary },
  tabText:       { fontFamily: Typography.fontFamily.medium,   fontSize: Typography.size.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontFamily: Typography.fontFamily.semiBold },

  scroll: { padding: Spacing[4] },

  // Shop
  shopBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[4], ...Shadow.sm,
  },
  shopName:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text },
  shopPhone: { fontFamily: Typography.fontFamily.regular,  fontSize: Typography.size.sm,   color: Colors.textSecondary, marginTop: 2 },

  cancelBtn: { borderColor: Colors.error, marginTop: Spacing[2] },

  windowExpiredNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2],
    marginTop: Spacing[2], padding: Spacing[3],
    backgroundColor: Colors.border, borderRadius: BorderRadius.lg,
  },
  windowExpiredText: {
    flex: 1, fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 18,
  },

  // Cashback
  cashbackBanner: {
    backgroundColor: '#F0FDF4', borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: '#BBF7D0',
    padding: Spacing[4], marginBottom: Spacing[4], gap: Spacing[3],
  },
  cashbackBannerLeft:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  cashbackBannerEmoji: { fontSize: 22 },
  cashbackBannerTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: '#166534' },
  cashbackBannerAmt:   { fontFamily: Typography.fontFamily.bold, color: '#15803D' },
  cashbackBannerSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: '#4B7A5A', marginTop: 2 },
  cashbackViewBtn:     { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-end' },
  cashbackViewBtnText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, color: Colors.success },

  // P7-4: Help link
  helpLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing[2], paddingVertical: Spacing[4], marginTop: Spacing[2],
  },
  helpLinkText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.primary,
    textDecorationLine: 'underline',
  },
});
