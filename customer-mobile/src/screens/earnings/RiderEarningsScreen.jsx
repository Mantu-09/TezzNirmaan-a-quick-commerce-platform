// ────────────────────────────────────────────────────────────
// RiderEarningsScreen — P2-B
//
// Sections:
//   1. Today's summary card (total ₹, delivery count, peak bonus)
//   2. Pending payout banner
//   3. 7-day earnings bar chart (pure RN View-based, no library)
//   4. This week's delivery list with per-delivery earnings
//   5. Payment history (past payout batches)
//
// Design:
//   • Uses theme Colors / Typography / Spacing (same as rest of app)
//   • Pull-to-refresh
//   • Skeleton loading via animated opacity
//   • Role-gated: only role === 'rider' can reach this screen
// ────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  Animated, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Spacing } from '../../theme';
import { getRiderEarnings } from '../../api/earnings';
import { client }           from '../../api/client'; // P9-4: payout request
import { useNavigation }    from '@react-navigation/native'; // Session E: bank account nav

// ── Formatters ────────────────────────────────────────────────
const fmt = {
  paise: v => `₹${((v || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
  date:  d => {
    const dt = new Date(d);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return `${days[dt.getDay()]} ${dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
  },
  time:  d => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
};

// ── Skeleton ──────────────────────────────────────────────────
function Skeleton({ height = 16, width = '100%', borderRadius = 6, style }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[{ height, width, borderRadius, backgroundColor: Colors.surface2, opacity: anim }, style]} />
  );
}

// ── 7-Day Bar Chart ───────────────────────────────────────────
function WeeklyBarChart({ data }) {
  if (!data?.length) return null;

  const max       = Math.max(...data.map(d => d.totalPaise), 1);
  const BAR_H     = 80;
  const days      = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartBars}>
        {data.map((d, i) => {
          const pct    = Math.max(0.04, d.totalPaise / max);
          const dayIdx = new Date(d.date + 'T00:00:00').getDay();
          const isToday = i === data.length - 1;
          return (
            <View key={d.date} style={styles.chartBarCol}>
              {/* Value label on top if non-zero */}
              {d.totalPaise > 0 && (
                <Text style={[styles.chartBarVal, isToday && { color: Colors.primary }]}>
                  {fmt.paise(d.totalPaise)}
                </Text>
              )}
              {/* Bar */}
              <View style={[styles.chartBarTrack, { height: BAR_H }]}>
                <View style={[
                  styles.chartBarFill,
                  {
                    height: BAR_H * pct,
                    backgroundColor: isToday
                      ? Colors.primary
                      : d.totalPaise > 0
                        ? Colors.primaryLight
                        : Colors.surface2,
                    borderWidth: isToday ? 0 : 0,
                  },
                ]} />
              </View>
              {/* Day label */}
              <Text style={[styles.chartBarLabel, isToday && { color: Colors.primary, fontFamily: Typography.fontFamily.bold }]}>
                {days[dayIdx]}
              </Text>
              {/* Delivery count dot */}
              {d.deliveryCount > 0 && (
                <Text style={styles.chartBarCount}>{d.deliveryCount}</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Delivery Tier Badge ───────────────────────────────────────
function TierBadge({ tier }) {
  const isQuick = tier === 'quick';
  return (
    <View style={[styles.tierBadge, { backgroundColor: isQuick ? Colors.primaryLight : Colors.secondaryLight }]}>
      <Text style={[styles.tierBadgeText, { color: isQuick ? Colors.primary : Colors.secondary }]}>
        {isQuick ? '⚡ Quick' : '📅 Sched'}
      </Text>
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────
function SectionHeader({ title, sub }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {sub && <Text style={styles.sectionSub}>{sub}</Text>}
    </View>
  );
}

// ── Payment Status Badge ──────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending:    { bg: Colors.warningLight, text: Colors.warning,   label: 'Pending' },
    processing: { bg: Colors.infoLight,    text: Colors.info,      label: 'Processing' },
    paid:       { bg: Colors.successLight, text: Colors.success,   label: 'Paid' },
  };
  const s = map[status] || map.pending;
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
      <Text style={[styles.statusBadgeText, { color: s.text }]}>{s.label}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function RiderEarningsScreen() {
  const navigation   = useNavigation();            // Session E: navigate to RiderBankAccount
  const [data,          setData]          = useState(null);
  const [loading,        setLoading]       = useState(true);
  const [refreshing,     setRefreshing]    = useState(false);
  const [error,          setError]         = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [payoutLoading,  setPayoutLoading]  = useState(false); // P9-4

  // P9-4: Request payout handler
  const handleRequestPayout = async () => {
    setPayoutLoading(true);
    try {
      const { data: res } = await client.post('/rider/payout-request');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Payout Requested ✓',
        res?.message || 'Your request is being processed. Payment within 24 hours.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.response?.data?.message || err.message || 'Failed to request payout.';
      Alert.alert('Error', msg);
    } finally {
      setPayoutLoading(false);
    }
  };

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    setError('');
    try {
      const res = await getRiderEarnings();
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load earnings. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => load(true);

  // ── Loading skeleton ────────────────────────────────────────
  if (loading) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Skeleton height={160} borderRadius={16} style={{ marginBottom: 16 }} />
        <Skeleton height={80}  borderRadius={12} style={{ marginBottom: 16 }} />
        <Skeleton height={120} borderRadius={12} style={{ marginBottom: 16 }} />
        {[0,1,2].map(i => <Skeleton key={i} height={70} borderRadius={10} style={{ marginBottom: 10 }} />)}
      </ScrollView>
    );
  }

  // ── Error state ─────────────────────────────────────────────
  if (error && !data) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const d = data || {};
  const history = showAllHistory ? d.paymentHistory : d.paymentHistory?.slice(0, 3);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Today's Earnings Card ── */}
      <View style={styles.todayCard}>
        <View style={styles.todayHeader}>
          <Text style={styles.todayLabel}>Today's Earnings</Text>
          <View style={styles.todayIcon}>
            <Ionicons name="wallet" size={20} color={Colors.primary} />
          </View>
        </View>

        <Text style={styles.todayAmount}>{fmt.paise(d.today?.totalPaise)}</Text>

        <View style={styles.todayRow}>
          <View style={styles.todayStat}>
            <Text style={styles.todayStatVal}>{d.today?.deliveryCount ?? 0}</Text>
            <Text style={styles.todayStatLabel}>Deliveries</Text>
          </View>
          <View style={styles.todayDivider} />
          <View style={styles.todayStat}>
            <Text style={styles.todayStatVal}>{fmt.paise(d.today?.bonusPaise)}</Text>
            <Text style={styles.todayStatLabel}>Peak bonus</Text>
          </View>
          <View style={styles.todayDivider} />
          <View style={styles.todayStat}>
            <Text style={styles.todayStatVal}>{d.today?.peakDeliveries ?? 0}</Text>
            <Text style={styles.todayStatLabel}>Peak trips</Text>
          </View>
        </View>

        {(d.today?.peakDeliveries ?? 0) > 0 && (
          <View style={styles.peakBadge}>
            <Ionicons name="flash" size={12} color={Colors.primary} />
            <Text style={styles.peakBadgeText}>You earned peak bonuses today! 🔥</Text>
          </View>
        )}
      </View>

      {/* ── Pending Payout Banner ── */}
      {(d.pending?.totalPaise ?? 0) > 0 && (
        <View style={styles.pendingBanner}>
          <View style={styles.pendingLeft}>
            <Ionicons name="time-outline" size={20} color={Colors.warning} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.pendingLabel}>Pending Payout</Text>
              <Text style={styles.pendingHint}>Paid every week · Fri–Sun</Text>
            </View>
          </View>
          <View style={styles.pendingRight}>
            <Text style={styles.pendingAmount}>{fmt.paise(d.pending?.totalPaise)}</Text>
            {/* P9-4: Request Payout button */}
            <TouchableOpacity
              style={styles.payoutBtn}
              onPress={handleRequestPayout}
              disabled={payoutLoading}
              activeOpacity={0.8}
            >
              {payoutLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.payoutBtnText}>Request Payout</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Bank Account — Session E gap fix (surfaces GET/POST /rider/bank-account) ── */}
      <TouchableOpacity
        onPress={() => navigation.navigate('RiderBankAccount')}
        activeOpacity={0.8}
        style={styles.bankAccountBtn}
      >
        <Ionicons name="card-outline" size={16} color={Colors.primary} />
        <Text style={styles.bankAccountBtnText}>Bank Account for Payouts</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>

      {/* ── 7-Day Bar Chart ── */}
      <View style={styles.card}>
        <SectionHeader
          title="This Week"
          sub={`₹${((d.week?.totalPaise || 0) / 100).toFixed(0)} · ${d.week?.deliveryCount ?? 0} deliveries`}
        />
        <WeeklyBarChart data={d.dailyChart} />
      </View>

      {/* ── This Week's Deliveries ── */}
      {(d.week?.deliveries?.length ?? 0) > 0 && (
        <View style={styles.card}>
          <SectionHeader title="Delivery Breakdown" sub="Tap for details" />
          {d.week.deliveries.map((del, i) => (
            <View key={del.id} style={[styles.deliveryRow, i > 0 && styles.deliveryRowBorder]}>
              <View style={styles.deliveryLeft}>
                <TierBadge tier={del.deliveryTier} />
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={styles.deliveryAddr} numberOfLines={1}>
                    {del.deliveryAddress}
                  </Text>
                  <Text style={styles.deliveryTime}>
                    {fmt.date(del.earnedAt)} · {fmt.time(del.earnedAt)}
                  </Text>
                  {del.isPeakBonus && (
                    <Text style={styles.bonusTag}>⚡ +{fmt.paise(del.bonusPaise)} peak bonus</Text>
                  )}
                </View>
              </View>
              <View style={styles.deliveryRight}>
                <Text style={styles.deliveryEarning}>{fmt.paise(del.totalPaise)}</Text>
                <StatusBadge status={del.status} />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Payment History ── */}
      <View style={[styles.card, { marginBottom: 32 }]}>
        <SectionHeader title="Payment History" sub="Past weekly payouts" />

        {!d.paymentHistory?.length ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={32} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No payouts yet.</Text>
            <Text style={styles.emptyHint}>Your first payout will appear after your first week.</Text>
          </View>
        ) : (
          <>
            {history.map((batch, i) => (
              <View key={batch.id} style={[styles.batchRow, i > 0 && styles.batchRowBorder]}>
                <View style={styles.batchLeft}>
                  <Text style={styles.batchPeriod}>
                    {new Date(batch.period_start).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    {' – '}
                    {new Date(batch.period_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </Text>
                  {batch.payment_reference && (
                    <Text style={styles.batchRef}>Ref: {batch.payment_reference}</Text>
                  )}
                  {batch.paid_at && (
                    <Text style={styles.batchPaidAt}>
                      Paid on {new Date(batch.paid_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </Text>
                  )}
                </View>
                <View style={styles.batchRight}>
                  <Text style={styles.batchAmount}>{fmt.paise(batch.total_paise)}</Text>
                  <StatusBadge status={batch.status} />
                </View>
              </View>
            ))}

            {(d.paymentHistory?.length ?? 0) > 3 && (
              <TouchableOpacity
                style={styles.showMoreBtn}
                onPress={() => setShowAllHistory(v => !v)}
              >
                <Text style={styles.showMoreText}>
                  {showAllHistory
                    ? 'Show less'
                    : `Show ${d.paymentHistory.length - 3} more`}
                </Text>
                <Ionicons
                  name={showAllHistory ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={Colors.primary}
                />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
  },

  // Today card
  todayCard: {
    backgroundColor:  Colors.secondary,
    borderRadius:     20,
    padding:          Spacing.lg,
    marginBottom:     Spacing.md,
  },
  todayHeader: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    marginBottom:     Spacing.sm,
  },
  todayLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  todayIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  todayAmount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   42,
    color:      '#FFFFFF',
    lineHeight: 48,
    marginBottom: Spacing.md,
  },
  todayRow: {
    flexDirection:   'row',
    justifyContent:  'space-around',
    alignItems:      'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius:    12,
    paddingVertical: Spacing.sm,
  },
  todayStat: { alignItems: 'center', flex: 1 },
  todayStatVal: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.lg,
    color:      '#FFFFFF',
  },
  todayStatLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      'rgba(255,255,255,0.55)',
    marginTop:  2,
  },
  todayDivider: {
    width: 1, height: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  peakBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: 'rgba(232,116,12,0.25)',
    borderRadius:    20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop:       Spacing.sm,
    alignSelf:       'flex-start',
    gap: 4,
  },
  peakBadgeText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.primary,
  },

  // Pending banner
  pendingBanner: {
    flexDirection:    'column',
    backgroundColor:  Colors.warningLight,
    borderRadius:     12,
    padding:          Spacing.md,
    marginBottom:     Spacing.md,
    borderLeftWidth:  3,
    borderLeftColor:  Colors.warning,
    gap: 10,
  },
  pendingLeft:   { flexDirection: 'row', alignItems: 'center', flex: 1 },
  pendingRight:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pendingLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      Colors.text,
  },
  pendingHint: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
    marginTop:  2,
  },
  pendingAmount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.xl,
    color:      Colors.warning,
  },
  // P9-4: Request Payout button
  payoutBtn: {
    backgroundColor:  Colors.primary,
    borderRadius:     8,
    paddingVertical:  8,
    paddingHorizontal: 14,
    minWidth: 80,
    alignItems: 'center',
  },
  payoutBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.xs,
    color:      '#fff',
  },

  // Bank account nav row (Session E)
  bankAccountBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              10,
    backgroundColor:  Colors.surface,
    borderRadius:     12,
    padding:          Spacing.md,
    marginBottom:     Spacing.md,
    borderWidth:      1,
    borderColor:      Colors.border,
  },
  bankAccountBtnText: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.text,
    flex:       1,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius:    16,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.06,
    shadowRadius:    4,
    elevation:       2,
  },

  // Section header
  sectionHeader: { marginBottom: Spacing.sm },
  sectionTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.md,
    color:      Colors.text,
  },
  sectionSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
    marginTop:  2,
  },

  // Bar chart
  chartContainer: { marginTop: Spacing.sm },
  chartBars: {
    flexDirection:  'row',
    alignItems:     'flex-end',
    gap: 4,
  },
  chartBarCol: {
    flex: 1,
    alignItems: 'center',
  },
  chartBarVal: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   7,
    color:      Colors.textTertiary,
    marginBottom: 2,
    textAlign: 'center',
  },
  chartBarTrack: {
    width:           '80%',
    backgroundColor: Colors.surface2,
    borderRadius:    4,
    justifyContent:  'flex-end',
    overflow:        'hidden',
  },
  chartBarFill: {
    width:        '100%',
    borderRadius: 4,
    minHeight:    3,
  },
  chartBarLabel: {
    fontFamily:  Typography.fontFamily.regular,
    fontSize:    10,
    color:       Colors.textTertiary,
    marginTop:   4,
    textAlign:   'center',
  },
  chartBarCount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   9,
    color:      Colors.primary,
    marginTop:  1,
  },

  // Delivery row
  deliveryRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    paddingVertical: Spacing.sm,
  },
  deliveryRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  deliveryLeft: { flexDirection: 'row', flex: 1, alignItems: 'flex-start', marginRight: Spacing.sm },
  deliveryAddr: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.text,
  },
  deliveryTime: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
    marginTop:  2,
  },
  bonusTag: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.primary,
    marginTop:  2,
  },
  deliveryRight: { alignItems: 'flex-end' },
  deliveryEarning: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.md,
    color:      Colors.success,
    marginBottom: 4,
  },

  // Tier badge
  tierBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  tierBadgeText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.xs,
  },

  // Status badge
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.xs,
  },

  // Payout batch row
  batchRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: Spacing.sm,
  },
  batchRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  batchLeft: { flex: 1, marginRight: Spacing.sm },
  batchPeriod: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      Colors.text,
  },
  batchRef: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
    marginTop:  2,
  },
  batchPaidAt: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.success,
    marginTop:  2,
  },
  batchRight: { alignItems: 'flex-end' },
  batchAmount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.md,
    color:      Colors.text,
    marginBottom: 4,
  },

  // Show more
  showMoreBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.xs,
    gap: 4,
  },
  showMoreText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      Colors.primary,
  },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyText: {
    fontFamily:  Typography.fontFamily.semiBold,
    fontSize:    Typography.size.md,
    color:       Colors.textSecondary,
    marginTop:   Spacing.sm,
  },
  emptyHint: {
    fontFamily:  Typography.fontFamily.regular,
    fontSize:    Typography.size.xs,
    color:       Colors.textTertiary,
    marginTop:   Spacing.xs,
    textAlign:   'center',
  },

  // Error state
  errorText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.error,
    marginTop:  Spacing.md,
    textAlign:  'center',
    marginHorizontal: Spacing.xl,
  },
  retryBtn: {
    marginTop:   Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
  },
  retryBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      Colors.primaryText,
  },
});
