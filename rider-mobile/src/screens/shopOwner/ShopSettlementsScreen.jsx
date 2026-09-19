// ────────────────────────────────────────────────────────────
// ShopSettlementsScreen.jsx — Phase C
//
// Shows settlement history for the shop owner — a list of
// payouts made by the platform to the shop's bank account.
//
// API: GET /shop/settlements?page=1&limit=20
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView }  from 'react-native-safe-area-context';
import { Ionicons }      from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { client }        from '../../api/client';

const LIMIT = 20;

function fmt(paise) {
  return `₹${Math.floor((paise || 0) / 100).toLocaleString('en-IN')}`;
}

function StatusBadge({ status }) {
  const map = {
    pending:    { color: '#ca8a04', bg: '#fefce8', label: 'Pending'    },
    processing: { color: '#2563eb', bg: '#eff6ff', label: 'Processing' },
    settled:    { color: '#16a34a', bg: '#f0fdf4', label: 'Settled'    },
    failed:     { color: '#dc2626', bg: '#fef2f2', label: 'Failed'     },
  };
  const s = map[status] || { color: '#6b7280', bg: '#f1f5f9', label: status };
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

function SettlementRow({ item }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.amount}>{fmt(item.amount_paise)}</Text>
          <Text style={styles.subtitle}>
            {item.period_start ? new Date(item.period_start).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : ''}{' '}
            – {item.period_end ? new Date(item.period_end).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : ''}
          </Text>
          {item.utr && (
            <Text style={styles.utr}>UTR: {item.utr}</Text>
          )}
        </View>
        <StatusBadge status={item.status} />
      </View>
      <View style={styles.breakdown}>
        <BreakdownRow label="Gross GMV"       value={fmt(item.gross_gmv_paise)} />
        <BreakdownRow label="Commission"      value={`– ${fmt(item.commission_paise)}`} />
        <BreakdownRow label="TDS (1%)"        value={`– ${fmt(item.tds_paise)}`} />
        <BreakdownRow label="Net Settlement"  value={fmt(item.amount_paise)} bold />
      </View>
    </View>
  );
}

function BreakdownRow({ label, value, bold }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownLabel, bold && { fontFamily: Typography.fontFamily.bold }]}>{label}</Text>
      <Text style={[styles.breakdownValue, bold && { fontFamily: Typography.fontFamily.bold, color: Colors.text }]}>{value}</Text>
    </View>
  );
}

export default function ShopSettlementsScreen({ navigation }) {
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page,     setPage]     = useState(1);
  const [hasMore,  setHasMore]  = useState(false);

  const load = useCallback(async (p = 1, refresh = false) => {
    if (refresh) setRefreshing(true);
    else if (p === 1) setLoading(true);
    try {
      const { data } = await client.get(`/shop/settlements?page=${p}&limit=${LIMIT}`);
      const list = data?.settlements || [];
      setItems(prev => p === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === LIMIT);
      setPage(p);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(1); }, []);

  const onRefresh = () => load(1, true);
  const onLoadMore = () => { if (hasMore) load(page + 1); };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}><Text style={styles.headerTitle}>Settlements</Text></View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settlements</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <SettlementRow item={item} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💰</Text>
            <Text style={styles.emptyTitle}>No settlements yet</Text>
            <Text style={styles.emptySub}>Settlements are processed weekly</Text>
          </View>
        }
        ListFooterComponent={hasMore ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} /> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: Colors.background },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  headerTitle:    { fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.text },
  list:           { padding: Spacing.md, gap: 12, paddingBottom: 32 },
  card:           { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadow.sm },
  cardRow:        { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 12 },
  amount:         { fontFamily: Typography.fontFamily.bold, fontSize: 22, color: Colors.text },
  subtitle:       { fontFamily: Typography.fontFamily.regular, fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  utr:            { fontFamily: Typography.fontFamily.mono || 'monospace', fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  badge:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText:      { fontFamily: Typography.fontFamily.bold, fontSize: 11 },
  breakdown:      { borderTopWidth: 1, borderTopColor: Colors.background, paddingHorizontal: 16, paddingVertical: 10 },
  breakdownRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  breakdownLabel: { fontFamily: Typography.fontFamily.regular, fontSize: 12, color: Colors.textSecondary },
  breakdownValue: { fontFamily: Typography.fontFamily.regular, fontSize: 12, color: Colors.textSecondary },
  empty:          { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:      { fontSize: 48, marginBottom: 12 },
  emptyTitle:     { fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.text },
  emptySub:       { fontFamily: Typography.fontFamily.regular, fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
});
