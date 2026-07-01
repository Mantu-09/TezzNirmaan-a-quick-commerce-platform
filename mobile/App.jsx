import 'react-native-gesture-handler';
import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import RootNavigator from './src/navigation/RootNavigator';
import useCartStore from './src/store/cartStore';

// Keep splash screen visible until fonts are loaded
SplashScreen.preventAutoHideAsync();

// TanStack Query client — aggressive caching for product catalog, conservative for orders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          2 * 60 * 1000,  // 2 minutes
      gcTime:             10 * 60 * 1000, // 10 minutes
      retry:              2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default function App() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);
  const syncCart = useCartStore(s => s.syncFromServer);

  useEffect(() => {
    async function prepare() {
      try {
        // Load Inter font family
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
          <View style={styles.root} onLayout={onLayoutRootView}>
            <StatusBar style="dark" />
            <RootNavigator />
          </View>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
