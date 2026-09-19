// ────────────────────────────────────────────────────────────
// RiderDeliveryScreen.jsx — P9-4: Active Delivery Flow
//
// The core "active delivery" screen. Shown when a rider taps
// an active delivery from RiderHomeScreen or navigates from
// RiderRouteScreen.
//
// Flow (single scroll):
//   1. Order summary card (order#, shop, item count, COD amount)
//   2. Pickup section → shop address → [Mark Picked Up]
//   3. Drop section → customer address → [Mark Delivered]
//   4. Customer contact row → masked phone + call button
//   5. Proof of delivery → camera (required for COD, optional prepaid)
//   6. Haptic feedback on every state transition
//   7. Confetti animation on successful delivery
//
// API calls (all existing routes):
//   GET  /rider/deliveries/:assignmentId
//   POST /rider/deliveries/:assignmentId/pickup
//   POST /rider/deliveries/:assignmentId/deliver
// ────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Animated, Linking, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView }    from 'react-native-safe-area-context';
import { Ionicons }        from '@expo/vector-icons';
import * as Haptics        from 'expo-haptics';
import * as ImagePicker    from 'expo-image-picker';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore         from '../../store/authStore';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';

// ── API helpers ───────────────────────────────────────────────
async function getAuthHeader() {
  const { supabaseAdmin } = await import('../../lib/supabase');
  const { data: { session } } = await supabaseAdmin.auth.getSession();
  return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
}

const API_URL = process.env.EXPO_PUBLIC_API_URL;

async function fetchAssignment(assignmentId) {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_URL}/api/v1/rider/deliveries/${assignmentId}`, { headers });
  if (!res.ok) throw new Error('Failed to fetch assignment');
  const json = await res.json();
  return json.data || json;
}

async function markPickedUp(assignmentId) {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_URL}/api/v1/rider/deliveries/${assignmentId}/pickup`, {
    method: 'POST', headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to mark picked up');
  }
  return res.json();
}

async function markDelivered(assignmentId, proofPhotoUrl = null) {
  const headers = await getAuthHeader();
  const body = proofPhotoUrl ? JSON.stringify({ proof_photo_url: proofPhotoUrl }) : '{}';
  const res = await fetch(`${API_URL}/api/v1/rider/deliveries/${assignmentId}/deliver`, {
    method: 'POST', headers, body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to mark delivered');
  }
  return res.json();
}

// ── Confetti ──────────────────────────────────────────────────
// Pure RN Animated API — no external library
function Confetti({ visible }) {
  const pieces = useRef(
    [...Array(20)].map(() => ({
      x:     new Animated.Value(0),
      y:     new Animated.Value(0),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
      color: ['#E8521A', '#FFD700', '#22c55e', '#3b82f6', '#a855f7'][Math.floor(Math.random() * 5)],
      startX: Math.random() * 300 - 150,
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;

    const animations = pieces.map((p) =>
      Animated.parallel([
        Animated.timing(p.x, { toValue: p.startX, duration: 1500, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: 300, duration: 1500, useNativeDriver: true }),
        Animated.timing(p.rotate, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(800),
          Animated.timing(p.opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      ])
    );

    Animated.stagger(50, animations).start(() => {
      // Reset
      pieces.forEach(p => {
        p.x.setValue(0); p.y.setValue(0);
        p.rotate.setValue(0); p.opacity.setValue(1);
      });
    });
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            width: 10, height: 10,
            borderRadius: 2,
            backgroundColor: p.color,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              { rotate: p.rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] }) },
            ],
            opacity: p.opacity,
          }}
        />
      ))}
    </View>
  );
}

// ── Section header ─────────────────────────────────────────────
function SectionHeader({ icon, title, step }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.stepNumber}><Text style={styles.stepText}>{step}</Text></View>
      <Ionicons name={icon} size={18} color={Colors.primary} style={{ marginRight: 6 }} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ── Action button ──────────────────────────────────────────────
function ActionButton({ label, onPress, disabled, loading, variant = 'primary', icon }) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        variant === 'secondary' && styles.actionBtnSecondary,
        disabled && styles.actionBtnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : Colors.primary} />
        : <>
            {icon && <Ionicons name={icon} size={18} color={variant === 'primary' ? '#fff' : Colors.primary} style={{ marginRight: 6 }} />}
            <Text style={[styles.actionBtnText, variant === 'secondary' && styles.actionBtnTextSecondary]}>
              {label}
            </Text>
          </>
      }
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────
export default function RiderDeliveryScreen() {
  const route      = useRoute();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { assignmentId } = route.params || {};

  const [showConfetti, setShowConfetti]   = useState(false);
  const [proofPhotoUri, setProofPhotoUri] = useState(null);

  // ── Fetch assignment ────────────────────────────────────────
  const { data: assignment, isLoading, refetch } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn:  () => fetchAssignment(assignmentId),
    enabled:  !!assignmentId,
    refetchInterval: 15_000,
  });

  // ── Computed fields ────────────────────────────────────────
  const subOrder   = assignment?.sub_orders;
  const order      = subOrder?.orders;
  const shop       = subOrder?.shops;
  const address    = order?.addresses;
  const isCOD      = subOrder?.payment_method === 'cod';
  const isPickedUp = assignment?.status === 'picked_up';
  const isDelivered = assignment?.status === 'delivered';
  const amount     = subOrder?.total_amount ? `₹${(subOrder.total_amount / 100).toFixed(0)}` : '—';
  const orderNum   = order?.order_number || (assignmentId || '').slice(0, 8).toUpperCase();
  const customerPhone = order?.customer_phone; // Masked from backend

  // ── Mutations ─────────────────────────────────────────────
  const { mutate: doPickup, isPending: picking } = useMutation({
    mutationFn: () => markPickedUp(assignmentId),
    onSuccess:  () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['assignment', assignmentId] });
      queryClient.invalidateQueries({ queryKey: ['activeDelivery'] });
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', err.message);
    },
  });

  const { mutate: doDeliver, isPending: delivering } = useMutation({
    mutationFn: () => markDelivered(assignmentId, proofPhotoUri),
    onSuccess:  () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowConfetti(true);
      setTimeout(() => {
        setShowConfetti(false);
        queryClient.invalidateQueries({ queryKey: ['activeDelivery'] });
        navigation.goBack();
      }, 3000);
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', err.message);
    },
  });

  // ── Pickup action ──────────────────────────────────────────
  const handlePickup = () => {
    Alert.alert(
      'Mark as Picked Up',
      `Confirm you have collected the order from ${shop?.name || 'the shop'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Picked Up', onPress: () => doPickup() },
      ],
    );
  };

  // ── Delivery action ────────────────────────────────────────
  const handleDeliver = () => {
    if (isCOD && !proofPhotoUri) {
      Alert.alert('Photo Required', 'COD orders require a delivery proof photo. Please take a photo before marking as delivered.');
      return;
    }
    Alert.alert(
      'Mark as Delivered',
      'Confirm the order has been handed to the customer?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm Delivered', onPress: () => doDeliver() },
      ],
    );
  };

  // ── Photo capture ──────────────────────────────────────────
  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take delivery proof photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, quality: 0.7, aspect: [4, 3],
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setProofPhotoUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // ── Navigate to Google Maps ────────────────────────────────
  const openMaps = (address, label = 'Destination') => {
    if (!address) return;
    const query = encodeURIComponent(typeof address === 'string' ? address : `${address.street}, ${address.city}`);
    const url = Platform.OS === 'ios'
      ? `maps://?q=${query}`
      : `geo:0,0?q=${query}(${encodeURIComponent(label)})`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
    });
  };

  // ── Call customer ─────────────────────────────────────────
  const callCustomer = () => {
    if (!customerPhone) return;
    Linking.openURL(`tel:${customerPhone}`);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading delivery details...</Text>
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
    <SafeAreaView style={styles.safeArea}>
      <Confetti visible={showConfetti} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 1. Order Summary ──────────────────────── */}
        <View style={styles.card}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderNum}>#{orderNum}</Text>
            {isCOD && <View style={styles.codPill}><Text style={styles.codPillText}>COD</Text></View>}
          </View>
          <View style={styles.orderMeta}>
            <Ionicons name="storefront-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{shop?.name || 'Shop'}</Text>
          </View>
          <View style={styles.orderFooter}>
            <Text style={styles.amountLabel}>Total</Text>
            <Text style={styles.amount}>{amount}</Text>
          </View>
        </View>

        {/* ── 2. Pickup Section ────────────────────── */}
        <View style={styles.card}>
          <SectionHeader icon="storefront" title="Pickup from Shop" step="1" />
          <Text style={styles.addressText}>{shop?.address || 'Shop address not available'}</Text>
          <View style={styles.buttonRow}>
            <ActionButton
              label="Navigate to Shop"
              icon="navigate-outline"
              variant="secondary"
              onPress={() => openMaps(shop?.address, shop?.name)}
            />
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
                <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                <Text style={styles.doneText}>Picked up</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── 3. Drop Section ──────────────────────── */}
        <View style={[styles.card, !isPickedUp && styles.cardDisabled]}>
          <SectionHeader icon="location" title="Deliver to Customer" step="2" />
          {address ? (
            <Text style={styles.addressText}>{address.street}, {address.city}</Text>
          ) : (
            <Text style={styles.addressText}>Customer address not available</Text>
          )}

          {/* ── 4. Customer Contact ─────────────────── */}
          {customerPhone && (
            <TouchableOpacity style={styles.contactRow} onPress={callCustomer}>
              <View style={styles.contactIcon}>
                <Ionicons name="call-outline" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.contactText}>{customerPhone}</Text>
              <Text style={styles.callLabel}>Call</Text>
            </TouchableOpacity>
          )}

          <View style={styles.buttonRow}>
            <ActionButton
              label="Navigate to Customer"
              icon="navigate-outline"
              variant="secondary"
              onPress={() => openMaps(address, 'Customer')}
            />
          </View>

          {/* ── 5. Proof of Delivery ─────────────────── */}
          <View style={styles.proofSection}>
            <Text style={styles.proofTitle}>
              Proof of Delivery {isCOD ? <Text style={styles.required}>(Required for COD)</Text> : <Text style={styles.optional}>(Optional)</Text>}
            </Text>
            {proofPhotoUri ? (
              <View style={styles.photoTaken}>
                <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                <Text style={styles.photoTakenText}>Photo taken</Text>
                <TouchableOpacity onPress={handleTakePhoto}>
                  <Text style={styles.retakeText}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto}>
                <Ionicons name="camera-outline" size={18} color={Colors.primary} />
                <Text style={styles.photoBtnText}>Take Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Deliver button ────────────────────────── */}
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
              <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
              <Text style={styles.doneText}>Order Delivered!</Text>
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: Colors.background },
  scroll:      { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: 14 },
  errorText:   { marginTop: 12, color: Colors.text, fontSize: 16, fontWeight: '700' },
  backBtn:     { marginTop: 16, padding: Spacing.md },
  backBtnText: { color: Colors.primary, fontWeight: '700' },

  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  cardDisabled: { opacity: 0.5 },

  orderHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  orderNum:     { fontSize: 20, fontWeight: '800', color: Colors.text, fontFamily: Typography.fontFamily.bold },
  codPill:      { backgroundColor: '#f59e0b18', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  codPillText:  { fontSize: 12, fontWeight: '700', color: '#d97706' },
  orderMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  metaText:     { fontSize: 13, color: Colors.textSecondary },
  orderFooter:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  amountLabel:  { fontSize: 12, color: Colors.textSecondary },
  amount:       { fontSize: 22, fontWeight: '800', color: Colors.text },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  stepNumber:    {
    width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  stepText:    { fontSize: 12, fontWeight: '800', color: '#fff' },
  sectionTitle:{ fontSize: 14, fontWeight: '700', color: Colors.text },

  addressText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 12 },

  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 4 },

  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  actionBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.primary },
  actionBtnDisabled:  { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1 },
  actionBtnText:      { fontSize: 13, fontWeight: '700', color: '#fff' },
  actionBtnTextSecondary: { color: Colors.primary },

  doneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#16a34a18', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  doneText: { fontSize: 13, fontWeight: '700', color: '#16a34a' },

  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: 12, borderWidth: 1, borderColor: Colors.border,
  },
  contactIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: `${Colors.primary}18`,
    alignItems: 'center', justifyContent: 'center',
  },
  contactText: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '600' },
  callLabel:   { fontSize: 13, color: Colors.primary, fontWeight: '700' },

  proofSection: { marginTop: 12, marginBottom: 16 },
  proofTitle:   { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  required:     { color: '#dc2626' },
  optional:     { color: Colors.textSecondary },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${Colors.primary}12`, borderRadius: BorderRadius.md,
    paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: `${Colors.primary}30`,
  },
  photoBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  photoTaken:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoTakenText: { fontSize: 13, color: '#16a34a', fontWeight: '600' },
  retakeText:   { fontSize: 12, color: Colors.primary, textDecorationLine: 'underline' },
});
