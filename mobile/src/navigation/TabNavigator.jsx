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
    </Stack.Navigator>
  );
}

// ── Profile stack
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={defaultStackOptions}>
      <Stack.Screen name="Profile"     component={ProfileScreen}   options={{ title: 'My Account' }} />
      <Stack.Screen name="AddressForm" component={AddressScreen}   options={{ title: 'Manage Addresses', presentation: 'modal' }} />
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
            NotificationsTab: focused ? 'notifications' : 'notifications-outline',
            ProfileTab:       focused ? 'person'        : 'person-outline',
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
