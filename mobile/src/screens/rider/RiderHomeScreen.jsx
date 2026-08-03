// ────────────────────────────────────────────────────────────
// RiderHomeScreen.jsx — P9-4: Rider Landing Dashboard
//
// The landing screen riders see after login (replaces customer HomeTab
// as the default initial route when isRider === true).
//
// Features:
//   • Online/Offline toggle → PATCH /rider/status
//   • Today's stats: deliveries completed, earnings today
//   • Active delivery card (if any) → one-tap to RiderDeliveryScreen
//   • "View All Routes" → RiderRouteScreen
// ────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Switch, ActivityIndicator,
} from 'react-native';
import { SafeAreaView }      from 'react-native-safe-area-context';
import { Ionicons }          from '@expo/vector-icons';
import * as Haptics          from 'expo-haptics';
import { useNavigation }     from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useAuthStore           from '../../store/authStore';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';

import { client }            from '../../api/client';

// ── API helpers ──────────────────────────────────────────────
// All calls go through the Express backend (authed via Bearer token
// managed by client.js / axios interceptor). No Supabase direct access.
async function fetchRiderStatus() {
  const { data } = await client.get('/rider/status');
  return data?.data || {};
}

async function fetchTodayStats() {
  const { data } = await client.get('/rider/stats/today');
  return data?.data || { deliveriesToday: 0 };
}

async function fetchActiveDelivery() {
  const { data } = await client.get('/rider/deliveries/active');
  return data?.data || null;
}

async function updateRiderOnlineStatus(isOnline) {
  const { data } = await client.patch('/rider/status', { is_online: isOnline });
  return data;
}


// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon, label, value, color = Colors.primary }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Active Delivery Card ──────────────────────────────────────
function ActiveDeliveryCard({ assignment, onPress }) {
  if (!assignment) return null;

  const subOrder  = assignment.sub_orders;
  const order     = subOrder?.orders;
  const shop      = subOrder?.shops;
  const isCOD     = subOrder?.payment_method === 'cod';
  const amount    = subOrder?.total_amount ? `₹${(subOrder.total_amount / 100).toFixed(0)}` : '—';

  return (
    <TouchableOpacity style={styles.activeDeliveryCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.activeDeliveryHeader}>
        <View style={styles.activeBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.activeBadgeText}>Active Delivery</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
      </View>

      <Text style={styles.orderNumber}>#{order?.order_number || assignment.id.slice(0, 8).toUpperCase()}</Text>

      <View style={styles.deliveryRow}>
        <Ionicons name="storefront-outline" size={14} color={Colors.textSecondary} />
        <Text style={styles.deliveryText} numberOfLines={1}>{shop?.name || 'Shop'}</Text>
      </View>

      <View style={styles.deliveryRow}>
        <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
        <Text style={styles.deliveryText} numberOfLines={1}>
          {order?.addresses?.street || 'Customer address'}
        </Text>
      </View>

      <View style={styles.activeDeliveryFooter}>
        <Text style={styles.deliveryAmount}>{amount}</Text>
        {isCOD && (
          <View style={styles.codBadge}>
            <Text style={styles.codText}>COD</Text>
          </View>
        )}
        <View style={[styles.statusBadge, { backgroundColor: assignment.status === 'picked_up' ? '#16a34a18' : '#E8521A18' }]}>
          <Text style={[styles.statusText, { color: assignment.status === 'picked_up' ? '#16a34a' : Colors.primary }]}>
            {assignment.status === 'picked_up' ? 'Picked up' : 'Go to shop'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function RiderHomeScreen() {
  const navigation = useNavigation();
  const { user }   = useAuthStore();
  const queryClient = useQueryClient();
  const riderId    = user?.id;

  // ── Queries ────────────────────────────────────────────────
  const { data: riderStatus } = useQuery({
    queryKey:  ['riderStatus', riderId],
    queryFn:   () => fetchRiderStatus(riderId),
    enabled:   !!riderId,
    refetchInterval: 30_000,
  });

  const { data: stats } = useQuery({
    queryKey:  ['riderStatsToday', riderId],
    queryFn:   () => fetchTodayStats(riderId),
    enabled:   !!riderId,
    refetchInterval: 60_000,
  });

  const { data: activeDelivery, isLoading: loadingDelivery } = useQuery({
    queryKey:  ['activeDelivery', riderId],
    queryFn:   () => fetchActiveDelivery(riderId),
    enabled:   !!riderId,
    refetchInterval: 10_000, // Poll frequently for active delivery
  });

  // ── Online toggle mutation ─────────────────────────────────
  const { mutate: toggleOnline, isPending: toggling } = useMutation({
    mutationFn: (isOnline) => updateRiderOnlineStatus(isOnline),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riderStatus', riderId] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const isOnline = riderStatus?.is_online ?? false;

  const handleToggleOnline = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleOnline(!isOnline);
  };

  const goToActiveDelivery = () => {
    if (!activeDelivery) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('RiderDelivery', { assignmentId: activeDelivery.id });
  };

  const goToRoute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('RiderRoute');
  };

  // ── Refresh ────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['riderStatus', riderId] });
    await queryClient.invalidateQueries({ queryKey: ['riderStatsToday', riderId] });
    await queryClient.invalidateQueries({ queryKey: ['activeDelivery', riderId] });
    setRefreshing(false);
  }, [riderId, queryClient]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Rider';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name}>{firstName}</Text>
          </View>
          <View style={[styles.onlinePill, { backgroundColor: isOnline ? '#16a34a18' : Colors.surface }]}>
            <Text style={[styles.onlineLabel, { color: isOnline ? '#16a34a' : Colors.textSecondary }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
            {toggling
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Switch
                  value={isOnline}
                  onValueChange={handleToggleOnline}
                  trackColor={{ false: Colors.border, true: '#16a34a' }}
                  thumbColor="#fff"
                />
            }
          </View>
        </View>

        {/* ── Offline banner ──────────────────────────── */}
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="moon-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.offlineBannerText}>
              You are offline. Go online to receive deliveries.
            </Text>
          </View>
        )}

        {/* ── Today's Stats ────────────────────────────── */}
        <Text style={styles.sectionTitle}>Today</Text>
        <View style={styles.statsRow}>
          <StatCard
            icon="bicycle-outline"
            label="Deliveries"
            value={stats?.deliveriesToday ?? '—'}
            color={Colors.primary}
          />
          <StatCard
            icon="flash-outline"
            label="Active"
            value={activeDelivery ? '1' : '0'}
            color="#3b82f6"
          />
          <StatCard
            icon="checkmark-circle-outline"
            label="Done today"
            value={stats?.deliveriesToday ?? '—'}
            color="#16a34a"
          />
        </View>

        {/* ── Active Delivery ───────────────────────────── */}
        {(loadingDelivery || activeDelivery) && (
          <>
            <Text style={styles.sectionTitle}>Active Delivery</Text>
            {loadingDelivery
              ? <View style={styles.loadingCard}><ActivityIndicator color={Colors.primary} /></View>
              : <ActiveDeliveryCard assignment={activeDelivery} onPress={goToActiveDelivery} />
            }
          </>
        )}

        {/* ── Quick Actions ─────────────────────────────── */}
        <Text style={styles.sectionTitle}>Actions</Text>
        <TouchableOpacity style={styles.actionButton} onPress={goToRoute} activeOpacity={0.8}>
          <View style={styles.actionLeft}>
            <View style={[styles.actionIcon, { backgroundColor: `${Colors.primary}18` }]}>
              <Ionicons name="map-outline" size={22} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.actionTitle}>View Route</Text>
              <Text style={styles.actionSub}>See your optimized delivery route</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: Colors.background },
  scroll:      { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.xl,
  },
  greeting:  { fontSize: 14, color: Colors.textSecondary, fontFamily: Typography.fontFamily.regular },
  name:      { fontSize: 22, fontWeight: '800', color: Colors.text, fontFamily: Typography.fontFamily.bold },

  onlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 24, borderWidth: 1, borderColor: Colors.border,
  },
  onlineLabel: { fontSize: 13, fontWeight: '600', fontFamily: Typography.fontFamily.semiBold },

  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  offlineBannerText: { fontSize: 13, color: Colors.textSecondary, flex: 1 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    fontFamily: Typography.fontFamily.bold,
    marginBottom: Spacing.md, marginTop: Spacing.sm,
  },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: Spacing.xl },
  statCard: {
    flex: 1, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  statIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.text, fontFamily: Typography.fontFamily.bold },
  statLabel: { fontSize: 11, color: Colors.textSecondary, fontFamily: Typography.fontFamily.regular },

  activeDeliveryCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3, borderLeftColor: Colors.primary,
    ...Shadow.md,
  },
  activeDeliveryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  activeBadgeText: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  orderNumber: { fontSize: 18, fontWeight: '800', color: Colors.text, fontFamily: Typography.fontFamily.bold, marginBottom: 8 },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  deliveryText: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  activeDeliveryFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  deliveryAmount: { fontSize: 16, fontWeight: '800', color: Colors.text },
  codBadge: { backgroundColor: '#f59e0b18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  codText:  { fontSize: 11, fontWeight: '700', color: '#d97706' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusText:  { fontSize: 12, fontWeight: '700' },

  loadingCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.xl,
  },

  actionButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  actionLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  actionIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, fontFamily: Typography.fontFamily.semiBold },
  actionSub:   { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
});
