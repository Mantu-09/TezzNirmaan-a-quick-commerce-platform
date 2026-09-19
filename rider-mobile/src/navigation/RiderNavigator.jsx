// ────────────────────────────────────────────────────────────
// RiderNavigator — Phase B
//
// Role-gated bottom-tab navigator shown to riders.
// Rendered by RootNavigator when user.role === 'rider'.
//
// Tabs:
//   🏠 Home       — RiderHomeScreen (self-contained)
//   📦 Deliveries — RiderDeliveryScreen → RiderActiveDeliveryScreen → RiderRouteScreen
//   💰 Earnings   — RiderEarningsScreen (inline) → RiderEarningsHistoryScreen
//   👤 Account    — ProfileScreen → RiderBankAccountScreen
//
// Badge on Deliveries tab: polls GET /rider/deliveries/offered
// every 10 seconds while the rider is online.
// ────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView }              from 'react-native-safe-area-context';
import { createBottomTabNavigator }  from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons }                  from '@expo/vector-icons';
import { useQuery }                  from '@tanstack/react-query';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../theme';
import useAuthStore                  from '../store/authStore';
import { client }                    from '../api/client';

// ── Screens ───────────────────────────────────────────────────
import RiderHomeScreen            from '../screens/rider/RiderHomeScreen';
import RiderDeliveryScreen        from '../screens/rider/RiderDeliveryScreen';
import RiderEarningsHistoryScreen from '../screens/rider/RiderEarningsHistoryScreen';
import ProfileScreen              from '../screens/profile/ProfileScreen';

// Optional screens — gracefully degrade if not yet built
let RiderActiveDeliveryScreen;
try {
  RiderActiveDeliveryScreen = require('../screens/rider/RiderActiveDeliveryScreen').default;
} catch (_) {
  RiderActiveDeliveryScreen = function RiderActiveDeliveryPlaceholder() {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <Text style={{ fontSize: 36, marginBottom: 12 }}>🚴</Text>
        <Text style={{ fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.text }}>Active Delivery</Text>
        <Text style={{ fontFamily: Typography.fontFamily.regular, fontSize: 14, color: Colors.textSecondary, marginTop: 6 }}>Coming soon</Text>
      </View>
    );
  };
}

let RiderRouteScreen;
try {
  RiderRouteScreen = require('../screens/rider/RiderRouteScreen').default;
} catch (_) {
  RiderRouteScreen = function RiderRoutePlaceholder() {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <Text style={{ fontSize: 36, marginBottom: 12 }}>🗺️</Text>
        <Text style={{ fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.text }}>Route View</Text>
        <Text style={{ fontFamily: Typography.fontFamily.regular, fontSize: 14, color: Colors.textSecondary, marginTop: 6 }}>Coming soon</Text>
      </View>
    );
  };
}

let RiderBankAccountScreen;
try {
  RiderBankAccountScreen = require('../screens/rider/RiderBankAccountScreen').default;
} catch (_) {
  RiderBankAccountScreen = function RiderBankPlaceholder() {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <Text style={{ fontSize: 36, marginBottom: 12 }}>🏦</Text>
        <Text style={{ fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.text }}>Bank Account</Text>
        <Text style={{ fontFamily: Typography.fontFamily.regular, fontSize: 14, color: Colors.textSecondary, marginTop: 6 }}>Coming soon</Text>
      </View>
    );
  };
}

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const defaultStackOptions = {
  headerStyle:         { backgroundColor: Colors.surface },
  headerTintColor:     Colors.text,
  headerTitleStyle:    { fontFamily: Typography.fontFamily.semiBold, fontSize: 16 },
  headerShadowVisible: false,
};

// ── API helpers ───────────────────────────────────────────────
async function fetchEarningsSummary() {
  const { data } = await client.get('/rider/earnings-summary');
  return data?.data || { today: 0, week: 0, month: 0 };
}

async function fetchOfferedDeliveries() {
  const { data } = await client.get('/rider/deliveries/offered');
  return data?.data?.offers || [];
}

// ── Deliveries Stack ──────────────────────────────────────────
function RiderDeliveriesStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen
        name="RiderDeliveryList"
        component={RiderDeliveryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RiderActiveDelivery"
        component={RiderActiveDeliveryScreen}
        options={{ title: 'Active Delivery' }}
      />
      <Stack.Screen
        name="RiderRoute"
        component={RiderRouteScreen}
        options={{ title: 'Route' }}
      />
    </Stack.Navigator>
  );
}

// ── Payout placeholder ────────────────────────────────────────
function RiderPayoutPlaceholder() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: Spacing[6] }}>
      <Text style={{ fontSize: 48, marginBottom: 16 }}>💸</Text>
      <Text style={{ fontFamily: Typography.fontFamily.bold, fontSize: 20, color: Colors.text, marginBottom: 8, textAlign: 'center' }}>
        Payout Request
      </Text>
      <Text style={{ fontFamily: Typography.fontFamily.regular, fontSize: 14, color: Colors.textSecondary, textAlign: 'center' }}>
        Payout requests will be available soon. Your earnings are safe and will be transferred weekly.
      </Text>
    </View>
  );
}

// ── Earnings Summary Screen (inline) ─────────────────────────
function RiderEarningsSummaryScreen({ navigation }) {
  const { data: summary, isLoading } = useQuery({
    queryKey:  ['rider', 'earnings-summary'],
    queryFn:   fetchEarningsSummary,
    staleTime: 60 * 1000,
  });

  const fmt = (paise) => `₹${((paise || 0) / 100).toFixed(0)}`;

  return (
    <SafeAreaView style={earnStyles.container} edges={['top']}>
      <ScrollView contentContainerStyle={earnStyles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={earnStyles.header}>
          <Text style={earnStyles.headerTitle}>My Earnings</Text>
          <Text style={earnStyles.headerSub}>Track your daily and weekly performance</Text>
        </View>

        {/* Hero card */}
        <View style={earnStyles.heroCard}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" style={{ marginVertical: Spacing[4] }} />
          ) : (
            <>
              <Text style={earnStyles.heroLabel}>Today</Text>
              <Text style={earnStyles.heroAmount}>{fmt(summary?.today)}</Text>

              <View style={earnStyles.periodRow}>
                <View style={earnStyles.periodItem}>
                  <Text style={earnStyles.periodLabel}>This Week</Text>
                  <Text style={earnStyles.periodValue}>{fmt(summary?.week)}</Text>
                </View>
                <View style={earnStyles.periodDivider} />
                <View style={earnStyles.periodItem}>
                  <Text style={earnStyles.periodLabel}>This Month</Text>
                  <Text style={earnStyles.periodValue}>{fmt(summary?.month)}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Incentive nudge */}
        <View style={earnStyles.infoCard}>
          <View style={earnStyles.infoRow}>
            <Ionicons name="flash" size={18} color={Colors.warning} />
            <Text style={earnStyles.infoText}>
              Complete 5+ deliveries today to earn a ₹50 bonus!
            </Text>
          </View>
        </View>

        {/* CTA buttons */}
        <TouchableOpacity
          style={earnStyles.primaryBtn}
          onPress={() => navigation.navigate('RiderEarningsHistory')}
          activeOpacity={0.8}
        >
          <Ionicons name="time-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={earnStyles.primaryBtnText}>View Full History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={earnStyles.secondaryBtn}
          onPress={() => navigation.navigate('RiderPayout')}
          activeOpacity={0.8}
        >
          <Ionicons name="cash-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
          <Text style={earnStyles.secondaryBtnText}>Request Payout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Earnings Stack ─────────────────────────────────────────────
function RiderEarningsStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen
        name="RiderEarningsSummary"
        component={RiderEarningsSummaryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RiderEarningsHistory"
        component={RiderEarningsHistoryScreen}
        options={{ title: 'Earnings History' }}
      />
      <Stack.Screen
        name="RiderPayout"
        component={RiderPayoutPlaceholder}
        options={{ title: 'Request Payout' }}
      />
    </Stack.Navigator>
  );
}

// ── Account Stack ──────────────────────────────────────────────
function RiderAccountStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen
        name="RiderAccount"
        component={ProfileScreen}
        options={{ title: 'My Account' }}
      />
      <Stack.Screen
        name="RiderBankAccount"
        component={RiderBankAccountScreen}
        options={{ title: 'Bank Account' }}
      />
    </Stack.Navigator>
  );
}

// ── Badge component ────────────────────────────────────────────
function TabBadge({ count }) {
  if (!count) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

// ── Main navigator ─────────────────────────────────────────────
export default function RiderNavigator() {
  const [offeredCount, setOfferedCount] = useState(0);
  const pollIntervalRef = useRef(null);

  const pollOffered = useCallback(async () => {
    try {
      const offers = await fetchOfferedDeliveries();
      setOfferedCount(Array.isArray(offers) ? offers.length : 0);
    } catch {
      // silently fail — don't disrupt UX
    }
  }, []);

  useEffect(() => {
    pollOffered();
    pollIntervalRef.current = setInterval(pollOffered, 10_000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [pollOffered]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown:             false,
        tabBarStyle:             styles.tabBar,
        tabBarActiveTintColor:   Colors.primary,   // orange — rider brand
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarLabelStyle:        styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            RiderHomeTab:    focused ? 'home'    : 'home-outline',
            RiderDelivTab:   focused ? 'bicycle' : 'bicycle-outline',
            RiderEarnTab:    focused ? 'cash'    : 'cash-outline',
            RiderAccountTab: focused ? 'person'  : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="RiderHomeTab"
        component={RiderHomeScreen}
        options={{ title: 'Home' }}
      />

      <Tab.Screen
        name="RiderDelivTab"
        component={RiderDeliveriesStack}
        options={{
          title: 'Deliveries',
          tabBarIcon: ({ focused, color, size }) => (
            <View>
              <Ionicons
                name={focused ? 'bicycle' : 'bicycle-outline'}
                size={size}
                color={color}
              />
              <TabBadge count={offeredCount} />
            </View>
          ),
        }}
        listeners={{
          tabPress: () => setOfferedCount(0),
        }}
      />

      <Tab.Screen
        name="RiderEarnTab"
        component={RiderEarningsStack}
        options={{ title: 'Earnings' }}
      />

      <Tab.Screen
        name="RiderAccountTab"
        component={RiderAccountStack}
        options={{ title: 'Account' }}
      />
    </Tab.Navigator>
  );
}

// ── Earnings Summary Styles ────────────────────────────────────
const earnStyles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding:       Spacing[4],
    paddingBottom: Spacing[10],
  },
  header: {
    marginBottom: Spacing[4],
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size['2xl'],
    color:      Colors.text,
  },
  headerSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    marginTop:  4,
  },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius:    BorderRadius.xl,
    padding:         Spacing[6],
    marginBottom:    Spacing[4],
    ...Shadow.lg,
  },
  heroLabel: {
    fontFamily:   Typography.fontFamily.medium,
    fontSize:     Typography.size.sm,
    color:        'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  heroAmount: {
    fontFamily:   Typography.fontFamily.bold,
    fontSize:     Typography.size['5xl'],
    color:        '#FFFFFF',
    marginBottom: Spacing[4],
  },
  periodRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius:    BorderRadius.lg,
    padding:         Spacing[3],
  },
  periodItem: {
    flex:       1,
    alignItems: 'center',
  },
  periodDivider: {
    width:           1,
    height:          32,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  periodLabel: {
    fontFamily:   Typography.fontFamily.regular,
    fontSize:     Typography.size.xs,
    color:        'rgba(255,255,255,0.75)',
    marginBottom: 2,
  },
  periodValue: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.lg,
    color:      '#FFFFFF',
  },
  infoCard: {
    backgroundColor: Colors.warningLight,
    borderRadius:    BorderRadius.lg,
    padding:         Spacing[3],
    marginBottom:    Spacing[5],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[2],
  },
  infoText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.warning,
    flex:       1,
  },
  primaryBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Colors.primary,
    borderRadius:    BorderRadius.lg,
    paddingVertical: Spacing[4],
    marginBottom:    Spacing[3],
    ...Shadow.md,
  },
  primaryBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.md,
    color:      '#FFFFFF',
  },
  secondaryBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.lg,
    paddingVertical: Spacing[4],
    borderWidth:     1.5,
    borderColor:     Colors.primary,
  },
  secondaryBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.md,
    color:      Colors.primary,
  },
});

// ── Tab bar Styles ─────────────────────────────────────────────
const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor:  Colors.border,
    borderTopWidth:  1,
    height:          60,
    paddingBottom:   8,
    paddingTop:      4,
  },
  tabLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
  },
  badge: {
    position:          'absolute',
    top:               -4,
    right:             -8,
    minWidth:          18,
    height:            18,
    borderRadius:      9,
    backgroundColor:   Colors.error,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color:      '#fff',
    fontSize:   Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    lineHeight: 18,
  },
});
