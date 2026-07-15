/**
 * StarRating — B4
 * Reusable 5-star rating component.
 *
 * Props:
 *   value       {number}   0–5 (supports half stars visually but snaps to integer on press)
 *   onChange    {fn}       called with integer 1–5; omit to make read-only
 *   size        {number}   star icon size (default 28)
 *   color       {string}   filled star color (default Colors.primary)
 *   emptyColor  {string}   empty star color (default Colors.border)
 *   label       {string}   optional label shown below stars
 *   style       {object}   container style override
 */
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../theme';

export default function StarRating({
  value       = 0,
  onChange,
  size        = 28,
  color       = Colors.primary,
  emptyColor  = Colors.border,
  label,
  style,
}) {
  const interactive = typeof onChange === 'function';

  return (
    <View style={[styles.container, style]}>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map(star => {
          const filled = star <= Math.round(value);
          const icon   = filled ? 'star' : 'star-outline';

          if (interactive) {
            return (
              <TouchableOpacity
                key={star}
                onPress={() => onChange(star)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={icon}
                  size={size}
                  color={filled ? color : emptyColor}
                  style={styles.star}
                />
              </TouchableOpacity>
            );
          }

          return (
            <Ionicons
              key={star}
              name={icon}
              size={size}
              color={filled ? color : emptyColor}
              style={styles.star}
            />
          );
        })}
      </View>

      {label ? (
        <Text style={[styles.label, { color: value > 0 ? color : Colors.textTertiary }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

// ── Compact read-only display: "4.3 ★ (128)" ─────────────────
export function RatingBadge({ rating, count, size = 13, style }) {
  if (!rating || !count) return null;
  return (
    <View style={[styles.badge, style]}>
      <Ionicons name="star" size={size} color="#F59E0B" />
      <Text style={[styles.badgeText, { fontSize: size }]}>
        {Number(rating).toFixed(1)}
      </Text>
      {count != null && (
        <Text style={[styles.badgeCount, { fontSize: size - 1 }]}>
          ({count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count})
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  stars: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  star: {
    marginHorizontal: 2,
  },
  label: {
    marginTop:  Spacing[1],
    fontSize:   Typography.size.sm,
    fontFamily: Typography.fontFamily.medium,
    textAlign:  'center',
  },
  badge: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            2,
  },
  badgeText: {
    fontFamily: Typography.fontFamily.semiBold,
    color:      Colors.text,
    marginLeft: 2,
  },
  badgeCount: {
    fontFamily: Typography.fontFamily.regular,
    color:      Colors.textSecondary,
    marginLeft: 1,
  },
});
