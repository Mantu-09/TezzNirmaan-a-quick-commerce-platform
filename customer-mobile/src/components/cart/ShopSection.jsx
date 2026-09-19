import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, BorderRadius, Spacing, Shadow } from '../../theme';
import TierSection from './TierSection';
import { formatPaise } from '../../utils/money';

// Delivery fee logic (mirrors backend constants)
const QUICK_FEE     = 4000;
const SCHEDULED_FEE = 10000;
const QUICK_FREE_ABOVE     = 50000;
const SCHEDULED_FREE_ABOVE = 200000;

function calcDeliveryFee(tier, subtotalPaise) {
  if (tier === 'quick')     return subtotalPaise >= QUICK_FREE_ABOVE     ? 0 : QUICK_FEE;
  if (tier === 'scheduled') return subtotalPaise >= SCHEDULED_FREE_ABOVE ? 0 : SCHEDULED_FEE;
  return 0;
}

/**
 * ShopSection — P4-3B: Multi-shop cart
 *
 * Renders a collapsible section per shop in the cart.
 * Contains existing TierSection components for quick/scheduled items.
 *
 * Props:
 *   shopId         — string
 *   shopName       — string
 *   quickItems     — array of cart items with deliveryTier === 'quick'
 *   scheduledItems — array of cart items with deliveryTier === 'scheduled'
 *   isFirst        — boolean (removes top margin)
 */
export default function ShopSection({
  shopId,
  shopName,
  quickItems     = [],
  scheduledItems = [],
  isFirst        = false,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const quickSubtotal     = quickItems.reduce((s, i)     => s + i.unitPricePaise * i.quantity, 0);
  const scheduledSubtotal = scheduledItems.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
  const quickFee          = quickItems.length     ? calcDeliveryFee('quick',     quickSubtotal)     : 0;
  const scheduledFee      = scheduledItems.length ? calcDeliveryFee('scheduled', scheduledSubtotal) : 0;
  const shopTotal         = quickSubtotal + scheduledSubtotal + quickFee + scheduledFee;

  const totalItems = quickItems.length + scheduledItems.length;
  const deliveryCount = (quickItems.length > 0 ? 1 : 0) + (scheduledItems.length > 0 ? 1 : 0);

  return (
    <View style={[styles.container, !isFirst && styles.containerMargin]}>
      {/* Shop header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setCollapsed(c => !c)}
        activeOpacity={0.7}
      >
        <View style={styles.shopIcon}>
          <Text style={styles.shopEmoji}>🏪</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.shopName} numberOfLines={1}>{shopName}</Text>
          <Text style={styles.shopMeta}>
            {totalItems} item{totalItems !== 1 ? 's' : ''} · {deliveryCount} deliver{deliveryCount !== 1 ? 'ies' : 'y'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.shopSubtotal}>{formatPaise(shopTotal)}</Text>
          <Ionicons
            name={collapsed ? 'chevron-down-outline' : 'chevron-up-outline'}
            size={16}
            color={Colors.textSecondary}
            style={styles.chevron}
          />
        </View>
      </TouchableOpacity>

      {/* Items — hidden when collapsed */}
      {!collapsed && (
        <View style={styles.tierContainer}>
          {quickItems.length > 0 && (
            <TierSection
              tier="quick"
              items={quickItems}
              subtotalPaise={quickSubtotal}
              deliveryFeePaise={quickFee}
            />
          )}
          {scheduledItems.length > 0 && (
            <TierSection
              tier="scheduled"
              items={scheduledItems}
              subtotalPaise={scheduledSubtotal}
              deliveryFeePaise={scheduledFee}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.xl,
    overflow:        'hidden',
    ...Shadow.sm,
  },
  containerMargin: { marginTop: Spacing[3] },

  header: {
    flexDirection:  'row',
    alignItems:     'center',
    padding:        Spacing[4],
    gap:            Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  shopIcon: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight || '#FFF5EB',
    alignItems: 'center', justifyContent: 'center',
  },
  shopEmoji: { fontSize: 18 },

  headerText: { flex: 1 },
  shopName:   {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.base,
    color:      Colors.text,
    marginBottom: 2,
  },
  shopMeta: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
  },

  headerRight: { alignItems: 'flex-end', gap: 2 },
  shopSubtotal: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.md,
    color:      Colors.text,
  },
  chevron: { marginTop: 2 },

  tierContainer: {
    // TierSection already has its own marginBottom, so no extra padding
  },
});
