import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../theme';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import { subscribeToNotifications } from '../utils/supabase';

// ── Screens ──────────────────────────────────────────────────
import HomeScreen              from '../screens/home/HomeScreen';
import CategoryScreen          from '../screens/products/CategoryScreen';
import ProductDetailScreen     from '../screens/products/ProductDetailScreen';
import CartScreen              from '../screens/cart/CartScreen';
import CheckoutScreen          from '../screens/checkout/CheckoutScreen';
import AddressScreen           from '../screens/checkout/AddressScreen';
import OrderHistoryScreen      from '../screens/orders/OrderHistoryScreen';
import OrderConfirmationScreen from '../screens/orders/OrderConfirmationScreen';
import OrderTrackingScreen     from '../screens/orders/OrderTrackingScreen';
import ProfileScreen           from '../screens/profile/ProfileScreen';
import NotificationsScreen     from '../screens/notifications/NotificationsScreen';
import SearchScreen            from '../screens/search/SearchScreen';
import RiderEarningsScreen     from '../screens/earnings/RiderEarningsScreen'; // P2-B
import RiderRouteScreen        from '../screens/rider/RiderRouteScreen';       // P3-B
import WalletScreen            from '../screens/wallet/WalletScreen';          // P3-C
import ReferralScreen          from '../screens/wallet/ReferralScreen';         // P4-2A
import PassScreen              from '../screens/pass/PassScreen';               // P5-3
import RequestReturnScreen    from '../screens/returns/RequestReturnScreen';   // P6-3
import ReturnStatusScreen     from '../screens/returns/ReturnStatusScreen';    // P6-3
import ContractorApplyScreen  from '../screens/b2b/ContractorApplyScreen';    // P6-6
import ContractorInvoicesScreen from '../screens/b2b/ContractorInvoicesScreen'; // P6-6
import RiderHomeScreen          from '../screens/rider/RiderHomeScreen';           // P9-4
import RiderActiveDeliveryScreen from '../screens/rider/RiderActiveDeliveryScreen'; // P9-4
import RiderIssueScreen         from '../screens/rider/RiderIssueScreen';           // P9-4

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const defaultStackOptions = {
  headerStyle:          { backgroundColor: Colors.surface },
  headerTintColor:      Colors.text,
  headerTitleStyle:     { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md },
  headerShadowVisible:  false,
};

// ── Home stack (Home → Category → ProductDetail → Cart → Checkout → Confirmation)
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen name="Home"             component={HomeScreen}              options={{ headerShown: false }} />
      <Stack.Screen name="Category"         component={CategoryScreen}          options={({ route }) => ({ title: route.params?.categoryName || 'Products' })} />
      <Stack.Screen name="ProductDetail"    component={ProductDetailScreen}     options={{ title: '' }} />
      <Stack.Screen name="Cart"             component={CartScreen}              options={{ title: 'My Cart' }} />
      <Stack.Screen name="Checkout"         component={CheckoutScreen}          options={{ title: 'Checkout' }} />
      <Stack.Screen name="AddressForm"      component={AddressScreen}           options={{ title: 'Add Address', presentation: 'modal' }} />
      <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} options={{ title: 'Order Placed!', headerLeft: () => null }} />
    </Stack.Navigator>
  );
}

// ── Search stack (B3) ─────────────────────────────────────────
function SearchStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen name="SearchMain"    component={SearchScreen}        options={{ headerShown: false }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}

// ── Orders stack
function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen name="OrderHistory"      component={OrderHistoryScreen}      options={{ title: 'My Orders' }} />
      <Stack.Screen name="OrderTracking"     component={OrderTrackingScreen}     options={{ title: 'Track Order' }} />
      <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} options={{ title: 'Order Details' }} />
      {/* P6-3: Return flow */}
      <Stack.Screen name="RequestReturn"     component={RequestReturnScreen}     options={{ title: 'Request a Return', presentation: 'modal' }} />
      <Stack.Screen name="ReturnStatus"      component={ReturnStatusScreen}      options={{ title: 'Return Status' }} />
    </Stack.Navigator>
  );
}

// ── Profile stack
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen name="Profile"              component={ProfileScreen}             options={{ title: 'My Account' }} />
      <Stack.Screen name="AddressForm"          component={AddressScreen}             options={{ title: 'Manage Addresses', presentation: 'modal' }} />
      {/* P6-6: B2B Contractor screens */}
      <Stack.Screen name="ContractorApply"      component={ContractorApplyScreen}     options={{ title: 'Contractor Account' }} />
      <Stack.Screen name="ContractorInvoices"   component={ContractorInvoicesScreen}  options={{ title: 'GST Invoices' }} />
    </Stack.Navigator>
  );
}

// ── Notifications stack
function NotificationsStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
    </Stack.Navigator>
  );
}

// ── Earnings stack (P2-B — rider only) ────────────────────────
function EarningsStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen name="RiderEarnings" component={RiderEarningsScreen} options={{ title: 'My Earnings' }} />
    </Stack.Navigator>
  );
}

// ── Route stack (P3-B + P9-4 ─ rider only) ────────────────────
// Route: RiderHome → RiderRoute → RiderDelivery → RiderIssue
function RouteStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen
        name="RiderHome"
        component={RiderHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RiderRoute"
        component={RiderRouteScreen}
        options={{ title: 'Optimized Route' }}
      />
      <Stack.Screen
        name="RiderDelivery"
        component={RiderActiveDeliveryScreen}
        options={{ title: 'Active Delivery' }}
      />
      <Stack.Screen
        name="RiderIssue"
        component={RiderIssueScreen}
        options={{ title: 'Report Issue', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

// ── Wallet stack (P3-C — all customers) ──────────────────────
function WalletStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen name="Wallet"   component={WalletScreen}   options={{ title: 'My Wallet' }} />
      <Stack.Screen name="Referral" component={ReferralScreen} options={{ title: 'Invite Friends' }} />
    </Stack.Navigator>
  );
}

// ── Pass stack (P5-3 — all customers) ───────────────────────────
function PassStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen name="Pass" component={PassScreen} options={{ title: 'TezzNirmaan Pass' }} />
    </Stack.Navigator>
  );
}

// ── Generic badge (reused for cart and notifications) ─────────
function TabBadge({ count, color = Colors.primary }) {
  if (!count) return null;
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

// ── Tab Navigator ─────────────────────────────────────────────
export default function TabNavigator() {
  const itemCount          = useCartStore(s => s.itemCount);
  const { user }           = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const isRider = user?.role === 'rider'; // P2-B: role gate

  // Subscribe to live notification inserts for unread badge
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = subscribeToNotifications(user.id, () => {
      setUnreadCount(c => c + 1);
    });

    return unsubscribe;
  }, [user?.id]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle:  styles.tabBar,
        tabBarActiveTintColor:   Colors.primary,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            HomeTab:          focused ? 'home'          : 'home-outline',
            SearchTab:        focused ? 'search'        : 'search-outline',
            CartTab:          focused ? 'cart'          : 'cart-outline',
            OrdersTab:        focused ? 'receipt'       : 'receipt-outline',
            PassTab:          focused ? 'ticket'        : 'ticket-outline',        // P5-3
            NotificationsTab: focused ? 'notifications' : 'notifications-outline',
            ProfileTab:       focused ? 'person'        : 'person-outline',
            EarningsTab:      focused ? 'cash'          : 'cash-outline',     // P2-B
            RouteTab:         focused ? 'map'           : 'map-outline',       // P3-B
            WalletTab:        focused ? 'wallet'        : 'wallet-outline',    // P3-C
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab"    component={HomeStack}    options={{ title: 'Home' }} />

      {/* B3: Search tab */}
      <Tab.Screen name="SearchTab"  component={SearchStack}  options={{ title: 'Search' }} />

      <Tab.Screen name="CartTab"    component={CartScreen}   options={{
        title: 'Cart',
        tabBarIcon: ({ focused, color, size }) => (
          <View>
            <Ionicons name={focused ? 'cart' : 'cart-outline'} size={size} color={color} />
            <TabBadge count={itemCount} />
          </View>
        ),
      }} />

      <Tab.Screen name="OrdersTab"  component={OrdersStack}  options={{ title: 'Orders' }} />

      {/* P5-3: TezzPass tab — all authenticated users */}
      <Tab.Screen name="PassTab" component={PassStack} options={{ title: 'Pass' }} />

      {/* B1: Notifications tab with live unread badge */}
      <Tab.Screen
        name="NotificationsTab"
        component={NotificationsStack}
        options={{
          title: 'Alerts',
          tabBarIcon: ({ focused, color, size }) => (
            <View>
              <Ionicons
                name={focused ? 'notifications' : 'notifications-outline'}
                size={size}
                color={color}
              />
              <TabBadge count={unreadCount} color="#EF4444" />
            </View>
          ),
        }}
        listeners={{
          tabPress: () => setUnreadCount(0), // clear badge when tab is tapped
        }}
      />

      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile' }} />

      {/* P3-C: Wallet tab — visible to all authenticated users (customers + riders) */}
      <Tab.Screen name="WalletTab" component={WalletStack} options={{ title: 'Wallet' }} />

      {/* P2-B: Rider Earnings tab — only shown for riders */}
      {isRider && (
        <Tab.Screen
          name="EarningsTab"
          component={EarningsStack}
          options={{ title: 'Earnings' }}
        />
      )}

      {/* P3-B: Rider Route Optimization tab — only shown for riders */}
      {isRider && (
        <Tab.Screen
          name="RouteTab"
          component={RouteStack}
          options={{ title: 'Route' }}
        />
      )}
    </Tab.Navigator>
  );
}

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
    position:        'absolute',
    top:             -4,
    right:           -8,
    borderRadius:    10,
    minWidth:        18,
    height:          18,
    justifyContent:  'center',
    alignItems:      'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color:      '#FFFFFF',
    fontSize:   Typography.size.xs,
    fontFamily: Typography.fontFamily.bold,
    lineHeight: 18,
  },
});
