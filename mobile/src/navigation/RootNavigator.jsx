/**
 * RootNavigator — P1-A update
 *
 * P1-A additions:
 *   • Accepts navigationRef prop from App.jsx and forwards it to
 *     NavigationContainer so imperative navigation from notification
 *     tap handlers works correctly.
 *   • Adds `linking` config for deep links (tezznirmaan://order/:id)
 *     so notification taps open the correct screen even when the app
 *     was killed.
 *
 * Routing logic (unchanged from B2):
 *   Not authenticated        → AuthNavigator (phone + OTP login)
 *   shop_owner + !setup_complete → OnboardingNavigator (first-login wizard)
 *   Everything else          → TabNavigator (main app)
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import useAuthStore from '../store/authStore';
import useCityStore from '../store/cityStore'; // P4-4A
import { Colors } from '../theme';
import AuthNavigator     from './AuthNavigator';
import TabNavigator      from './TabNavigator';
import ShopOwnerNavigator from './ShopOwnerNavigator'; // P8-4
import ShopOnboardingScreen from '../screens/onboarding/ShopOnboardingScreen';
import CitySelectScreen  from '../screens/city/CitySelectScreen'; // P4-4A

const Stack = createNativeStackNavigator();

// ── Deep-link config (P1-A) ──────────────────────────────────
// Matches both the custom scheme (tezznirmaan://) and the web URL
// (https://tezznirmaan.in) so universal links work on iOS.
//
// The screen names used here MUST match those registered in TabNavigator/
// the stack navigators. OrderTracking lives inside the Orders stack.
const linking = {
  prefixes: ['tezznirmaan://', 'https://tezznirmaan.in'],
  config: {
    screens: {
      // Top-level screen groups (must match what RootNavigator renders)
      Main: {
        screens: {
          // Map deep-link paths to screens inside the tab stacks.
          // TabNavigator renders nested stacks, so we nest here too.
          Orders: {
            screens: {
              OrderTracking:    'order/:orderId',
              OrderHistory:     'orders',
              OrderConfirmation:'order-confirmation/:orderId',
            },
          },
          Home: {
            screens: {
              ProductDetail: 'product/:productId',
            },
          },
          Notifications: 'notifications',
        },
      },
    },
  },
};

// ── Onboarding navigator (modal-style, no back to auth)
function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="ShopOnboarding" component={ShopOnboardingScreen} />
    </Stack.Navigator>
  );
}

// ── Post-auth city gate: authenticated users who haven't selected
//    a city yet (e.g. existing users after the P4-4A update) see
//    CitySelectScreen with postAuth=true so they can go back.
function PostAuthCityGate() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="CitySelectGate"
        component={CitySelectScreen}
        initialParams={{ postAuth: true }}
      />
    </Stack.Navigator>
  );
}

// ── Shop-owner navigator wrapper (named screen for reset) ─────
function ShopOwnerMainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ShopOwnerMain" component={ShopOwnerNavigator} />
    </Stack.Navigator>
  );
}

// ── Main app navigator (wraps TabNavigator in a named screen so onboarding
//    can navigate.reset to it via { name: 'Main' })
function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={TabNavigator} />
    </Stack.Navigator>
  );
}

/**
 * @param {React.RefObject} navigationRef  - forwarded from App.jsx for
 *   imperative navigation from push notification tap handlers.
 */
export default function RootNavigator({ navigationRef }) {
  const { isAuthenticated, isLoading, user, restoreSession } = useAuthStore();
  const { selectedCity } = useCityStore(); // P4-4A

  useEffect(() => {
    restoreSession();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const needsOnboarding =
    isAuthenticated &&
    user?.role === 'shop_owner' &&
    user?.setup_complete === false;

  // P8-4: Authenticated shop owners get the dedicated shop management navigator
  const isShopOwner = isAuthenticated && (
    user?.role === 'shop_owner' ||
    user?.role === 'shop_staff'
  ) && user?.setup_complete !== false; // don't gate-keep if onboarding incomplete

  // P4-4A: authenticated users who haven't selected a city yet
  // (e.g. users who upgraded from a version before P4-4A)
  const needsCitySelection = isAuthenticated && !selectedCity;

  return (
    <NavigationContainer
      ref={navigationRef}   // P1-A: enables navigationRef.current.navigate(...)
      linking={linking}     // P1-A: deep-link config for notification taps
    >
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : needsOnboarding ? (
        <OnboardingNavigator />
      ) : needsCitySelection ? (
        <PostAuthCityGate />  // P4-4A: prompt city selection for existing users
      ) : isShopOwner ? (
        <ShopOwnerMainNavigator />  // P8-4: dedicated shop management UI
      ) : (
        <MainNavigator />
      )}
    </NavigationContainer>
  );
}
