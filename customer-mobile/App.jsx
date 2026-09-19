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
import { View, StyleSheet, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { NavigationContainerRef } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import useCartStore from './src/store/cartStore';
import useAuthStore from './src/store/authStore';
import { initSentry, wrap as sentryWrap } from './src/config/sentry'; // B7
import OfflineBanner from './src/components/common/OfflineBanner';    // B7
// NOTE: Push token + tap routing handled by PushRegistrar (usePushNotifications hook)
//       inside RootNavigator since R9/R10. OTA update handled by useOTAUpdate below.
import { useOTAUpdate }  from './src/hooks/useOTAUpdate';              // P4-1B
import {
  initFreshchat,
  identifyUser as freshchatIdentify,
} from './src/services/freshchat';                                     // P7-4

// B7: Initialise Sentry BEFORE any other code (catches startup crashes)
initSentry();

// Keep splash screen visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

// TanStack Query client — aggressive caching for product catalog, conservative for orders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            2 * 60 * 1000,  // 2 minutes — only refetches if data is older than this
      gcTime:               10 * 60 * 1000, // 10 minutes
      retry:                2,
      refetchOnWindowFocus: true,           // R14: focusManager wired to AppState — safe to enable
    },
    mutations: {
      retry: 0,
    },
  },
});

// ── R14: Wire TanStack focusManager to React Native AppState ──────────────
// On the web, TanStack Query listens to window "focus" events to refetch stale
// queries. In React Native there are no window focus events — the equivalent
// is AppState changing to "active". Without this wiring, queries NEVER refetch
// on foreground even when their staleTime has expired.
//
// This is the officially recommended approach from the TanStack Query docs for
// React Native. We set it up once at module load (outside any component) so it
// survives re-renders and only attaches one AppState listener.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => {
    // "active" = app came to foreground; "background"/"inactive" = backgrounded
    handleFocus(state === 'active');
  });
  return () => sub.remove(); // cleanup when QueryClient is destroyed (tests)
});

// navigationRef is a stable ref forwarded into NavigationContainer.
// We use it to navigate imperatively from the notification tap handler,
// which runs outside of any React component context.
export const navigationRef = React.createRef();

function App() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);
  const syncCart   = useCartStore(s => s.syncFromServer);
  const { isAuthenticated, token, user } = useAuthStore();

  // ── P7-4: Freshchat init (support chat) ───────────────────
  // Initialise once on mount — safe when env vars not set (silent no-op).
  useEffect(() => { initFreshchat(); }, []);

  // Identify the user whenever auth state changes
  useEffect(() => {
    if (isAuthenticated && user) freshchatIdentify(user);
  }, [isAuthenticated, user]);

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

  // ── R13: Push token registration + tap routing moved to PushRegistrar ──
  // (usePushNotifications hook inside RootNavigator handles both token PATCH
  //  and notification-tap deep-linking since R9/R10. Old P1-A handlers removed
  //  to prevent double-firing and wrong-endpoint registration.)

  // ── R14: Sync cart from server whenever app comes to foreground ──────────
  // focusManager is already wired to AppState at module level (above) so
  // TanStack queries refetch. Here we additionally sync the Zustand cart store
  // (which is not managed by TanStack) whenever the app becomes active.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        // App came to foreground — sync cart silently (only when authenticated)
        if (isAuthenticated) syncCart().catch(() => {});
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [isAuthenticated, syncCart]);

  // ── P4-1B: OTA update check ────────────────────────────────
  // Runs once per foreground session. Silent no-op in __DEV__.
  // Shows a non-blocking Alert if an update is available.
  useOTAUpdate();

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
