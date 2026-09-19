/**
 * ShopAnalyticsScreen — Session M
 *
 * Shows shop owner a real-time analytics dashboard:
 *   1. Period picker       — Today / 7 Days / 30 Days
 *   2. Revenue card        — total GMV + trend % vs prior period
 *   3. Orders card         — total, delivered, cancelled, cancel rate
 *   4. Avg delivery time   — quick vs scheduled (minutes)
 *   5. Revenue sparkline   — 7 or 30-day bar chart (native, no extra lib)
 *   6. Top 5 Products      — sorted by revenue
 *   7. Peak Hours          — busiest hour of day
 *   8. Low Stock Alerts    — items needing restock
 *
 * Data: GET /shop/analytics?period=today|7d|30d
 *       GET /shop/analytics/revenue-trend?days=7|30
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { getShopAnalytics, getRevenueTrend } from '../../api/shopOwner';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';

// ─── Helpers ───────────────────────────────────────────────────────────────

function rupees(paise) {
  if (!paise && paise !== 0) return '—';
  if (paise >= 10000000) return `₹${(paise / 10000000).toFixed(1)}Cr`;
  if (paise >= 100000)   return `₹${(paise / 100000).toFixed(1)}L`;
  if (paise >= 1000)     return `₹${(paise / 1000).toFixed(1)}K`;
  return `₹${(paise / 100).toFixed(0)}`;
}

function trendColor(pct) {
  if (pct === null || pct === undefined) return Colors.textSecondary;
  return pct >= 0 ? Colors.success : Colors.error;
}
function trendIcon(pct) {
  if (pct === null || pct === undefined) return 'remove-outline';
  return pct >= 0 ? 'trending-up-outline' : 'trending-down-outline';
}
function trendLabel(pct) {
  if (pct === null || pct === undefined) return 'No prior data';
  return `${pct >= 0 ? '+' : ''}${pct}% vs prev period`;
}

const PERIODS = [
  { key: 'today', label: 'Today',   trendDays: 7  },
  { key: '7d',    label: '7 Days',  trendDays: 7  },
  { key: '30d',   label: '30 Days', trendDays: 30 },
];

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, trendPct, color }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub !== undefined && sub !== null && (
        <Text style={styles.statSub}>{sub}</Text>
      )}
      {trendPct !== undefined && (
        <View style={styles.trendRow}>
          <Ionicons name={trendIcon(trendPct)} size={12} color={trendColor(trendPct)} />
          <Text style={[styles.trendText, { color: trendColor(trendPct) }]}>
            {trendLabel(trendPct)}
          </Text>
        </View>
      )}
    </View>
  );
}

function SectionHeader({ title }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function ProductRow({ rank, name, unitsSold, revenue, maxRevenue }) {
  const pct = maxRevenue > 0 ? (revenue / maxRevenue) : 0;
  return (
    <View style={styles.productRow}>
      <Text style={styles.productRank}>{rank}</Text>
      <View style={{ flex: 1 }}>
        <View style={styles.productNameRow}>
          <Text style={styles.productName} numberOfLines={1}>{name}</Text>
          <Text style={styles.productRevenue}>{rupees(revenue)}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` }]} />
        </View>
        <Text style={styles.productUnits}>{unitsSold} units sold</Text>
      </View>
    </View>
  );
}

function PeakHoursBar({ hours }) {
  if (!hours?.length) return <Text style={styles.emptyText}>No data for this period</Text>;
  const max = Math.max(...hours.map(h => h.orderCount), 1);
  const busiest = hours.reduce((a, b) => b.orderCount > a.orderCount ? b : a, hours[0]);
  // Show only 8 representative hours (every 3rd)
  const shown = hours.filter((_, i) => i % 3 === 0);
  return (
    <View>
      <Text style={styles.peakNote}>
        🔥 Busiest: {busiest.hour}:00–{busiest.hour + 1}:00 ({busiest.orderCount} orders)
      </Text>
      <View style={styles.barContainer}>
        {shown.map(h => (
          <View key={h.hour} style={styles.barColumn}>
            <View style={[styles.bar, { height: Math.max(4, Math.round((h.orderCount / max) * 60)) }]} />
            <Text style={styles.barLabel}>{h.hour}h</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SparkLine({ trend, period }) {
  if (!trend?.length) return <Text style={styles.emptyText}>No trend data</Text>;
  const maxRev = Math.max(...trend.map(t => t.revenue_paise || 0), 1);
  return (
    <View style={styles.sparkContainer}>
      {trend.map((d, i) => {
        const h = Math.max(4, Math.round(((d.revenue_paise || 0) / maxRev) * 64));
        const label = d.date ? d.date.slice(5) : `D${i + 1}`; // MM-DD
        return (
          <View key={d.date || i} style={styles.sparkCol}>
            <Text style={styles.sparkRevLabel}>{d.orders > 0 ? d.orders : ''}</Text>
            <View style={[styles.sparkBar, { height: h }]} />
            {(i === 0 || i === Math.floor(trend.length / 2) || i === trend.length - 1) && (
              <Text style={styles.sparkDateLabel}>{label}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function LowStockItem({ item }) {
  return (
    <View style={styles.lowStockRow}>
      <Ionicons name="warning-outline" size={16} color={Colors.warning} />
      <Text style={styles.lowStockName} numberOfLines={1}>{item.name || item.product_name}</Text>
      <Text style={styles.lowStockQty}>{item.stock_qty ?? item.stock_quantity ?? '—'} left</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ShopAnalyticsScreen({ navigation }) {
  const [period, setPeriod] = useState('7d');

  const trendDays = PERIODS.find(p => p.key === period)?.trendDays ?? 7;

  const {
    data: analytics,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey:  ['shop-analytics', period],
    queryFn:   () => getShopAnalytics(period),
    staleTime: 2 * 60 * 1000, // 2 min
    select:    res => res?.data || res,
  });

  const {
    data: trend,
    isLoading: trendLoading,
  } = useQuery({
    queryKey:  ['shop-revenue-trend', trendDays],
    queryFn:   () => getRevenueTrend(trendDays),
    staleTime: 5 * 60 * 1000,
    select:    res => res?.data || res,
  });

  const loading = isLoading || isRefetching;

  const revenue  = analytics?.revenue  || {};
  const orders   = analytics?.orders   || {};
  const products = analytics?.topProducts || [];
  const hours    = analytics?.peakHours || [];
  const delivery = analytics?.avgDeliveryTime || {};
  const lowStock = analytics?.lowStockAlerts || [];

  const maxProductRevenue = Math.max(...products.map(p => p.revenue || 0), 1);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.heading}>Shop Analytics</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── Period Picker ── */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodLabel, period === p.key && styles.periodLabelActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isError && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={Colors.error} />
          <Text style={styles.errorText}>Failed to load analytics. Tap refresh.</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading analytics…</Text>
          </View>
        ) : (
          <>
            {/* ── Revenue + Orders cards ── */}
            <View style={styles.cardRow}>
              <StatCard
                icon="cash-outline"
                label="Revenue"
                color={Colors.primary}
                value={rupees(revenue.total)}
                trendPct={revenue.trend}
              />
              <StatCard
                icon="receipt-outline"
                label="Orders"
                color={Colors.secondary}
                value={orders.total?.toString() || '0'}
                sub={`${orders.delivered || 0} delivered`}
              />
            </View>

            <View style={styles.cardRow}>
              <StatCard
                icon="close-circle-outline"
                label="Cancel Rate"
                color={Colors.error}
                value={`${orders.cancelRate || 0}%`}
                sub={`${orders.cancelled || 0} cancelled`}
              />
              <StatCard
                icon="time-outline"
                label="Avg Delivery"
                color={Colors.info}
                value={delivery.quick ? `${Math.round(delivery.quick)} min` : '—'}
                sub={delivery.scheduled ? `Scheduled: ${Math.round(delivery.scheduled)} min` : 'Quick orders'}
              />
            </View>

            {/* ── Tier split ── */}
            {(revenue.byTier?.quick > 0 || revenue.byTier?.scheduled > 0) && (
              <View style={styles.tierCard}>
                <Text style={styles.tierTitle}>Revenue by Tier</Text>
                <View style={styles.tierRow}>
                  <View style={[styles.tierDot, { backgroundColor: Colors.quick }]} />
                  <Text style={styles.tierLabel}>⚡ Quick</Text>
                  <Text style={styles.tierValue}>{rupees(revenue.byTier?.quick || 0)}</Text>
                </View>
                <View style={styles.tierRow}>
                  <View style={[styles.tierDot, { backgroundColor: Colors.scheduled }]} />
                  <Text style={styles.tierLabel}>📅 Scheduled</Text>
                  <Text style={styles.tierValue}>{rupees(revenue.byTier?.scheduled || 0)}</Text>
                </View>
              </View>
            )}

            {/* ── Revenue Sparkline ── */}
            <View style={styles.card}>
              <SectionHeader title={`Revenue — Last ${trendDays} Days`} />
              {trendLoading
                ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 16 }} />
                : <SparkLine trend={Array.isArray(trend) ? trend : trend?.trend || []} period={period} />
              }
            </View>

            {/* ── Top Products ── */}
            <View style={styles.card}>
              <SectionHeader title="Top 5 Products" />
              {products.length === 0
                ? <Text style={styles.emptyText}>No sales data for this period</Text>
                : products.map((p, i) => (
                    <ProductRow
                      key={p.productId || i}
                      rank={i + 1}
                      name={p.name}
                      unitsSold={p.unitsSold}
                      revenue={p.revenue}
                      maxRevenue={maxProductRevenue}
                    />
                  ))
              }
            </View>

            {/* ── Peak Hours ── */}
            <View style={styles.card}>
              <SectionHeader title="Peak Order Hours (IST)" />
              <PeakHoursBar hours={hours} />
            </View>

            {/* ── Low Stock ── */}
            {lowStock.length > 0 && (
              <View style={[styles.card, styles.lowStockCard]}>
                <View style={styles.lowStockHeader}>
                  <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                  <Text style={styles.sectionHeader}> Low Stock Alerts</Text>
                </View>
                {lowStock.map((item, i) => (
                  <LowStockItem key={item.id || i} item={item} />
                ))}
                <TouchableOpacity
                  onPress={() => navigation?.navigate('ShopInventoryTab')}
                  style={styles.inventoryBtn}
                >
                  <Text style={styles.inventoryBtnText}>Manage Inventory →</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ height: 32 }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.background },

  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: Spacing[4], paddingTop: Spacing[2], paddingBottom: Spacing[1] },
  heading:      { fontFamily: Typography.fontFamily.bold, fontSize: 22, color: Colors.text },
  refreshBtn:   { padding: 4 },

  periodRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing[4],
                  paddingBottom: Spacing[3] },
  periodBtn:    { flex: 1, paddingVertical: 8, borderRadius: BorderRadius.lg,
                  backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
                  alignItems: 'center' },
  periodBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  periodLabel:  { fontFamily: Typography.fontFamily.semiBold, fontSize: 13, color: Colors.textSecondary },
  periodLabelActive: { color: '#fff' },

  errorBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8,
                  marginHorizontal: Spacing[4], marginBottom: Spacing[2],
                  backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md,
                  padding: Spacing[3] },
  errorText:    { fontFamily: Typography.fontFamily.medium, fontSize: 13, color: Colors.error },

  scroll:       { padding: Spacing[4], paddingTop: 0, gap: 12 },

  loadingBox:   { alignItems: 'center', paddingTop: 60, gap: 12 },
  loadingText:  { fontFamily: Typography.fontFamily.medium, color: Colors.textSecondary, fontSize: 14 },

  // ── Stat cards ────────────────────────────────────────────────
  cardRow:      { flexDirection: 'row', gap: 12 },
  statCard:     { flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
                  padding: Spacing[4], ...Shadow.sm },
  statIcon:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center',
                  justifyContent: 'center', marginBottom: 8 },
  statLabel:    { fontFamily: Typography.fontFamily.medium, fontSize: 12,
                  color: Colors.textSecondary, marginBottom: 4 },
  statValue:    { fontFamily: Typography.fontFamily.bold, fontSize: 20, color: Colors.text },
  statSub:      { fontFamily: Typography.fontFamily.regular, fontSize: 12,
                  color: Colors.textSecondary, marginTop: 2 },
  trendRow:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  trendText:    { fontFamily: Typography.fontFamily.medium, fontSize: 11 },

  // ── Tier card ─────────────────────────────────────────────────
  tierCard:     { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
                  padding: Spacing[4], ...Shadow.sm },
  tierTitle:    { fontFamily: Typography.fontFamily.semiBold, fontSize: 13,
                  color: Colors.textSecondary, marginBottom: 10 },
  tierRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  tierDot:      { width: 8, height: 8, borderRadius: 4 },
  tierLabel:    { fontFamily: Typography.fontFamily.medium, fontSize: 13,
                  color: Colors.text, flex: 1 },
  tierValue:    { fontFamily: Typography.fontFamily.bold, fontSize: 14, color: Colors.text },

  // ── Generic card ──────────────────────────────────────────────
  card:         { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
                  padding: Spacing[4], ...Shadow.sm },
  sectionHeader: { fontFamily: Typography.fontFamily.semiBold, fontSize: 14,
                   color: Colors.textSecondary, marginBottom: 12 },
  emptyText:    { fontFamily: Typography.fontFamily.regular, fontSize: 13,
                  color: Colors.textTertiary, textAlign: 'center', paddingVertical: 16 },

  // ── Sparkline ─────────────────────────────────────────────────
  sparkContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 3,
                    height: 80, overflow: 'hidden' },
  sparkCol:     { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  sparkBar:     { width: '100%', backgroundColor: Colors.primary,
                  borderRadius: 3, minHeight: 4 },
  sparkRevLabel: { fontFamily: Typography.fontFamily.regular, fontSize: 8,
                   color: Colors.textTertiary, marginBottom: 2 },
  sparkDateLabel: { fontFamily: Typography.fontFamily.regular, fontSize: 8,
                    color: Colors.textSecondary, marginTop: 3 },

  // ── Top products ──────────────────────────────────────────────
  productRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                  marginBottom: 12 },
  productRank:  { fontFamily: Typography.fontFamily.bold, fontSize: 16,
                  color: Colors.textTertiary, width: 20, marginTop: 2 },
  productNameRow: { flexDirection: 'row', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 4 },
  productName:  { fontFamily: Typography.fontFamily.semiBold, fontSize: 13,
                  color: Colors.text, flex: 1 },
  productRevenue: { fontFamily: Typography.fontFamily.bold, fontSize: 13,
                    color: Colors.primary },
  progressTrack: { height: 4, backgroundColor: Colors.surface2, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  productUnits: { fontFamily: Typography.fontFamily.regular, fontSize: 11,
                  color: Colors.textSecondary, marginTop: 3 },

  // ── Peak hours ────────────────────────────────────────────────
  peakNote:     { fontFamily: Typography.fontFamily.medium, fontSize: 12,
                  color: Colors.warning, marginBottom: 10 },
  barContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 80 },
  barColumn:    { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar:          { width: '80%', backgroundColor: Colors.primary + 'AA', borderRadius: 3 },
  barLabel:     { fontFamily: Typography.fontFamily.regular, fontSize: 9,
                  color: Colors.textSecondary, marginTop: 3 },

  // ── Low stock ─────────────────────────────────────────────────
  lowStockCard: { borderWidth: 1, borderColor: Colors.warningLight },
  lowStockHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  lowStockRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6,
                  borderTopWidth: 1, borderTopColor: Colors.border },
  lowStockName: { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: 13,
                  color: Colors.text },
  lowStockQty:  { fontFamily: Typography.fontFamily.bold, fontSize: 13, color: Colors.warning },
  inventoryBtn: { marginTop: 10, alignSelf: 'flex-end' },
  inventoryBtnText: { fontFamily: Typography.fontFamily.semiBold, fontSize: 13,
                       color: Colors.primary },
});
