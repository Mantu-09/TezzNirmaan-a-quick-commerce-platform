// ────────────────────────────────────────────────────────────
// RiderShiftScreen.jsx — Phase B
//
// Shift booking and management screen for riders.
//
// Sections:
//   1. Upcoming Shifts (GET /rider/shifts/mine) — booked/active/completed
//   2. Available Shifts (GET /rider/shifts/available) — Book button
//
// Actions:
//   Book   → POST /rider/shifts/:id/book (with Alert confirmation)
//   Cancel → DELETE /rider/shifts/:id    (with Alert confirmation)
//
// Pull to refresh both sections simultaneously.
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView }  from 'react-native-safe-area-context';
import { Ionicons }      from '@expo/vector-icons';
import * as Haptics      from 'expo-haptics';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { client }        from '../../api/client';

// ── API helpers ───────────────────────────────────────────────
async function fetchAvailableShifts() {
  const { data } = await client.get('/rider/shifts/available');
  return data?.data || [];
}

async function fetchMyShifts() {
  const { data } = await client.get('/rider/shifts/mine');
  return data?.data || [];
}

async function bookShift(shiftId) {
  const { data } = await client.post(`/rider/shifts/${shiftId}/book`);
  return data;
}

async function cancelShift(shiftId) {
  const { data } = await client.delete(`/rider/shifts/${shiftId}`);
  return data;
}

// ── Helpers ───────────────────────────────────────────────────
function formatShiftDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-IN', {
    weekday: 'short',
    day:     'numeric',
    month:   'short',
    year:    'numeric',
  });
}

function formatShiftTime(startIso, endIso) {
  const fmt = (iso) => {
    if (!iso) return '?';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

// ── Status badge ──────────────────────────────────────────────
const STATUS_CONFIG = {
  booked:    { color: Colors.info,         bg: Colors.infoLight,    label: 'Booked'    },
  active:    { color: Colors.success,      bg: Colors.successLight, label: 'Active'    },
  completed: { color: Colors.textSecondary, bg: Colors.surface2,    label: 'Done'      },
  cancelled: { color: Colors.error,        bg: Colors.errorLight,   label: 'Cancelled' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.booked;
  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Upcoming shift card ───────────────────────────────────────
function UpcomingShiftCard({ shift, onCancel }) {
  const canCancel = shift.status === 'booked';

  return (
    <View style={styles.shiftCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons name="calendar-outline" size={16} color={Colors.secondary} style={{ marginRight: 6 }} />
          <Text style={styles.cardDate}>{formatShiftDate(shift.start_time || shift.date)}</Text>
        </View>
        <StatusBadge status={shift.status || 'booked'} />
      </View>

      <Text style={styles.cardTime}>
        {formatShiftTime(shift.start_time, shift.end_time)}
      </Text>

      {(shift.store_name || shift.location) && (
        <View style={styles.cardLocation}>
          <Ionicons name="location-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 4 }} />
          <Text style={styles.cardLocationText} numberOfLines={1}>
            {shift.store_name || shift.location}
          </Text>
        </View>
      )}

      {canCancel && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => onCancel(shift.id)}
          activeOpacity={0.8}
        >
          <Ionicons name="close-circle-outline" size={16} color={Colors.error} style={{ marginRight: 4 }} />
          <Text style={styles.cancelBtnText}>Cancel Shift</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Available shift card ──────────────────────────────────────
function AvailableShiftCard({ shift, onBook, isBooking }) {
  return (
    <View style={styles.shiftCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons name="calendar-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
          <Text style={styles.cardDate}>{formatShiftDate(shift.start_time || shift.date)}</Text>
        </View>
        {shift.slots_remaining != null && (
          <Text style={styles.slotsText}>
            {shift.slots_remaining} slot{shift.slots_remaining !== 1 ? 's' : ''} left
          </Text>
        )}
      </View>

      <Text style={styles.cardTime}>
        {formatShiftTime(shift.start_time, shift.end_time)}
      </Text>

      {(shift.store_name || shift.location) && (
        <View style={styles.cardLocation}>
          <Ionicons name="location-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 4 }} />
          <Text style={styles.cardLocationText} numberOfLines={1}>
            {shift.store_name || shift.location}
          </Text>
        </View>
      )}

      {shift.incentive_description && (
        <View style={styles.incentiveRow}>
          <Ionicons name="flash" size={14} color={Colors.warning} style={{ marginRight: 4 }} />
          <Text style={styles.incentiveRowText}>{shift.incentive_description}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.bookBtn, isBooking && styles.bookBtnDisabled]}
        onPress={() => onBook(shift.id)}
        disabled={isBooking}
        activeOpacity={0.8}
      >
        {isBooking ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.bookBtnText}>Book Shift</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Section header ────────────────────────────────────────────
function SectionHeader({ title, count }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count != null && (
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ── Empty section ─────────────────────────────────────────────
function EmptySection({ message }) {
  return (
    <View style={styles.emptySection}>
      <Text style={styles.emptySectionText}>{message}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function RiderShiftScreen() {
  const queryClient = useQueryClient();
  const [bookingId, setBookingId]       = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Queries ─────────────────────────────────────────────────
  const {
    data: myShifts = [],
    isLoading: myLoading,
    refetch: refetchMine,
  } = useQuery({
    queryKey: ['rider', 'shifts', 'mine'],
    queryFn:  fetchMyShifts,
    staleTime: 30 * 1000,
  });

  const {
    data: availableShifts = [],
    isLoading: availLoading,
    refetch: refetchAvailable,
  } = useQuery({
    queryKey: ['rider', 'shifts', 'available'],
    queryFn:  fetchAvailableShifts,
    staleTime: 30 * 1000,
  });

  const isLoading = myLoading || availLoading;

  // ── Pull to refresh ─────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetchMine(), refetchAvailable()]);
    setIsRefreshing(false);
  }, [refetchMine, refetchAvailable]);

  // ── Book mutation ───────────────────────────────────────────
  const bookMutation = useMutation({
    mutationFn: bookShift,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['rider', 'shifts'] });
      Alert.alert('✅ Shift Booked', 'Your shift has been successfully booked!');
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', err?.response?.data?.message || 'Failed to book shift. Please try again.');
    },
    onSettled: () => setBookingId(null),
  });

  // ── Cancel mutation ─────────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: cancelShift,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['rider', 'shifts'] });
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', err?.response?.data?.message || 'Failed to cancel shift. Please try again.');
    },
  });

  // ── Handlers ────────────────────────────────────────────────
  const handleBook = useCallback((shiftId) => {
    Alert.alert(
      'Book Shift',
      'Are you sure you want to book this shift?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Book',
          style: 'default',
          onPress: () => {
            setBookingId(shiftId);
            bookMutation.mutate(shiftId);
          },
        },
      ],
    );
  }, [bookMutation]);

  const handleCancel = useCallback((shiftId) => {
    Alert.alert(
      'Cancel Shift',
      'Are you sure you want to cancel this shift? This action cannot be undone.',
      [
        { text: 'Keep Shift', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => cancelMutation.mutate(shiftId),
        },
      ],
    );
  }, [cancelMutation]);

  // ── Loading state ────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading shifts…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        {/* ── Upcoming Shifts ── */}
        <SectionHeader title="Upcoming Shifts" count={myShifts.length} />

        {myShifts.length === 0 ? (
          <EmptySection message="No upcoming shifts. Book a shift below to get started!" />
        ) : (
          myShifts.map(shift => (
            <UpcomingShiftCard
              key={shift.id}
              shift={shift}
              onCancel={handleCancel}
            />
          ))
        )}

        {/* ── Available Shifts ── */}
        <SectionHeader title="Available Shifts" count={availableShifts.length} />

        {availableShifts.length === 0 ? (
          <EmptySection message="No shifts available right now. Check back later!" />
        ) : (
          availableShifts.map(shift => (
            <AvailableShiftCard
              key={shift.id}
              shift={shift}
              onBook={handleBook}
              isBooking={bookingId === shift.id && bookMutation.isPending}
            />
          ))
        )}

        <View style={{ height: Spacing[8] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[3],
  },

  // Loading
  loadingContainer: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing[3],
  },
  loadingText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.base,
    color:      Colors.textSecondary,
  },

  // Section header
  sectionHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   Spacing[3],
    marginTop:      Spacing[5],
  },
  sectionTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.lg,
    color:      Colors.text,
    flex:       1,
  },
  countPill: {
    backgroundColor:   Colors.primaryLight,
    borderRadius:      BorderRadius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical:   2,
  },
  countText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      Colors.primary,
  },

  // Empty section
  emptySection: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.lg,
    padding:         Spacing[5],
    alignItems:      'center',
    marginBottom:    Spacing[2],
  },
  emptySectionText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    textAlign:  'center',
  },

  // Shift card
  shiftCard: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.xl,
    padding:         Spacing[4],
    marginBottom:    Spacing[3],
    ...Shadow.md,
  },
  cardHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   Spacing[2],
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  cardDate: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.base,
    color:      Colors.text,
  },
  cardTime: {
    fontFamily:   Typography.fontFamily.medium,
    fontSize:     Typography.size.md,
    color:        Colors.primary,
    marginBottom: Spacing[2],
  },
  cardLocation: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  Spacing[3],
  },
  cardLocationText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    flex:       1,
  },

  // Status badge
  statusBadge: {
    borderRadius:      BorderRadius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical:   3,
  },
  statusText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.xs,
  },

  // Slots remaining
  slotsText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.warning,
  },

  // Incentive row
  incentiveRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.warningLight,
    borderRadius:    BorderRadius.md,
    padding:         Spacing[2],
    marginBottom:    Spacing[3],
  },
  incentiveRowText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.warning,
    flex:       1,
  },

  // Book button
  bookBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Colors.primary,
    borderRadius:    BorderRadius.lg,
    paddingVertical: Spacing[3],
    ...Shadow.sm,
  },
  bookBtnDisabled: {
    opacity: 0.6,
  },
  bookBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.base,
    color:      '#FFFFFF',
  },

  // Cancel button
  cancelBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1.5,
    borderColor:     Colors.error,
    borderRadius:    BorderRadius.lg,
    paddingVertical: Spacing[2],
  },
  cancelBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      Colors.error,
  },
});
