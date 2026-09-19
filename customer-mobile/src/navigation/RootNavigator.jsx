/**
 * RootNavigator — Guest Browsing Update (Blinkit-style)
 *
 * ROUTING LOGIC:
 *   Guest + no city selected     → GuestCityGate (pick city to see products)
 *   Guest + city selected        → MainNavigator (browse freely, auth at checkout)
 *   Authenticated + shop_owner + !setup_complete → OnboardingNavigator
 *   Authenticated + no city      → PostAuthCityGate
 *   Authenticated + shop_owner   → ShopOwnerMainNavigator
 *   Authenticated (customer)     → MainNavigator
 *
 * Key change: Unauthenticated users now reach the full tab app and can
 * browse, search, and add items to cart without logging in.
 * Auth is triggered ONLY when they tap "Login to Proceed" in CartScreen
 * via the AuthBottomSheet modal.
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native'; // R10: push tap handler
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications'; // R10: notification tap listener
import useAuthStore from '../store/authStore';
import useCityStore from '../store/cityStore';
import { Colors } from '../theme';
import usePushNotifications from '../hooks/usePushNotifications'; // R9
import TabNavigator          from './TabNavigator';
import ShopOwnerNavigator    from './ShopOwnerNavigator';
import RiderNavigator        from './RiderNavigator';
import ShopOnboardingScreen  from '../screens/onboarding/ShopOnboardingScreen';
import RiderOnboardingScreen from '../screens/onboarding/RiderOnboardingScreen'; // Phase G
import CitySelectScreen      from '../screens/city/CitySelectScreen';

const Stack = createNativeStackNavigator();

// ── Deep-link config ──────────────────────────────────────────
const linking = {
  prefixes: ['tezznirmaan://', 'https://tezznirmaan.in'],
  config: {
    screens: {
      Main: {
        screens: {
          Orders: {
            screens: {
              OrderTracking:     'order/:orderId',
              OrderHistory:      'orders',
              OrderConfirmation: 'order-confirmation/:orderId',
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

function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="ShopOnboarding" component={ShopOnboardingScreen} />
    </Stack.Navigator>
  );
}

// City gate for authenticated users who haven't selected a city
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

// City gate for guests — they also need a city to see relevant products
function GuestCityGate() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="GuestCitySelect"
        component={CitySelectScreen}
        initialParams={{ postAuth: false }}
      />
    </Stack.Navigator>
  );
}

function ShopOwnerMainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ShopOwnerMain" component={ShopOwnerNavigator} />
    </Stack.Navigator>
  );
}

function RiderMainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RiderMain" component={RiderNavigator} />
    </Stack.Navigator>
  );
}

// Phase G: KYC gate — shown to riders who haven't submitted their KYC yet
function RiderOnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RiderKYC" component={RiderOnboardingScreen} />
    </Stack.Navigator>
  );
}

// Main app — wraps TabNavigator so onboarding can navigate.reset to it
function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={TabNavigator} />
    </Stack.Navigator>
  );
}

/**
 * PushRegistrar — registers Expo push token AND handles notification taps.
 * Must be inside NavigationContainer so useNavigation works.
 */
function PushRegistrar() {
  usePushNotifications(); // R9: request permission + register token

  // R10: Handle notification tap — deep-link to the relevant screen
  const navigation = useNavigation();

  useEffect(() => {
    // Handles tap on a notification (from background or killed state)
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data || {};
      const { type, orderId, subOrderId } = data;

      try {
        if (type === 'new_assignment' && subOrderId) {
          // Rider: tapped a new delivery assignment
          navigation.navigate('RiderDelivery', { assignmentId: subOrderId });
        } else if (orderId) {
          // Customer: any order-related notification → order tracking
          navigation.navigate('Orders', {
            screen: 'OrderTracking',
            params: { orderId },
          });
        } else {
          // Fallback: open notifications tab
          navigation.navigate('NotificationsTab');
        }
      } catch {
        // Navigation may not be ready on cold-start — fall back silently
        navigation.navigate('NotificationsTab');
      }
    });

    return () => sub.remove();
  }, [navigation]);

  return null;
}

/**
 * @param {React.RefObject} navigationRef  - forwarded from App.jsx
 */
export default function RootNavigator({ navigationRef }) {
  const { isAuthenticated, isLoading, user, restoreSession } = useAuthStore();
  const { selectedCity } = useCityStore();

  useEffect(() => {
    restoreSession();
  }, []);

  // NOTE: useOTAUpdate() is called from App.jsx root — no duplicate needed here.

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Guests need a city first so they see relevant nearby products
  if (!isAuthenticated && !selectedCity) {
    return (
      <NavigationContainer ref={navigationRef} linking={linking}>
        <GuestCityGate />
      </NavigationContainer>
    );
  }

  // Authenticated routing
  const needsOnboarding = isAuthenticated && user?.role === 'shop_owner' && user?.setup_complete === false;
  const isRider         = isAuthenticated && user?.role === 'rider';
  const needsRiderKyc   = isRider && !user?.kyc_submitted && !user?.kyc_complete; // Phase G
  const isShopOwner     = isAuthenticated && (user?.role === 'shop_owner' || user?.role === 'shop_staff') && user?.setup_complete !== false;
  const needsCitySelection = isAuthenticated && !selectedCity;

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      {/* R9: Register Expo push token once when authenticated */}
      {isAuthenticated && <PushRegistrar />}
      {needsOnboarding ? (
        <OnboardingNavigator />
      ) : needsRiderKyc ? (
        <RiderOnboardingNavigator />
      ) : needsCitySelection ? (
        <PostAuthCityGate />
      ) : isRider ? (
        <RiderMainNavigator />
      ) : isShopOwner ? (
        <ShopOwnerMainNavigator />
      ) : (
        // Both authenticated customers AND guests land here
        <MainNavigator />
      )}
    </NavigationContainer>
  );
}
