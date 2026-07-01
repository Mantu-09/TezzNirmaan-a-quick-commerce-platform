import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as ordersApi from '../../api/orders';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useAuthStore from '../../store/authStore';

const VERSION = '1.0.0';

const MENU_ITEMS = [
  { id: 'orders',    icon: 'receipt-outline',     label: 'My Orders',        sub: 'View and track your orders' },
  { id: 'addresses', icon: 'location-outline',    label: 'Saved Addresses',  sub: 'Manage delivery addresses'  },
  { id: 'settings',  icon: 'settings-outline',    label: 'Account Settings', sub: 'Coming soon'                },
  { id: 'help',      icon: 'help-circle-outline', label: 'Help & Support',   sub: 'Coming soon'                },
];

export default function ProfileScreen({ navigation }) {
  const { user, signOut } = useAuthStore();

  // Get profile to show full name
  const { data } = useQuery({
    queryKey: ['profile'],
    queryFn:  ordersApi.getProfile,
    staleTime: 5 * 60 * 1000,
  });
  const profile  = data?.user || user;
  const initials = (profile?.full_name || profile?.phone || 'U').charAt(0).toUpperCase();

  const handleMenuItem = (id) => {
    switch (id) {
      case 'orders':
        navigation.navigate('OrdersTab');
        break;
      case 'addresses':
        navigation.navigate('AddressForm');
        break;
      case 'settings':
      case 'help':
        Alert.alert('Coming Soon', 'This feature is under development.');
        break;
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Avatar + Name */}
        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{profile?.full_name || 'My Account'}</Text>
          <Text style={styles.phone}>{profile?.phone || user?.phone}</Text>
        </View>

        {/* Menu items */}
        <View style={styles.menuCard}>
          {MENU_ITEMS.map((item, idx) => (
            <React.Fragment key={item.id}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => handleMenuItem(item.id)}
                activeOpacity={0.7}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon} size={20} color={Colors.primary} />
                </View>
                <View style={styles.menuText}>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuSub}>{item.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
              {idx < MENU_ITEMS.length - 1 && <View style={styles.menuDivider} />}
            </React.Fragment>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={Colors.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.version}>TezzNirmaan v{VERSION}</Text>
        <Text style={styles.versionSub}>Made with ❤️ in Patna, Bihar</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[4], paddingBottom: Spacing[10] },

  profileSection: { alignItems: 'center', paddingVertical: Spacing[8] },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing[4],
    ...Shadow.md,
  },
  avatarText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: '#fff' },
  name:  { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text },
  phone: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textSecondary, marginTop: Spacing[1] },

  menuCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    marginBottom: Spacing[5], overflow: 'hidden', ...Shadow.sm,
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[5], paddingVertical: Spacing[4], gap: Spacing[4],
  },
  menuIcon: {
    width: 38, height: 38, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  menuText:  { flex: 1 },
  menuLabel: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text },
  menuSub:   { fontFamily: Typography.fontFamily.regular,  fontSize: Typography.size.xs,   color: Colors.textSecondary, marginTop: 2 },
  menuDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing[5] },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2],
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[6],
  },
  signOutText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.error },

  version:    { textAlign: 'center', fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  versionSub: { textAlign: 'center', fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 4 },
});
