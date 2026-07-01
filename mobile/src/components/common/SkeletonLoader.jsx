import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors, BorderRadius } from '../../theme';

function SkeletonBox({ width, height = 16, radius = BorderRadius.md, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: Colors.skeleton, opacity },
        style,
      ]}
    />
  );
}

// ── Prebuilt skeleton shapes ──────────────────────────────────

export function ProductCardSkeleton() {
  return (
    <View style={styles.productCard}>
      <SkeletonBox width="100%" height={130} radius={BorderRadius.lg} />
      <SkeletonBox width="60%" height={12} style={{ marginTop: 10 }} />
      <SkeletonBox width="40%" height={12} style={{ marginTop: 6 }} />
      <SkeletonBox width="50%" height={14} style={{ marginTop: 8 }} />
    </View>
  );
}

export function OrderCardSkeleton() {
  return (
    <View style={styles.orderCard}>
      <SkeletonBox width="50%" height={14} />
      <SkeletonBox width="30%" height={12} style={{ marginTop: 6 }} />
      <SkeletonBox width="40%" height={20} style={{ marginTop: 10, borderRadius: BorderRadius.full }} />
    </View>
  );
}

export function CategoryGridSkeleton({ count = 6 }) {
  return (
    <View style={styles.categoryGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.categoryItem}>
          <SkeletonBox width={56} height={56} radius={BorderRadius['2xl']} />
          <SkeletonBox width={50} height={10} style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={{ padding: 20, alignItems: 'center' }}>
      <SkeletonBox width={80} height={80} radius={BorderRadius.full} />
      <SkeletonBox width={120} height={16} style={{ marginTop: 16 }} />
      <SkeletonBox width={90}  height={12} style={{ marginTop: 8 }} />
    </View>
  );
}

export { SkeletonBox };
export default SkeletonBox;

const styles = StyleSheet.create({
  productCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: 12,
    marginBottom: 12,
  },
  orderCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: 16,
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
  },
  categoryItem: {
    width: '30%',
    alignItems: 'center',
    padding: 12,
  },
});
