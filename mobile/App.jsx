import 'react-native-gesture-handler';
// ────────────────────────────────────────────────────────────
// App.jsx — P1-A: Push Notifications added
//
// B7 additions (existing):
//   • Sentry crash reporting
//   • OfflineBanner
//   • Sentry.wrap() around root component
//
// P1-A additions:
//   • initPushNotifications() on every authenticated launch
//   • Notification tap deep-link handler → OrderTracking
//   • navigationRef forwarded to RootNavigator for tap routing
// ────────────────────────────────────────────────────────────
import React, { useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { NavigationContainerRef } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import useCartStore from './src/store/cartStore';
import useAuthStore from './src/store/authStore';
import { initSentry, wrap as sentryWrap } from './src/config/sentry'; // B7
import OfflineBanner from './src/components/common/OfflineBanner';    // B7
import {
  initPushNotifications,
  addNotificationTapListener,
  clearBadge,
} from './src/services/notifications';                                // P1-A
import { savePushToken } from './src/api/auth';                       // P1-A
import { useOTAUpdate }  from './src/hooks/useOTAUpdate';              // P4-1B

// B7: Initialise Sentry BEFORE any other code (catches startup crashes)
initSentry();

// Keep splash screen visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

// TanStack Query client — aggressive caching for product catalog, conservative for orders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            2 * 60 * 1000,  // 2 minutes
      gcTime:               10 * 60 * 1000, // 10 minutes
      retry:                2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

// navigationRef is a stable ref forwarded into NavigationContainer.
// We use it to navigate imperatively from the notification tap handler,
// which runs outside of any React component context.
export const navigationRef = React.createRef();

function App() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);
  const syncCart   = useCartStore(s => s.syncFromServer);
  const { isAuthenticated, token } = useAuthStore();

  // ── Font loading ───────────────────────────────────────────
  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          'Inter-Regular':  require('./assets/fonts/Inter-Regular.ttf'),
          'Inter-Medium':   require('./assets/fonts/Inter-Medium.ttf'),
          'Inter-SemiBold': require('./assets/fonts/Inter-SemiBold.ttf'),
          'Inter-Bold':     require('./assets/fonts/Inter-Bold.ttf'),
        });
      } catch (e) {
        console.warn('[Fonts] Failed to load custom fonts, using system fallback:', e.message);
      } finally {
        setFontsLoaded(true);
      }
    }
    prepare();
  }, []);

  // ── P1-A: Push notification initialisation ─────────────────
  // Run whenever auth state changes (login/logout).
  // savePushToken() needs an authenticated API client, so we
  // only register when the user is logged in.
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    // Create a bound save function that uses the current auth token
    const save = async (expoPushToken) => {
      try {
        await savePushToken(expoPushToken);
      } catch (err) {
        // Non-fatal — the user can still use the app without push
        console.warn('[Push] Token upload failed (non-fatal):', err.message);
      }
    };

    // initPushNotifications never throws — it's fully wrapped
    initPushNotifications(save).then(token => {
      if (token) {
        console.log('[Push] Registered:', token);
      }
    });
  }, [isAuthenticated, token]);

  // ── P4-1B: OTA update check ────────────────────────────────
  // Runs once per foreground session. Silent no-op in __DEV__.
  // Shows a non-blocking Alert if an update is available.
  useOTAUpdate();

  // ── P1-A: Notification tap handler ────────────────────────
  // Handles taps on push notifications when the app is:
  //   • In the background (backgrounded)
  //   • Completely closed (killed) — notification launches the app
  //
  // We use a ref to hold the subscription so we can clean it up.
  const tapSubscriptionRef = useRef(null);

  useEffect(() => {
    tapSubscriptionRef.current = addNotificationTapListener(({ orderId, type }) => {
      // Clear badge on any notification interaction
      clearBadge();

      if (!orderId) return;

      // Navigate to the correct screen. navigationRef.current may be null
      // during the very brief window before NavigationContainer mounts —
      // that's fine because the deep link will still resolve via linking config.
      if (navigationRef.current?.isReady()) {
        if (type === 'new_order' || type === 'new_assignment') {
          // Shop owner / rider gets a different screen
          navigationRef.current.navigate('OrderTracking', { orderId });
        } else {
          // Customer → OrderTracking with real-time status
          navigationRef.current.navigate('OrderTracking', { orderId });
        }
      }
    });

    return () => {
      tapSubscriptionRef.current?.remove();
    };
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
      // Sync cart from server after splash (non-blocking)
      syncCart().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/* B7: Offline banner renders above everything, including SafeArea */}
          <OfflineBanner />
          <View style={styles.root} onLayout={onLayoutRootView}>
            <StatusBar style="dark" />
            {/* Pass navigationRef so RootNavigator can wire it to NavigationContainer */}
            <RootNavigator navigationRef={navigationRef} />
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

// B7: Wrap with Sentry for automatic JS crash boundary + session tracking
export default sentryWrap(App);
