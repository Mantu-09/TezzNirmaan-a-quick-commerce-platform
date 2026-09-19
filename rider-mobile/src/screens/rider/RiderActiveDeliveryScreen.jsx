// ────────────────────────────────────────────────────────────
// RiderActiveDeliveryScreen.jsx — P9-4 (replaces RiderDeliveryScreen)
//
// The most important screen in the rider app.
// What changed from previous version:
//   • "1 of N" indicator when multiple assignments
//   • MapView with rider-dot → polyline → customer pin
//   • "Navigate in Google Maps" deep link (one tap, turn-by-turn)
//   • Tap customer name/phone to call — no copy required
//   • Order items list from sub_order items
//   • Distance calculation from rider GPS to customer
//   • "Report Issue" → navigates to RiderIssueScreen bottom-sheet style
//   • Confetti on successful delivery (kept from v1)
//   • Haptic on every state change
// ────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Animated, Linking, ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView }       from 'react-native-safe-area-context';
import { Ionicons }           from '@expo/vector-icons';
import * as Haptics           from 'expo-haptics';
import * as ImagePicker       from 'expo-image-picker';
import * as Location          from 'expo-location';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { client } from '../../api/client';

const { width: SCREEN_W } = Dimensions.get('window');
const MAP_HEIGHT = Math.round(Dimensions.get('window').height * 0.38);

// ── API helpers ───────────────────────────────────────────────
async function fetchAssignment(assignmentId) {
  const { data } = await client.get(`/rider/deliveries/${assignmentId}`);
  return data?.data || data;
}

async function fetchAllActive() {
  const { data } = await client.get('/rider/deliveries?status=assigned,picked_up&limit=20');
  return data?.data || [];
}

async function markPickedUp(assignmentId) {
  const { data } = await client.post(`/rider/deliveries/${assignmentId}/pickup`);
  return data;
}

async function markDelivered(assignmentId, proofPhotoUrl = null) {
  const { data } = await client.post(
    `/rider/deliveries/${assignmentId}/deliver`,
    proofPhotoUrl ? { proof_photo_url: proofPhotoUrl } : {}
  );
  return data;
}

// ── Distance helper ───────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Confetti ──────────────────────────────────────────────────
function Confetti({ visible }) {
  const pieces = useRef(
    [...Array(20)].map(() => ({
      x:      new Animated.Value(0),
      y:      new Animated.Value(0),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
      color: ['#E8521A', '#FFD700', '#22c55e', '#3b82f6', '#a855f7'][Math.floor(Math.random() * 5)],
      startX: Math.random() * 300 - 150,
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    const anims = pieces.map(p =>
      Animated.parallel([
        Animated.timing(p.x,      { toValue: p.startX, duration: 1500, useNativeDriver: true }),
        Animated.timing(p.y,      { toValue: 300,      duration: 1500, useNativeDriver: true }),
        Animated.timing(p.rotate, { toValue: 1,        duration: 1500, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(800),
          Animated.timing(p.opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      ])
    );
    Animated.stagger(50, anims).start(() => {
      pieces.forEach(p => { p.x.setValue(0); p.y.setValue(0); p.rotate.setValue(0); p.opacity.setValue(1); });
    });
  }, [visible]);

  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute', top: '40%', left: '50%',
            width: 10, height: 10, borderRadius: 2,
            backgroundColor: p.color,
            transform: [
              { translateX: p.x }, { translateY: p.y },
              { rotate: p.rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] }) },
            ],
            opacity: p.opacity,
          }}
        />
      ))}
    </View>
  );
}

// ── Map placeholder (MapView is native — falls back gracefully) ──
function DeliveryMap({ riderLoc, destLat, destLon, destLabel }) {
  // Try to import MapView at render time — graceful fallback if not available
  const [MapView, setMapView] = useState(null);
  const [Marker, setMarker]   = useState(null);
  const [Polyline, setPolyline] = useState(null);

  useEffect(() => {
    try {
      const maps = require('react-native-maps');
      setMapView(() => maps.default);
      setMarker(() => maps.Marker);
      setPolyline(() => maps.Polyline);
    } catch {
      // react-native-maps not linked — show static placeholder
    }
  }, []);

  const hasCoords = destLat && destLon;

  if (!MapView || !hasCoords) {
    // Attractive static fallback — tap to open Google Maps
    const openMaps = () => {
      if (!hasCoords) return;
      const q = encodeURIComponent(destLabel || `${destLat},${destLon}`);
      const url = `https://www.google.com/maps/search/?api=1&query=${q}`;
      Linking.openURL(url);
    };
    return (
      <TouchableOpacity
        onPress={hasCoords ? openMaps : undefined}
        activeOpacity={0.85}
        style={[styles.mapPlaceholder, { height: MAP_HEIGHT }]}
      >
        <View style={styles.mapPlaceholderInner}>
          <Ionicons name="map" size={40} color={Colors.primary} />
          <Text style={styles.mapPlaceholderTitle}>
            {hasCoords ? destLabel || 'Customer Location' : 'No GPS coordinates'}
          </Text>
          {hasCoords && (
            <Text style={styles.mapPlaceholderSub}>Tap to view in Maps</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  const midLat = riderLoc ? (riderLoc.latitude + destLat) / 2 : destLat;
  const midLon = riderLoc ? (riderLoc.longitude + destLon) / 2 : destLon;

  return (
    <MapView
      style={{ height: MAP_HEIGHT, width: '100%' }}
      initialRegion={{ latitude: midLat, longitude: midLon, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
      showsUserLocation
      showsMyLocationButton={false}
    >
      {/* Rider dot — uses showsUserLocation above */}
      {/* Customer pin */}
      <Marker coordinate={{ latitude: destLat, longitude: destLon }} title={destLabel || 'Customer'}>
        <View style={styles.mapPin}>
          <Ionicons name="location" size={22} color="#fff" />
        </View>
      </Marker>
      {/* Route polyline rider → customer */}
      {riderLoc && (
        <Polyline
          coordinates={[
            { latitude: riderLoc.latitude, longitude: riderLoc.longitude },
            { latitude: destLat,          longitude: destLon },
          ]}
          strokeColor={Colors.primary}
          strokeWidth={3}
          lineDashPattern={[8, 4]}
        />
      )}
    </MapView>
  );
}

// ── Action button ──────────────────────────────────────────────
function ActionButton({ label, onPress, disabled, loading, variant = 'primary', icon, style }) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        variant === 'secondary' && styles.actionBtnSecondary,
        variant === 'danger'    && styles.actionBtnDanger,
        disabled && styles.actionBtnDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : Colors.primary} />
        : <>
            {icon && <Ionicons name={icon} size={16} color={variant === 'primary' ? '#fff' : variant === 'danger' ? '#dc2626' : Colors.primary} style={{ marginRight: 5 }} />}
            <Text style={[
              styles.actionBtnText,
              variant === 'secondary' && styles.actionBtnTextSecondary,
              variant === 'danger'    && styles.actionBtnTextDanger,
              disabled && styles.actionBtnTextDisabled,
            ]}>
              {label}
            </Text>
          </>
      }
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────
export default function RiderActiveDeliveryScreen() {
  const route       = useRoute();
  const navigation  = useNavigation();
  const queryClient = useQueryClient();
  const { assignmentId } = route.params || {};

  const [showConfetti,   setShowConfetti]   = useState(false);
  const [proofPhotoUri,  setProofPhotoUri]  = useState(null);
  const [riderLoc,       setRiderLoc]       = useState(null);

  // ── Fetch this assignment ────────────────────────────────────
  const { data: assignment, isLoading } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn:  () => fetchAssignment(assignmentId),
    enabled:  !!assignmentId,
    refetchInterval: 15_000,
  });

  // ── Fetch all active assignments for "1 of N" count ─────────
  const { data: allActive = [] } = useQuery({
    queryKey: ['allActiveDeliveries'],
    queryFn:  fetchAllActive,
    refetchInterval: 30_000,
  });

  const totalAssigned = allActive.length;
  const thisIndex     = allActive.findIndex(a => a.id === assignmentId);
  const positionLabel = totalAssigned > 1
    ? `${thisIndex + 1} of ${totalAssigned}`
    : null;

  // ── Get rider location ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setRiderLoc(loc.coords);
      } catch {}
    })();
  }, []);

  // ── Derived data ─────────────────────────────────────────────
  const subOrder    = assignment?.sub_orders;
  const order       = subOrder?.orders;
  const shop        = subOrder?.shops;
  const address     = order?.addresses;
  const items       = subOrder?.order_items || [];
  const isCOD       = subOrder?.payment_method === 'cod';
  const isPickedUp  = assignment?.status === 'picked_up';
  const isDelivered = assignment?.status === 'delivered';

  const earningPaise = assignment?.rider_earning_paise || 0;
  const earningStr   = earningPaise > 0 ? `₹${(earningPaise / 100).toFixed(0)} earning` : '';
  const orderNum     = order?.order_number || (assignmentId || '').slice(0, 8).toUpperCase();
  const customerName = order?.customer_name || 'Customer';
  const customerPhone= order?.customer_phone;

  // Delivery address coords (if backend returns them)
  const destLat   = address?.latitude  || order?.delivery_lat;
  const destLon   = address?.longitude || order?.delivery_lon;
  const destLabel = address ? `${address.street}, ${address.city}` : '';

  // Distance
  const distKm = riderLoc && destLat && destLon
    ? haversineKm(riderLoc.latitude, riderLoc.longitude, destLat, destLon).toFixed(1)
    : null;

  // ── Mutations ─────────────────────────────────────────────────
  const { mutate: doPickup, isPending: picking } = useMutation({
    mutationFn: () => markPickedUp(assignmentId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['assignment', assignmentId] });
      queryClient.invalidateQueries({ queryKey: ['allActiveDeliveries'] });
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', err.message);
    },
  });

  const { mutate: doDeliver, isPending: delivering } = useMutation({
    mutationFn: () => markDelivered(assignmentId, proofPhotoUri),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['allActiveDeliveries'] });

      // R3: For COD orders, show cash collection screen before confetti
      // isCOD is derived from subOrder?.payment_method === 'cod' (line ~287)
      if (isCOD) {
        navigation.replace('CodCollection', {
          assignmentId,
          amountPaise:   subOrder?.total_amount || 0,
          customerName,
          subOrderNumber: subOrder?.sub_order_number || '',
        });
      } else {
        // Online payment — show confetti and go home
        setShowConfetti(true);
        setTimeout(() => {
          setShowConfetti(false);
          navigation.goBack();
        }, 2800);
      }
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', err.message);
    },
  });

  // ── Handlers ──────────────────────────────────────────────────
  const handlePickup = () => {
    Alert.alert(
      'Mark as Picked Up',
      `Confirm you collected the order from ${shop?.name || 'the shop'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Picked Up', onPress: () => doPickup() },
      ]
    );
  };

  const handleDeliver = () => {
    Alert.alert(
      'Mark as Delivered',
      'Confirm the order has been handed to the customer?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm Delivered', onPress: () => doDeliver() },
      ]
    );
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access required for delivery proof photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7, aspect: [4, 3] });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setProofPhotoUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // ── Google Maps navigation deep link ──────────────────────────
  const openGoogleMapsNav = () => {
    if (!destLat && !destLabel) return;
    const q = destLat
      ? `${destLat},${destLon}`
      : encodeURIComponent(destLabel);
    // Google Maps turn-by-turn navigation
    const url = `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open Google Maps.'));
  };

  // ── Call customer ─────────────────────────────────────────────
  const callCustomer = () => {
    if (!customerPhone) return;
    Linking.openURL(`tel:${customerPhone}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ── Report Issue ─────────────────────────────────────────────
  const openReportIssue = () => {
    navigation.navigate('RiderIssue', { assignmentId });
  };

  // ── Loading / error states ────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading delivery details…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!assignment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.errorText}>Assignment not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Confetti visible={showConfetti} />

      {/* ── Map (top 38% of screen) ─────────────────────────── */}
      <DeliveryMap
        riderLoc={riderLoc}
        destLat={destLat}
        destLon={destLon}
        destLabel={destLabel || customerName}
      />

      {/* ── Scrollable bottom panel ──────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header row: order# + "1 of N" ─────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.orderNum}>#{orderNum}</Text>
            {earningStr ? <Text style={styles.earningStr}>{earningStr}</Text> : null}
          </View>
          <View style={styles.rightMeta}>
            {isCOD && (
              <View style={styles.codPill}>
                <Text style={styles.codPillText}>COD</Text>
              </View>
            )}
            {positionLabel && (
              <View style={styles.positionPill}>
                <Ionicons name="layers-outline" size={11} color={Colors.textSecondary} />
                <Text style={styles.positionText}>{positionLabel}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Order Items ────────────────────────────────────── */}
        {items.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="cube-outline" size={15} color={Colors.primary} />
              <Text style={styles.cardTitle}>Items ({items.length})</Text>
            </View>
            {items.map((item, i) => (
              <View key={item.id || i} style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
                <Text style={styles.itemName} numberOfLines={1}>{item.product_name || item.name || 'Item'}</Text>
                <Text style={styles.itemQty}>×{item.quantity}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Delivery address ─────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="location" size={15} color={Colors.primary} />
            <Text style={styles.cardTitle}>Delivery Address</Text>
            {distKm && <Text style={styles.distancePill}>{distKm} km away</Text>}
          </View>
          <Text style={styles.addressText}>
            {address ? `${address.street}, ${address.city}` : 'Address not available'}
          </Text>

          {/* ── Customer contact (tap to call) ──────────────── */}
          <TouchableOpacity
            style={styles.contactRow}
            onPress={callCustomer}
            disabled={!customerPhone}
            activeOpacity={0.7}
          >
            <View style={styles.contactIconCircle}>
              <Ionicons name="call" size={14} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactName}>{customerName}</Text>
              {customerPhone && <Text style={styles.contactPhone}>{customerPhone}</Text>}
            </View>
            {customerPhone && (
              <View style={styles.callBadge}>
                <Text style={styles.callBadgeText}>Call</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* ── Navigate in Google Maps ──────────────────────── */}
          <TouchableOpacity style={styles.mapsBtn} onPress={openGoogleMapsNav} activeOpacity={0.8}>
            <Ionicons name="navigate" size={15} color="#fff" />
            <Text style={styles.mapsBtnText}>Navigate in Google Maps</Text>
          </TouchableOpacity>
        </View>

        {/* ── Pickup section ───────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.stepCircle, isPickedUp && styles.stepCircleDone]}>
              {isPickedUp
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <Text style={styles.stepNum}>1</Text>
              }
            </View>
            <Text style={styles.cardTitle}>Pickup from {shop?.name || 'Shop'}</Text>
          </View>
          <Text style={styles.addressText}>{shop?.address || 'Shop address not available'}</Text>
          {!isPickedUp && !isDelivered && (
            <ActionButton
              label="Mark Picked Up"
              icon="checkmark-circle"
              loading={picking}
              onPress={handlePickup}
            />
          )}
          {isPickedUp && (
            <View style={styles.doneChip}>
              <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
              <Text style={styles.doneText}>Picked up ✓</Text>
            </View>
          )}
        </View>

        {/* ── Delivery section ─────────────────────────────── */}
        <View style={[styles.card, !isPickedUp && styles.cardDimmed]}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.stepCircle, isDelivered && styles.stepCircleDone]}>
              {isDelivered
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <Text style={styles.stepNum}>2</Text>
              }
            </View>
            <Text style={styles.cardTitle}>Deliver to Customer</Text>
          </View>

          {/* Proof of delivery */}
          <View style={styles.proofRow}>
            <Text style={styles.proofLabel}>
              Proof photo{' '}
              {isCOD
                ? <Text style={{ color: '#dc2626' }}>(required — COD)</Text>
                : <Text style={{ color: Colors.textTertiary }}>(optional)</Text>
              }
            </Text>
            {proofPhotoUri
              ? (
                <View style={styles.photoTaken}>
                  <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                  <Text style={styles.photoTakenText}>Photo taken</Text>
                  <TouchableOpacity onPress={handleTakePhoto}>
                    <Text style={styles.retakeText}>Retake</Text>
                  </TouchableOpacity>
                </View>
              )
              : (
                <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto}>
                  <Ionicons name="camera-outline" size={16} color={Colors.primary} />
                  <Text style={styles.photoBtnText}>Take Photo</Text>
                </TouchableOpacity>
              )
            }
          </View>

          {!isDelivered && (
            <ActionButton
              label={isCOD && !proofPhotoUri ? 'Take Photo First' : 'Mark Delivered'}
              icon="checkmark-done"
              loading={delivering}
              disabled={!isPickedUp}
              onPress={handleDeliver}
            />
          )}
          {isDelivered && (
            <View style={[styles.doneChip, { alignSelf: 'center', marginTop: 8 }]}>
              <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
              <Text style={styles.doneText}>Order Delivered! 🎉</Text>
            </View>
          )}
        </View>

        {/* ── Report Issue button ───────────────────────────── */}
        {!isDelivered && (
          <TouchableOpacity style={styles.issueBtn} onPress={openReportIssue} activeOpacity={0.7}>
            <Ionicons name="warning-outline" size={15} color="#dc2626" />
            <Text style={styles.issueBtnText}>Report Issue</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: Colors.background },
  scroll:      { flex: 1 },
  scrollContent: { padding: Spacing.md, paddingBottom: 20 },

  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: 14 },
  errorText:   { marginTop: 12, color: Colors.text, fontSize: 16, fontWeight: '700' },
  backBtn:     { marginTop: 16, padding: Spacing.md },
  backBtnText: { color: Colors.primary, fontWeight: '700' },

  // Map placeholder
  mapPlaceholder: {
    backgroundColor: Colors.surface2 || '#1e2235',
    alignItems: 'center', justifyContent: 'center',
  },
  mapPlaceholderInner: { alignItems: 'center', gap: 8 },
  mapPlaceholderTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  mapPlaceholderSub:   { fontSize: 12, color: Colors.textSecondary },

  // Header
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  orderNum:    { fontSize: 22, fontWeight: '800', color: Colors.text, fontFamily: Typography.fontFamily?.bold },
  earningStr:  { fontSize: 13, color: '#16a34a', fontWeight: '700', marginTop: 2 },
  rightMeta:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codPill:     { backgroundColor: '#f59e0b18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  codPillText: { fontSize: 11, fontWeight: '700', color: '#d97706' },
  positionPill:{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
  positionText:{ fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },

  // Card
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
    ...(Shadow?.sm || {}),
  },
  cardDimmed:  { opacity: 0.55 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1 },

  // Step circle
  stepCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  stepCircleDone: { backgroundColor: '#16a34a' },
  stepNum: { fontSize: 11, fontWeight: '800', color: '#fff' },

  // Address + distance
  addressText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 10 },
  distancePill:{ fontSize: 11, color: Colors.primary, fontWeight: '700', marginLeft: 'auto' },

  // Items
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  itemName: { fontSize: 13, color: Colors.text, flex: 1, marginRight: 8 },
  itemQty:  { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },

  // Contact
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  contactIconCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: `${Colors.primary}18`,
    alignItems: 'center', justifyContent: 'center',
  },
  contactName:  { fontSize: 13, fontWeight: '700', color: Colors.text },
  contactPhone: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  callBadge:    { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  callBadgeText:{ fontSize: 12, fontWeight: '700', color: '#fff' },

  // Google Maps button
  mapsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#1a73e8', borderRadius: BorderRadius.md,
    paddingVertical: 11, paddingHorizontal: 16,
  },
  mapsBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Action button
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 13, paddingHorizontal: 16, marginTop: 6,
  },
  actionBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.primary },
  actionBtnDanger:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#dc2626' },
  actionBtnDisabled:  { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  actionBtnText:         { fontSize: 14, fontWeight: '700', color: '#fff' },
  actionBtnTextSecondary:{ color: Colors.primary },
  actionBtnTextDanger:   { color: '#dc2626' },
  actionBtnTextDisabled: { color: Colors.textTertiary },

  // Proof
  proofRow:      { marginBottom: 10 },
  proofLabel:    { fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
  photoBtn:      { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: `${Colors.primary}12`, borderRadius: BorderRadius.md, paddingVertical: 9, paddingHorizontal: 14, alignSelf: 'flex-start', borderWidth: 1, borderColor: `${Colors.primary}30` },
  photoBtnText:  { fontSize: 13, fontWeight: '700', color: Colors.primary },
  photoTaken:    { flexDirection: 'row', alignItems: 'center', gap: 7 },
  photoTakenText:{ fontSize: 12, color: '#16a34a', fontWeight: '600' },
  retakeText:    { fontSize: 12, color: Colors.primary, textDecorationLine: 'underline', marginLeft: 4 },

  // Done chip
  doneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#16a34a18', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, alignSelf: 'flex-start',
  },
  doneText: { fontSize: 12, fontWeight: '700', color: '#16a34a' },

  // Report issue
  issueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#dc262612', borderRadius: BorderRadius.md,
    paddingVertical: 12, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: '#dc262630',
  },
  issueBtnText: { fontSize: 14, fontWeight: '700', color: '#dc2626' },

  // Map pin marker
  mapPin: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
});
