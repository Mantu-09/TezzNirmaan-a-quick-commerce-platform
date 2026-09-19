// ────────────────────────────────────────────────────────────
// RiderRouteScreen — P3-B
//
// "Optimized Route" tab for riders.
// Shows active deliveries reordered for the shortest driving
// path, using the GET /rider/deliveries/optimized-route API.
//
// Features:
//   • Numbered stop cards (1 → N) with customer, address, items
//   • Per-stop distance + ETA from previous stop (from API)
//   • Total route summary: X km, ~Y min
//   • "Navigate" button → opens Google Maps with destination
//   • Fallback banner when Maps API is unavailable (graceful degraded)
//   • Pull-to-refresh
//   • Empty state when no active deliveries
//   • Polyline route preview (encoded polyline decoded and shown
//     using react-native-maps MapView + Polyline — with a graceful
//     fallback if react-native-maps is not installed)
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking, Alert,
  Platform, Dimensions,
} from 'react-native';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { Ionicons }         from '@expo/vector-icons';
import { useQuery }         from '@tanstack/react-query';
import * as Location        from 'expo-location';              // P5-1
import { getOptimizedRoute } from '../../api/rider';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useAuthStore          from '../../store/authStore';     // P5-1
import { wsClient }          from '../../services/websocket'; // P5-1

const { width: SCREEN_W } = Dimensions.get('window');

// ── Map availability guard ──────────────────────────────────
// react-native-maps is optional — if not installed/configured,
// we show a "Map coming soon" placeholder instead of crashing.
let MapView   = null;
let Polyline  = null;
try {
  const maps = require('react-native-maps');
  MapView   = maps.default;
  Polyline  = maps.Polyline;
} catch (_) {
  // react-native-maps not installed — use placeholder
}

// ── Polyline decoder (Google encoded polyline → [{lat,lng}]) ─
function decodePolyline(encoded) {
  if (!encoded) return [];
  let index = 0, lat = 0, lng = 0;
  const points = [];
  while (index < encoded.length) {
    let shift = 0, result = 0, b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

// ── Open Google Maps navigation ───────────────────────────────
function openNavigation(stop) {
  const dest = stop.delivery_lat && stop.delivery_lng
    ? `${stop.delivery_lat},${stop.delivery_lng}`
    : encodeURIComponent(stop.full_address);

  const url = Platform.OS === 'ios'
    ? `comgooglemaps://?daddr=${dest}&directionsmode=driving`
    : `google.navigation:q=${dest}&mode=d`;

  const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;

  Linking.canOpenURL(url).then(supported => {
    Linking.openURL(supported ? url : fallbackUrl);
  }).catch(() => Linking.openURL(fallbackUrl));
}

// ── TierBadge ─────────────────────────────────────────────────
function TierBadge({ tier }) {
  const isQuick = tier === 'quick';
  return (
    <View style={[
      styles.tierBadge,
      { backgroundColor: isQuick ? Colors.quickLight : Colors.scheduledLight },
    ]}>
      <Text style={[
        styles.tierBadgeText,
        { color: isQuick ? Colors.quickText : Colors.scheduledText },
      ]}>
        {isQuick ? '⚡ Quick' : '📅 Scheduled'}
      </Text>
    </View>
  );
}

// ── DistancePill ──────────────────────────────────────────────
function DistancePill({ distanceKm, durationMin }) {
  if (distanceKm == null) return null;
  return (
    <View style={styles.distancePill}>
      <Ionicons name="navigate-outline" size={11} color={Colors.primary} />
      <Text style={styles.distancePillText}>
        {distanceKm} km · ~{durationMin} min
      </Text>
    </View>
  );
}

// ── StopCard ──────────────────────────────────────────────────
function StopCard({ stop, index, isLast }) {
  return (
    <View style={styles.stopRow}>
      {/* Timeline line */}
      <View style={styles.timelineCol}>
        <View style={[styles.stopCircle, isLast && styles.stopCircleLast]}>
          <Text style={styles.stopNumber}>{index + 1}</Text>
        </View>
        {!isLast && <View style={styles.timelineLine} />}
      </View>

      {/* Card */}
      <View style={[styles.stopCard, isLast && styles.stopCardLast]}>
        {/* Header row */}
        <View style={styles.stopHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stopCustomer} numberOfLines={1}>
              {stop.customer_name}
            </Text>
            {stop.order_number && (
              <Text style={styles.stopOrderNum}>#{stop.order_number}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <TierBadge tier={stop.delivery_tier} />
            <DistancePill
              distanceKm={stop.distance_from_prev_km}
              durationMin={stop.duration_from_prev_min}
            />
          </View>
        </View>

        {/* Address */}
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.addressText} numberOfLines={2}>
            {[stop.address_line1, stop.address_line2, stop.landmark, stop.city]
              .filter(Boolean).join(', ')}
          </Text>
        </View>

        {/* Items summary */}
        {stop.items_summary ? (
          <View style={styles.itemsRow}>
            <Ionicons name="cube-outline" size={13} color={Colors.textTertiary} />
            <Text style={styles.itemsText} numberOfLines={2}>{stop.items_summary}</Text>
          </View>
        ) : null}

        {/* Phone + Navigate */}
        <View style={styles.stopActions}>
          {stop.customer_phone ? (
            <TouchableOpacity
              style={styles.phoneBtn}
              onPress={() => Linking.openURL(`tel:${stop.customer_phone}`)}
              accessibilityLabel={`Call ${stop.customer_name}`}
            >
              <Ionicons name="call-outline" size={16} color={Colors.primary} />
              <Text style={styles.phoneBtnText}>{stop.customer_phone}</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          <TouchableOpacity
            style={styles.navBtn}
            onPress={() => openNavigation(stop)}
            accessibilityLabel={`Navigate to stop ${index + 1}`}
          >
            <Ionicons name="navigate" size={14} color="#fff" />
            <Text style={styles.navBtnText}>Navigate</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Map Preview (only if react-native-maps is installed) ──────
function RouteMapPreview({ polyline, deliveries, riderLocation }) {
  if (!MapView || !Polyline || !polyline) {
    // Placeholder: if maps not installed or no polyline
    return (
      <View style={styles.mapPlaceholder}>
        <Ionicons name="map-outline" size={32} color={Colors.textTertiary} />
        <Text style={styles.mapPlaceholderText}>
          {MapView ? 'Route map loading…' : 'Map view available after full Expo build'}
        </Text>
      </View>
    );
  }

  const routeCoords = decodePolyline(polyline);

  // Compute map region from deliveries + rider
  const allLats = [
    riderLocation?.lat,
    ...deliveries.map(d => d.delivery_lat),
  ].filter(Boolean);
  const allLngs = [
    riderLocation?.lng,
    ...deliveries.map(d => d.delivery_lng),
  ].filter(Boolean);

  const minLat = Math.min(...allLats);
  const maxLat = Math.max(...allLats);
  const minLng = Math.min(...allLngs);
  const maxLng = Math.max(...allLngs);
  const PAD = 0.01;

  const region = {
    latitude:       (minLat + maxLat) / 2,
    longitude:      (minLng + maxLng) / 2,
    latitudeDelta:  Math.max(maxLat - minLat + PAD, 0.02),
    longitudeDelta: Math.max(maxLng - minLng + PAD, 0.02),
  };

  return (
    <MapView
      style={styles.map}
      region={region}
      scrollEnabled={false}
      zoomEnabled={false}
      pitchEnabled={false}
      rotateEnabled={false}
    >
      <Polyline
        coordinates={routeCoords}
        strokeColor={Colors.primary}
        strokeWidth={3}
      />
    </MapView>
  );
}

// ── Fallback Banner ───────────────────────────────────────────
function FallbackBanner({ reason }) {
  return (
    <View style={styles.fallbackBanner}>
      <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
      <Text style={styles.fallbackText}>
        Showing deliveries in assignment order.{reason ? ` (${reason})` : ''}
      </Text>
    </View>
  );
}

// ── Route Summary bar ─────────────────────────────────────────
function RouteSummary({ totalKm, totalMin, stopCount, optimized }) {
  return (
    <View style={styles.summaryBar}>
      <View style={styles.summaryItem}>
        <Ionicons name="map-outline" size={16} color={Colors.primary} />
        <Text style={styles.summaryValue}>{stopCount}</Text>
        <Text style={styles.summaryLabel}>stops</Text>
      </View>
      {totalKm != null && (
        <View style={styles.summaryItem}>
          <Ionicons name="speedometer-outline" size={16} color={Colors.primary} />
          <Text style={styles.summaryValue}>{totalKm} km</Text>
          <Text style={styles.summaryLabel}>total</Text>
        </View>
      )}
      {totalMin != null && (
        <View style={styles.summaryItem}>
          <Ionicons name="time-outline" size={16} color={Colors.primary} />
          <Text style={styles.summaryValue}>~{totalMin} min</Text>
          <Text style={styles.summaryLabel}>ETA</Text>
        </View>
      )}
      {optimized && (
        <View style={[styles.summaryItem, styles.optimizedBadge]}>
          <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
          <Text style={styles.optimizedText}>Optimized</Text>
        </View>
      )}
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyDeliveries() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="checkmark-done-circle-outline" size={52} color={Colors.success} />
      </View>
      <Text style={styles.emptyTitle}>All done!</Text>
      <Text style={styles.emptyDesc}>No active deliveries right now. Check back soon.</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function RiderRouteScreen() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey:  ['rider-optimized-route'],
    queryFn:   getOptimizedRoute,
    staleTime: 60 * 1000,        // refetch background every 60s
    refetchInterval: 2 * 60 * 1000, // auto-refresh every 2 min while screen open
  });

  const deliveries = data?.deliveries || [];
  const optimized  = data?.optimized  ?? false;
  const fallback   = data?.fallback   ?? false;

  // P5-1: Broadcast rider GPS location over WebSocket every 5s.
  // Only runs when there is an active out_for_delivery assignment.
  // Falls back silently if Location permission is denied.
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.user?.id);
  const activeOrderId = deliveries.find(d => d.status === 'out_for_delivery')?.order_id ?? null;

  useEffect(() => {
    if (!token || !userId || !activeOrderId) return;

    let intervalId = null;
    let wsConnected = false;

    // Connect as a rider
    wsClient.connect(token, 'rider', userId);
    const unsubConnected = wsClient.on('connected', () => { wsConnected = true; });

    const startBroadcasting = async () => {
      // Request foreground location permission (Expo)
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[WS Rider] Location permission denied — skipping WS broadcast');
        return;
      }

      // Send location every 5 seconds while delivery is active
      intervalId = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          wsClient.send({
            lat:     loc.coords.latitude,
            lng:     loc.coords.longitude,
            orderId: activeOrderId,
          });
        } catch (err) {
          console.warn('[WS Rider] Location fetch failed:', err.message);
        }
      }, 5000);
    };

    startBroadcasting();

    return () => {
      unsubConnected();
      if (intervalId) clearInterval(intervalId);
      wsClient.disconnect();
    };
  }, [token, userId, activeOrderId]);


  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Calculating best route…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.errorWrap}>
          <Ionicons name="cloud-offline-outline" size={40} color={Colors.error} />
          <Text style={styles.errorTitle}>Couldn't load route</Text>
          <Text style={styles.errorDesc}>{error?.message || 'Please check your connection'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refetch}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (deliveries.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyDeliveries />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Fallback banner */}
        {fallback && <FallbackBanner reason={data?.fallback_reason} />}

        {/* Route summary */}
        <RouteSummary
          stopCount={deliveries.length}
          totalKm={data?.total_distance_km}
          totalMin={data?.total_duration_min}
          optimized={optimized}
        />

        {/* Map preview */}
        {(data?.polyline || MapView) && (
          <RouteMapPreview
            polyline={data?.polyline}
            deliveries={deliveries}
            riderLocation={data?.rider_location}
          />
        )}

        {/* Stop cards */}
        <View style={styles.stopList}>
          {deliveries.map((stop, idx) => (
            <StopCard
              key={stop.assignment_id}
              stop={stop}
              index={idx}
              isLast={idx === deliveries.length - 1}
            />
          ))}
        </View>

        {/* Bottom padding for tab bar */}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: Colors.background },
  scroll:    { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  // Loading / error
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.md,
    color:      Colors.textSecondary,
  },
  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  errorTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.error },
  errorDesc:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center' },
  retryBtn:   { marginTop: 8, backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing[3], paddingHorizontal: Spacing[6] },
  retryBtnText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: '#fff' },

  // Fallback banner
  fallbackBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.warningLight,
    borderBottomWidth: 1, borderBottomColor: Colors.warning,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
  },
  fallbackText: {
    flex: 1,
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    color: Colors.warning,
  },

  // Summary bar
  summaryBar: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 20,
  },
  summaryItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryValue:  { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.text },
  summaryLabel:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  optimizedBadge:{ backgroundColor: Colors.successLight, borderRadius: BorderRadius.full, paddingHorizontal: Spacing[3], paddingVertical: 3, gap: 4 },
  optimizedText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, color: Colors.success },

  // Map
  map:            { width: SCREEN_W, height: 180 },
  mapPlaceholder: {
    width: SCREEN_W, height: 120,
    backgroundColor: Colors.surface2,
    justifyContent: 'center', alignItems: 'center', gap: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  mapPlaceholderText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },

  // Stop list + timeline
  stopList:    { padding: Spacing[4], gap: 0 },
  stopRow:     { flexDirection: 'row', gap: Spacing[3] },
  timelineCol: { alignItems: 'center', width: 32 },
  stopCircle: {
    width:  32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  stopCircleLast: { backgroundColor: Colors.success },
  stopNumber: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.sm,
    color:      '#fff',
  },
  timelineLine: {
    flex: 1, width: 2,
    backgroundColor: Colors.border,
    marginVertical: 4,
    minHeight: 24,
  },

  // Stop card
  stopCard: {
    flex: 1, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl, padding: Spacing[4],
    marginBottom: Spacing[4],
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  stopCardLast: { borderColor: Colors.successLight, borderWidth: 1.5 },
  stopHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: Spacing[3],
    gap: 8,
  },
  stopCustomer: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.md,
    color:      Colors.text,
  },
  stopOrderNum: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textTertiary,
    marginTop:  2,
  },

  tierBadge:     { borderRadius: BorderRadius.full, paddingHorizontal: Spacing[2], paddingVertical: 2 },
  tierBadgeText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs },

  distancePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing[2], paddingVertical: 2,
    marginTop: 2,
  },
  distancePillText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.primary,
  },

  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: Spacing[2], marginBottom: Spacing[2],
  },
  addressText: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    lineHeight: 18,
  },

  itemsRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: Spacing[2], marginBottom: Spacing[3],
  },
  itemsText: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textTertiary,
    lineHeight: 16,
  },

  stopActions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingTop: Spacing[3], marginTop: Spacing[2],
  },
  phoneBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  phoneBtnText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.primary,
  },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing[2], paddingHorizontal: Spacing[4],
  },
  navBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      '#fff',
  },

  // Empty state
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 40, gap: 12,
  },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.successLight,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.xl,
    color:      Colors.text,
  },
  emptyDesc: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.md,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 22,
  },
});
