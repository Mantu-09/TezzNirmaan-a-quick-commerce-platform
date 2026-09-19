import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import StatusTimeline from './StatusTimeline';
import { formatPaise } from '../../utils/money';
import { formatOrderTime, formatQuickEta } from '../../utils/date';
import { Colors, Typography, BorderRadius, Spacing, Shadow } from '../../theme';

/**
 * SubOrderCard — displayed in Order Confirmation and Order Tracking.
 * One card per sub-order (quick or scheduled).
 */
export default function SubOrderCard({ subOrder }) {
  const isQuick = subOrder.delivery_tier === 'quick';

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isQuick ? Colors.quickLight : Colors.scheduledLight }]}>
        <Text style={styles.headerEmoji}>{isQuick ? '⚡' : '📅'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: isQuick ? Colors.quickText : Colors.scheduledText }]}>
            {isQuick ? 'Quick Delivery' : 'Scheduled Delivery'}
          </Text>
          <Text style={[styles.headerSub, { color: isQuick ? Colors.quickText : Colors.scheduledText }]}>
            {subOrder.sub_order_number}
          </Text>
        </View>
        <Text style={[styles.statusPill, {
          backgroundColor: isQuick ? Colors.primary : Colors.secondary,
        }]}>
          {subOrder.status?.replace(/_/g, ' ')}
        </Text>
      </View>

      {/* Timeline */}
      <View style={styles.body}>
        <StatusTimeline currentStatus={subOrder.status} />

        {/* ETA */}
        <View style={styles.etaBox}>
          <Text style={styles.etaLabel}>
            {subOrder.status === 'delivered' ? 'Delivered at' : 'Expected delivery'}
          </Text>
          <Text style={styles.etaValue}>
            {subOrder.status === 'delivered'
              ? formatOrderTime(subOrder.delivered_at)
              : isQuick
                ? formatQuickEta(subOrder.created_at)
                : formatOrderTime(subOrder.estimated_delivery_at)}
          </Text>
        </View>

        {/* Items summary */}
        {subOrder.order_items?.length > 0 && (
          <View style={styles.itemsBox}>
            <Text style={styles.itemsTitle}>{subOrder.order_items.length} items · {formatPaise(subOrder.total_amount)}</Text>
            {subOrder.order_items.slice(0, 3).map(item => (
              <Text key={item.id} style={styles.itemRow} numberOfLines={1}>
                · {item.product_name} × {item.quantity}
              </Text>
            ))}
            {subOrder.order_items.length > 3 && (
              <Text style={styles.moreItems}>+{subOrder.order_items.length - 3} more items</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.xl,
    overflow:        'hidden',
    marginBottom:    Spacing[4],
    ...Shadow.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing[4], gap: Spacing[3] },
  headerEmoji: { fontSize: 24 },
  headerTitle: { fontFamily: Typography.fontFamily.bold,    fontSize: Typography.size.md },
  headerSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginTop: 1 },
  statusPill: {
    color: '#fff', fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.xs, textTransform: 'capitalize',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full,
  },

  body: { padding: Spacing[4] },

  etaBox: {
    backgroundColor: Colors.surface2, borderRadius: BorderRadius.lg,
    padding: Spacing[4], marginVertical: Spacing[3],
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  etaLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  etaValue: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text },

  itemsBox:   { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[3], gap: 4 },
  itemsTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.text, marginBottom: 4 },
  itemRow:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  moreItems:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textTertiary },
});
