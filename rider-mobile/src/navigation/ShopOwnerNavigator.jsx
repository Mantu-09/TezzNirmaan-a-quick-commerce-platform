// ────────────────────────────────────────────────────────────
// ShopOwnerNavigator — P8-4
//
// Role-gated bottom-tab navigator shown to shop_owner and
// shop_staff roles. Rendered by RootNavigator instead of the
// customer TabNavigator when user.role === 'shop_owner'.
//
// Tabs:
//   📋 Orders   — ShopOrderQueueScreen + ShopOrderDetailScreen
//   📦 Inventory — ShopInventoryScreen
//   📊 Analytics — reuses existing shop analytics screen
//   👤 Account  — ProfileScreen (sign out etc.)
//
// Badge on Orders tab: counts sub-orders with status 'new',
// updated in real-time via Supabase Postgres changes.
// ────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet }     from 'react-native';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons }                   from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../theme';
import useAuthStore                   from '../store/authStore';
import { subscribeToShopOrders }      from '../utils/supabase';

// ── Screens ───────────────────────────────────────────────────
import ShopOrderQueueScreen      from '../screens/shopOwner/ShopOrderQueueScreen';
import ShopOrderDetailScreen     from '../screens/shopOwner/ShopOrderDetailScreen';
import ShopInventoryScreen       from '../screens/shopOwner/ShopInventoryScreen';
import ShopSettlementsScreen     from '../screens/shopOwner/ShopSettlementsScreen';     // Phase C
import ShopStaffManagementScreen from '../screens/shopOwner/ShopStaffManagementScreen'; // Phase C
import ShopReturnsScreen         from '../screens/shopOwner/ShopReturnsScreen';         // Phase C
import ProfileScreen             from '../screens/profile/ProfileScreen';

// ── Analytics: reuse the shop analytics page if it exists,
//    otherwise show a coming-soon placeholder.
let ShopAnalyticsScreen;
try {
  ShopAnalyticsScreen = require('../screens/shopOwner/ShopAnalyticsScreen').default;
} catch (_) {
  // Placeholder until ShopAnalyticsScreen is built (P8-5+)
  ShopAnalyticsScreen = function ShopAnalyticsPlaceholder() {
    const { View, Text } = require('react-native');
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <Text style={{ fontSize: 36, marginBottom: 12 }}>📊</Text>
        <Text style={{ fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.text }}>
          Analytics
        </Text>
        <Text style={{ fontFamily: Typography.fontFamily.regular, fontSize: 14, color: Colors.textSecondary, marginTop: 6 }}>
          Coming in P8-5
        </Text>
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

// ── Orders Stack: Queue → Detail ──────────────────────────────
function ShopOrdersStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen
        name="ShopOrderQueue"
        component={ShopOrderQueueScreen}
        options={{ headerShown: false }} // Screen has its own header
      />
      <Stack.Screen
        name="ShopOrderDetail"
        component={ShopOrderDetailScreen}
        options={{ title: 'Order Detail' }}
      />
    </Stack.Navigator>
  );
}

// ── Inventory Stack ────────────────────────────────────────────
function ShopInventoryStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen
        name="ShopInventoryMain"
        component={ShopInventoryScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// ── Analytics Stack ────────────────────────────────────────────
function ShopAnalyticsStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen
        name="ShopAnalyticsMain"
        component={ShopAnalyticsScreen}
        options={{ title: 'Analytics' }}
      />
    </Stack.Navigator>
  );
}

// ── Account Stack ──────────────────────────────────────────────
function ShopAccountStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen
        name="ShopAccount"
        component={ProfileScreen}
        options={{ title: 'My Account' }}
      />
      {/* Phase C — accessible from Account > push navigation */}
      <Stack.Screen
        name="ShopSettlements"
        component={ShopSettlementsScreen}
        options={{ title: 'Settlements' }}
      />
      <Stack.Screen
        name="ShopStaff"
        component={ShopStaffManagementScreen}
        options={{ title: 'Staff Management' }}
      />
      <Stack.Screen
        name="ShopReturns"
        component={ShopReturnsScreen}
        options={{ title: 'Returns' }}
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
export default function ShopOwnerNavigator() {
  const { user }          = useAuthStore();
  const shopId            = user?.shop_id;
  const [newCount, setNewCount] = useState(0);

  // Real-time new-order counter for the Orders tab badge
  useEffect(() => {
    if (!shopId) return;

    const unsub = subscribeToShopOrders(shopId, (row) => {
      if (row.status === 'new') {
        setNewCount(c => c + 1);
      } else {
        // A status update means one fewer 'new' order — decrement safely
        setNewCount(c => Math.max(0, c - 1));
      }
    });

    return unsub;
  }, [shopId]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle:             styles.tabBar,
        tabBarActiveTintColor:   Colors.secondary,   // navy — shop owner brand
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarLabelStyle:        styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            ShopOrdersTab:    focused ? 'receipt'       : 'receipt-outline',
            ShopInventoryTab: focused ? 'cube'          : 'cube-outline',
            ShopAnalyticsTab: focused ? 'bar-chart'     : 'bar-chart-outline',
            ShopAccountTab:   focused ? 'person'        : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="ShopOrdersTab"
        component={ShopOrdersStack}
        options={{
          title: 'Orders',
          tabBarIcon: ({ focused, color, size }) => (
            <View>
              <Ionicons
                name={focused ? 'receipt' : 'receipt-outline'}
                size={size}
                color={color}
              />
              <TabBadge count={newCount} />
            </View>
          ),
        }}
        listeners={{
          tabPress: () => setNewCount(0), // clear badge when tab is opened
        }}
      />

      <Tab.Screen
        name="ShopInventoryTab"
        component={ShopInventoryStack}
        options={{ title: 'Inventory' }}
      />

      <Tab.Screen
        name="ShopAnalyticsTab"
        component={ShopAnalyticsStack}
        options={{ title: 'Analytics' }}
      />

      <Tab.Screen
        name="ShopAccountTab"
        component={ShopAccountStack}
        options={{ title: 'Account' }}
      />
    </Tab.Navigator>
  );
}

// ── Styles ─────────────────────────────────────────────────────
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
    position:         'absolute',
    top:              -4,
    right:            -8,
    minWidth:         18,
    height:           18,
    borderRadius:     9,
    backgroundColor:  Colors.error,
    alignItems:       'center',
    justifyContent:   'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color:      '#fff',
    fontSize:   Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    lineHeight: 18,
  },
});
