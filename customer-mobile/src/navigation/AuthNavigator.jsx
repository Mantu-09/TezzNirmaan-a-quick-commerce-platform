import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CitySelectScreen from '../screens/city/CitySelectScreen'; // P4-4A
import PhoneScreen from '../screens/auth/PhoneScreen';
import OtpScreen from '../screens/auth/OtpScreen';

const Stack = createNativeStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CitySelect" component={CitySelectScreen} />
      <Stack.Screen name="Phone"      component={PhoneScreen}      />
      <Stack.Screen name="Otp"        component={OtpScreen}        />
    </Stack.Navigator>
  );
}
