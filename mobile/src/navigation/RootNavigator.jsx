/**
 * RootNavigator — B2 update
 *
 * Routing logic:
 *   Not authenticated        → AuthNavigator (phone + OTP login)
 *   shop_owner + !setup_complete → OnboardingNavigator (first-login wizard)
 *   Everything else          → TabNavigator (main app)
 */

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import useAuthStore from '../store/authStore';
import { Colors } from '../theme';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import ShopOnboardingScreen from '../screens/onboarding/ShopOnboardingScreen';

const Stack = createNativeStackNavigator();

// ── Onboarding navigator (modal-style, no back to auth)
function OnboardingNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="ShopOnboarding" component={ShopOnboardingScreen} />
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

export default function RootNavigator() {
  const { isAuthenticated, isLoading, user, restoreSession } = useAuthStore();

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

  // Determine which navigator to show
  const needsOnboarding =
    isAuthenticated &&
    user?.role === 'shop_owner' &&
    user?.setup_complete === false;

  return (
    <NavigationContainer>
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : needsOnboarding ? (
        <OnboardingNavigator />
      ) : (
        <MainNavigator />
      )}
    </NavigationContainer>
  );
}
