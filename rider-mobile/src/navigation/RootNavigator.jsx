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
 * ...
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import useAuthStore from '../store/authStore';
import { Colors } from '../theme';
import usePushNotifications from '../hooks/usePushNotifications';
import RiderNavigator from './RiderNavigator';
import RiderOnboardingScreen from '../screens/onboarding/RiderOnboardingScreen';
import AuthNavigator from './AuthNavigator';

const Stack = createNativeStackNavigator();

// Deep-link config for Rider app
const linking = {
  prefixes: ['tezznirmaan-rider://'],
  config: {
    screens: {
      RiderMain: {
        screens: {
          Deliveries: 'deliveries',
          Home: 'home',
        },
      },
    },
  },
};

function RiderMainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RiderMain" component={RiderNavigator} />
    </Stack.Navigator>
  );
}

// KYC gate
function RiderOnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RiderKYC" component={RiderOnboardingScreen} />
    </Stack.Navigator>
  );
}

function PushRegistrar() {
  usePushNotifications();

  const navigation = useNavigation();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data || {};
      const { type, subOrderId } = data;

      try {
        if (type === 'new_assignment' && subOrderId) {
          navigation.navigate('RiderMain', {
             screen: 'Deliveries',
             params: { screen: 'RiderDelivery', params: { assignmentId: subOrderId } }
          });
        }
      } catch {
        // Fallback silently
      }
    });

    return () => sub.remove();
  }, [navigation]);

  return null;
}

export default function RootNavigator({ navigationRef }) {
  const { isAuthenticated, isLoading, user, restoreSession, clearSession } = useAuthStore();

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

  if (isAuthenticated && user?.role !== 'rider') {
    // Prevent non-riders from logging into the rider app
    clearSession();
  }

  const needsRiderKyc = isAuthenticated && user?.role === 'rider' && !user?.kyc_submitted && !user?.kyc_complete;

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      {isAuthenticated && <PushRegistrar />}
      
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : needsRiderKyc ? (
        <RiderOnboardingNavigator />
      ) : (
        <RiderMainNavigator />
      )}
    </NavigationContainer>
  );
}
