// ────────────────────────────────────────────────────────────
// ProductImage — B7
//
// Drop-in replacement for React Native's <Image> that uses
// expo-image for:
//   • Disk + memory caching (cache: 'force-cache')
//   • Progressive loading (blurhash placeholder while loading)
//   • AVIF/WebP auto-negotiation (smaller payload over LTE)
//   • Shared element transitions (iOS 14+)
//
// expo-image is already in package.json as ~1.12.15.
//
// Blurhash encoding happens on the server at product upload time.
// If the DB row has no blurhash, we fall back to a branded
// placeholder colour matching TezzNirmaan's palette.
// ────────────────────────────────────────────────────────────
import React from 'react';
import { Image as ExpoImage } from 'expo-image';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../../theme';

// Default blurhash: a warm orange-grey gradient matching the brand
// Generated from: https://blurha.sh using a greige swatch
const DEFAULT_BLURHASH = 'L8JmR~s:0000xu4.%gNG~q-;xuxu';

/**
 * ProductImage — optimised product photo component.
 *
 * Props:
 *   uri         {string}        Image URL (Supabase Storage or CDN)
 *   blurhash    {string}        Optional pre-computed blurhash from DB
 *   width       {number}        Container width (default 80)
 *   height      {number}        Container height (default 80)
 *   borderRadius {number}       Default: 8
 *   style       {object}        Additional View style overrides
 *   contentFit  {string}        'cover' | 'contain' | 'fill' — default 'cover'
 */
export default function ProductImage({
  uri,
  blurhash,
  width       = 80,
  height      = 80,
  borderRadius = 8,
  style,
  contentFit  = 'cover',
}) {
  const resolvedBlurhash = blurhash || DEFAULT_BLURHASH;

  return (
    <View style={[{ width, height, borderRadius, overflow: 'hidden' }, style]}>
      <ExpoImage
        source={uri ? { uri } : null}
        placeholder={{ blurhash: resolvedBlurhash }}
        contentFit={contentFit}
        // force-cache: serve from disk cache on repeat views.
        // Images only change when we re-upload → the URL changes (Supabase uses content-addressed names).
        cachePolicy="memory-disk"
        transition={{
          duration:   250,
          effect:     'cross-dissolve',  // Fade from blur to sharp
          timing:     'ease-in-out',
        }}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
        // Accessibility
        accessible={true}
        accessibilityRole="image"
      />
    </View>
  );
}
