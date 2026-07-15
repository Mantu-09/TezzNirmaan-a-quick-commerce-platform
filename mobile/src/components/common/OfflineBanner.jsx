// ────────────────────────────────────────────────────────────
// Offline Banner — B7
// Non-blocking banner shown at top of screen when device has
// no network connectivity. Uses NetInfo from
// @react-native-community/netinfo which ships with Expo.
// ────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Colors, Typography, Spacing } from '../../theme';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = !state.isConnected || !state.isInternetReachable;
      setIsOffline(prev => {
        if (prev !== offline) {
          // Animate in/out
          Animated.timing(opacity, {
            toValue:         offline ? 1 : 0,
            duration:        300,
            useNativeDriver: true,
          }).start();
        }
        return offline;
      });
    });

    return unsubscribe;
  }, []);

  // Render nothing when online (keeps the component tree clean)
  if (!isOffline) return null;

  return (
    <Animated.View style={[styles.banner, { opacity }]}>
      <Text style={styles.text}>📡 You're offline — some features may not work</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#1F2937',  // dark charcoal — visible on any bg
    paddingVertical:   Spacing[2],
    paddingHorizontal: Spacing[4],
    alignItems:        'center',
    // Sits at the very top, above SafeArea content
    zIndex: 9999,
  },
  text: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      '#F9FAFB',
    textAlign:  'center',
  },
});
