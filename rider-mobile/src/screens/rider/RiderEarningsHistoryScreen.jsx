// ────────────────────────────────────────────────────────────
// RiderEarningsHistoryScreen.jsx — Phase B
//
// Paginated history of past deliveries with per-delivery earnings.
//
// Features:
//   • Filter tabs: Today | This Week | This Month
//   • FlatList with pull-to-refresh and load-more pagination
//   • Each row: date/time, order ID (short), store→address, earnings breakdown
//   • Skeleton loader on first load
//   • Empty state with 🛵 icon
//
// API:
//   GET /rider/earnings/history?period=today|week|month&page=1&limit=20
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView }  from 'react-native-safe-area-context';
import { Ionicons }      from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { client }        from '../../api/client';

// ── Constants ─────────────────────────────────────────────────
const LIMIT   = 20;
const PERIODS = [
  { key: 'today', label: 'Today'     },
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month'},
];

// ── API ───────────────────────────────────────────────────────
async function fetchEarningsHistory({ period, page }) {
  const { data } = await client.get('/rider/earnings/history', {
    params: { period, page, limit: LIMIT },
  });
  return data?.data || { deliveries: [], total: 0 };
}

// ── Helpers ───────────────────────────────────────────────────
function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('en-IN', {
    day:    '2-digit',
    month:  'short',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function shortId(id) {
  if (!id) return '—';
  return id.toString().slice(0, 8).toUpperCase();
}

function formatRupees(paise) {
  return `₹${((paise || 0) / 100).toFixed(0)}`;
}

// ── Skeleton row ──────────────────────────────────────────────
function SkeletonRow() {
  return (
    <View style={styles.skeletonRow}>
      <View style={[styles.skeletonLine, { width: '40%', marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: '70%', marginBottom: 6 }]} />
      <View style={[styles.skeletonLine, { width: '55%' }]} />
    </View>
  );
}

// ── Earnings row ──────────────────────────────────────────────
function EarningsRow({ item }) {
  const basePaise      = item.base_pay_paise  || item.base_pay  || 0;
  const incentivePaise = item.incentive_paise || item.incentive || 0;
  const totalPaise     = item.total_earn_paise || item.total_earn || (basePaise + incentivePaise);

  const storeName = item.store_name    || item.shop_name       || 'Store';
  const toAddress = item.drop_address  || item.to_address      || item.customer_address || '';
  const shortAddr = toAddress.length > 28 ? toAddress.slice(0, 28) + '…' : toAddress;

  return (
    <View style={styles.row}>
      {/* Left: meta info */}
      <View style={styles.rowLeft}>
        <Text style={styles.rowDateTime}>
          {formatDateTime(item.delivered_at || item.created_at)}
        </Text>
        <Text style={styles.rowOrderId} numberOfLines={1}>
          Order #{shortId(item.order_id || item.sub_order_id || item.id)}
        </Text>
        <View style={styles.routeRow}>
          <Text style={styles.routeStore} numberOfLines={1}>{storeName}</Text>
          {shortAddr ? (
            <>
              <Ionicons name="arrow-forward" size={12} color={Colors.textTertiary} style={{ marginHorizontal: 4 }} />
              <Text style={styles.routeAddr} numberOfLines={1}>{shortAddr}</Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Right: earnings breakdown */}
      <View style={styles.rowRight}>
        <Text style={styles.totalEarn}>{formatRupees(totalPaise)}</Text>
        {incentivePaise > 0 && (
          <View style={styles.incentivePill}>
            <Text style={styles.incentiveText}>+{formatRupees(incentivePaise)} bonus</Text>
          </View>
        )}
        <Text style={styles.basePayText}>Base {formatRupees(basePaise)}</Text>
      </View>
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState({ period }) {
  const labels = { today: 'today', week: 'this week', month: 'this month' };
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>🛵</Text>
      <Text style={styles.emptyTitle}>No deliveries {labels[period] || ''}</Text>
      <Text style={styles.emptySubtitle}>
        Complete deliveries to see your earnings here.
      </Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function RiderEarningsHistoryScreen() {
  const [period, setPeriod]                     = useState('today');
  const [rows, setRows]                         = useState([]);
  const [page, setPage]                         = useState(1);
  const [hasMore, setHasMore]                   = useState(true);
  const [isLoading, setIsLoading]               = useState(false);
  const [isRefreshing, setIsRefreshing]         = useState(false);
  const [isFetchingMore, setIsFetchingMore]     = useState(false);
  const isFirstLoad = useRef(true);

  // ── Load page ───────────────────────────────────────────────
  const load = useCallback(async ({ selectedPeriod, pageNum, append = false }) => {
    try {
      const result      = await fetchEarningsHistory({ period: selectedPeriod, page: pageNum });
      const deliveries  = result.deliveries || [];
      setRows(prev => append ? [...prev, ...deliveries] : deliveries);
      setHasMore(deliveries.length >= LIMIT);
    } catch (err) {
      console.warn('[EarningsHistory] fetch error:', err?.message);
    }
  }, []);

  // ── Period change / initial load ────────────────────────────
  const onPeriodChange = useCallback(async (newPeriod) => {
    if (newPeriod === period && !isFirstLoad.current) return;
    isFirstLoad.current = false;
    setPeriod(newPeriod);
    setPage(1);
    setRows([]);
    setHasMore(true);
    setIsLoading(true);
    await load({ selectedPeriod: newPeriod, pageNum: 1, append: false });
    setIsLoading(false);
  }, [period, load]);

  useEffect(() => { onPeriodChange('today'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pull to refresh ─────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setPage(1);
    setHasMore(true);
    await load({ selectedPeriod: period, pageNum: 1, append: false });
    setIsRefreshing(false);
  }, [period, load]);

  // ── Load more ───────────────────────────────────────────────
  const onEndReached = useCallback(async () => {
    if (!hasMore || isFetchingMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    setIsFetchingMore(true);
    await load({ selectedPeriod: period, pageNum: nextPage, append: true });
    setIsFetchingMore(false);
  }, [hasMore, isFetchingMore, isLoading, page, period, load]);

  // ── Render ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Period filter tabs */}
      <View style={styles.filterBar}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.filterTab, period === p.key && styles.filterTabActive]}
            onPress={() => onPeriodChange(p.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, period === p.key && styles.filterTabTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Loading skeleton */}
      {isLoading ? (
        <View style={styles.skeletonContainer}>
          {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, idx) => `${item.id || item.sub_order_id || idx}`}
          renderItem={({ item }) => <EarningsRow item={item} />}
          contentContainerStyle={rows.length === 0 ? styles.flatListEmpty : styles.flatListContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState period={period} />}
          ListFooterComponent={
            isFetchingMore ? (
              <ActivityIndicator
                size="small"
                color={Colors.primary}
                style={{ paddingVertical: Spacing[4] }}
              />
            ) : null
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.background,
  },

  // Filter tabs
  filterBar: {
    flexDirection:    'row',
    backgroundColor:  Colors.surface,
    padding:          Spacing[2],
    marginHorizontal: Spacing[4],
    marginVertical:   Spacing[3],
    borderRadius:     BorderRadius.xl,
    ...Shadow.sm,
  },
  filterTab: {
    flex:            1,
    paddingVertical: Spacing[2],
    alignItems:      'center',
    borderRadius:    BorderRadius.lg,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
  },
  filterTabText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
  },
  filterTabTextActive: {
    color:      '#FFFFFF',
    fontFamily: Typography.fontFamily.semiBold,
  },

  // List
  flatListContent: {
    paddingHorizontal: Spacing[4],
    paddingBottom:     Spacing[8],
  },
  flatListEmpty: {
    flex:              1,
    paddingHorizontal: Spacing[4],
  },
  separator: {
    height:          1,
    backgroundColor: Colors.border,
    marginLeft:      Spacing[4],
  },

  // Delivery row
  row: {
    flexDirection:   'row',
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.lg,
    padding:         Spacing[4],
    marginVertical:  Spacing[1],
    alignItems:      'center',
    ...Shadow.sm,
  },
  rowLeft: {
    flex:        1,
    marginRight: Spacing[3],
  },
  rowDateTime: {
    fontFamily:   Typography.fontFamily.regular,
    fontSize:     Typography.size.xs,
    color:        Colors.textTertiary,
    marginBottom: 2,
  },
  rowOrderId: {
    fontFamily:   Typography.fontFamily.semiBold,
    fontSize:     Typography.size.sm,
    color:        Colors.text,
    marginBottom: 4,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'nowrap',
  },
  routeStore: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.secondary,
    maxWidth:   90,
  },
  routeAddr: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
    flex:       1,
  },
  rowRight: {
    alignItems: 'flex-end',
    minWidth:   72,
  },
  totalEarn: {
    fontFamily:   Typography.fontFamily.bold,
    fontSize:     Typography.size.lg,
    color:        Colors.success,
    marginBottom: 2,
  },
  incentivePill: {
    backgroundColor:   Colors.successLight,
    borderRadius:      BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical:   2,
    marginBottom:      2,
  },
  incentiveText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.success,
  },
  basePayText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textTertiary,
  },

  // Skeleton
  skeletonContainer: {
    paddingHorizontal: Spacing[4],
    paddingTop:        Spacing[2],
  },
  skeletonRow: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.lg,
    padding:         Spacing[4],
    marginBottom:    Spacing[2],
  },
  skeletonLine: {
    height:          12,
    backgroundColor: Colors.skeleton,
    borderRadius:    BorderRadius.sm,
  },

  // Empty state
  emptyContainer: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingTop:     Spacing[16],
  },
  emptyEmoji: {
    fontSize:     56,
    marginBottom: Spacing[4],
  },
  emptyTitle: {
    fontFamily:   Typography.fontFamily.bold,
    fontSize:     Typography.size.lg,
    color:        Colors.text,
    marginBottom: Spacing[2],
    textAlign:    'center',
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    textAlign:  'center',
    maxWidth:   260,
  },
});
