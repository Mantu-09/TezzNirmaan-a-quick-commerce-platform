// ────────────────────────────────────────────────────────────
// ProductImage — P7-5: CDN Image Delivery
//
// Enhanced from P0-D:
//   • Resolves both legacy Supabase Storage URLs and new R2 CDN keys
//   • Blurhash placeholder for near-instant perceived load
//   • Memory + disk cache (expo-image handles CDN headers efficiently)
//   • All existing features preserved: skeleton shimmer, error state
//
// Usage:
//   <ProductImage uri={product.primary_image_url || product.images?.[0]} style={...} />
// ────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '../../theme';

// Shared placeholder asset — single require so Metro bundles it once
const PLACEHOLDER = require('../../../assets/placeholder.png');

// Generic product blurhash — low-saturation warm grey (matches most product photos)
// Generate custom per-image blurhash server-side for production, or use this as default
const DEFAULT_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

// CDN base URL from env (set EXPO_PUBLIC_R2_CDN_URL in .env)
const CDN_URL = process.env.EXPO_PUBLIC_R2_CDN_URL || '';

/**
 * Resolve a stored key/URL into an absolute URL for expo-image.
 * Handles:
 *   1. null/undefined → null (placeholder shown)
 *   2. Full URL (http/https) → used as-is (legacy Supabase Storage or already CDN)
 *   3. R2 key (e.g. "products/uuid.jpg") → CDN_URL/key
 */
function resolveImageUrl(uri) {
  if (!uri) return null;
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  if (CDN_URL) return `${CDN_URL}/${uri}`;
  return null; // CDN_URL not set — fall back to placeholder
}

/**
 * ProductImage
 *
 * @param {string|null}  uri          - Image URL or R2 key (can be null/undefined)
 * @param {object}       style        - Additional styles for the image (width/height)
 * @param {'cover'|'contain'} contentFit - expo-image contentFit (default: 'cover')
 * @param {number}       transition   - Fade-in duration in ms (default: 200)
 * @param {boolean}      showSkeleton - Show shimmer skeleton while loading (default: true)
 * @param {string}       blurhash     - Custom blurhash for this image (optional)
 */
export default function ProductImage({
  uri,
  style,
  contentFit   = 'cover',
  transition   = 200,
  showSkeleton = true,
  blurhash,
}) {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const resolvedUrl = resolveImageUrl(uri);
  const source = !errored && resolvedUrl ? { uri: resolvedUrl } : PLACEHOLDER;

  return (
    <View style={[styles.wrapper, style]}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        transition={transition}
        // P7-5: blurhash placeholder — shown instantly while network fetches CDN image
        placeholder={{ blurhash: blurhash || DEFAULT_BLURHASH }}
        onLoadStart={() => { setLoading(true); setErrored(false); }}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setErrored(true); }}
        // memory-disk cache — expo-image respects CDN Cache-Control headers
        cachePolicy="memory-disk"
        recyclingKey={resolvedUrl || 'placeholder'}
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
