import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '../../theme';
import CartItem from './CartItem';
import { formatPaise } from '../../utils/money';

/**
 * Tier section — the core of the mixed-tier cart UX.
 * Shows a clearly labeled section for each delivery tier,
 * with items, subtotal, and delivery fee.
 */
export default function TierSection({ tier, items, subtotalPaise, deliveryFeePaise }) {
  const isQuick = tier === 'quick';

  const sectionColor = isQuick ? Colors.primary : Colors.secondary;
  const bgColor      = isQuick ? Colors.quickLight : Colors.scheduledLight;
  const totalPaise   = subtotalPaise + deliveryFeePaise;

  return (
    <View style={styles.section}>
      {/* Section header */}
      <View style={[styles.header, { backgroundColor: bgColor }]}>
        <Text style={styles.headerEmoji}>{isQuick ? '⚡' : '📅'}</Text>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: sectionColor }]}>
            {isQuick ? 'Quick Delivery' : 'Scheduled Delivery'}
          </Text>
          <Text style={[styles.headerSub, { color: sectionColor }]}>
            {isQuick ? '60–90 minutes' : 'Choose delivery slot'}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: sectionColor }]}>
          <Text style={styles.countText}>{items.length} {items.length === 1 ? 'item' : 'items'}</Text>
        </View>
      </View>

      {/* Items */}
      <View style={styles.items}>
        {items.map((item, idx) => (
          <View key={item.productId}>
            <CartItem item={item} />
            {idx < items.length - 1 && <View style={styles.divider} />}
          </View>
        ))}
      </View>

      {/* Subtotal for this tier */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Items subtotal</Text>
          <Text style={styles.summaryValue}>{formatPaise(subtotalPaise)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Delivery fee</Text>
          <Text style={[styles.summaryValue, deliveryFeePaise === 0 && styles.free]}>
            {deliveryFeePaise === 0 ? 'FREE' : formatPaise(deliveryFeePaise)}
          </Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>{isQuick ? 'Quick' : 'Scheduled'} total</Text>
          <Text style={styles.totalValue}>{formatPaise(totalPaise)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.xl,
    overflow:        'hidden',
    marginBottom:    Spacing[4],
  },
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    padding:         Spacing[4],
    gap:             Spacing[3],
  },
  headerEmoji: { fontSize: 22 },
  headerText:  { flex: 1 },
  headerTitle: { fontFamily: Typography.fontFamily.bold,    fontSize: Typography.size.md },
  headerSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, marginTop: 2, opacity: 0.8 },
  countBadge: {
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[1],
    borderRadius: BorderRadius.full,
  },
  countText: { color: '#fff', fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs },

  items:   { paddingHorizontal: Spacing[4] },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 2 },

  summary:    { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing[4], gap: Spacing[2] },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  summaryValue: { fontFamily: Typography.fontFamily.medium,  fontSize: Typography.size.sm, color: Colors.text },
  free:         { color: Colors.success, fontFamily: Typography.fontFamily.semiBold },

  totalRow:  { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[2], marginTop: Spacing[1] },
  totalLabel: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text },
  totalValue: { fontFamily: Typography.fontFamily.bold,    fontSize: Typography.size.md,   color: Colors.text },
});
