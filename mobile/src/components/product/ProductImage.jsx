// ────────────────────────────────────────────────────────────
// ProductImage — P0-D (TD-05)
//
// A consistent image component for all product images across
// the app. Wraps expo-image with:
//   • Automatic placeholder fallback
//   • Skeleton shimmer while loading
//   • Graceful error state (broken icon)
//   • Consistent contentFit and transition defaults
//
// Usage:
//   <ProductImage uri={product.images?.[0]} style={styles.img} />
// ────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '../../theme';

// Shared placeholder asset — single require so Metro bundles it once
const PLACEHOLDER = require('../../../assets/placeholder.png');

/**
 * ProductImage
 *
 * @param {string|null}  uri          - Remote image URL (can be null/undefined)
 * @param {object}       style        - Additional styles for the image (width/height)
 * @param {'cover'|'contain'} contentFit - expo-image contentFit (default: 'cover')
 * @param {number}       transition   - Fade-in duration in ms (default: 200)
 * @param {boolean}      showSkeleton - Show shimmer skeleton while loading (default: true)
 */
export default function ProductImage({
  uri,
  style,
  contentFit   = 'cover',
  transition   = 200,
  showSkeleton = true,
}) {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const source = !errored && uri ? { uri } : PLACEHOLDER;

  return (
    <View style={[styles.wrapper, style]}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        transition={transition}
        onLoadStart={() => { setLoading(true); setErrored(false); }}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setErrored(true); }}
        // Prioritise cache — most product images are repeated across screens
        cachePolicy="memory-disk"
        recyclingKey={uri || 'placeholder'}
      />

      {/* Broken image indicator — shown if remote URL fails */}
      {errored && (
        <View style={styles.errorOverlay} pointerEvents="none">
          <Ionicons name="image-outline" size={28} color={Colors.textTertiary} />
        </View>
      )}

      {/* Loading skeleton — shimmer rectangle while image downloads */}
      {showSkeleton && loading && !errored && (
        <View style={styles.skeleton} pointerEvents="none">
          <SkeletonShimmer />
        </View>
      )}
    </View>
  );
}

// ── Skeleton shimmer ─────────────────────────────────────────

function SkeletonShimmer() {
  const anim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.85] });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.shimmer, { opacity }]}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'hidden',
    backgroundColor: Colors.surface2,
  },
  skeleton: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface2,
  },
  shimmer: {
    backgroundColor: Colors.border,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
