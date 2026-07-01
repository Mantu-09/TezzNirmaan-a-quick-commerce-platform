import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '../../theme';

/**
 * Delivery tier badge — displayed on every product card and detail screen.
 * This is always visible to set customer expectations before they add to cart.
 *
 * @param {'quick'|'scheduled'} tier
 * @param {boolean} compact - smaller variant for product cards
 */
export default function TierBadge({ tier, compact = false }) {
  const isQuick = tier === 'quick';
  return (
    <View style={[
      styles.badge,
      compact ? styles.compact : styles.full,
      { backgroundColor: isQuick ? Colors.quickLight : Colors.scheduledLight },
    ]}>
      <Text style={[styles.emoji, compact && styles.emojiCompact]}>
        {isQuick ? '⚡' : '📅'}
      </Text>
      {!compact && (
        <Text style={[styles.label, { color: isQuick ? Colors.quickText : Colors.scheduledText }]}>
          {isQuick ? '60–90 min' : 'Scheduled'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   BorderRadius.full,
  },
  compact: {
    paddingHorizontal: Spacing[2],
    paddingVertical:   2,
  },
  full: {
    paddingHorizontal: Spacing[3],
    paddingVertical:   Spacing[1],
    gap:               4,
  },
  emoji:        { fontSize: 11 },
  emojiCompact: { fontSize: 10 },
  label: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.xs,
  },
});
