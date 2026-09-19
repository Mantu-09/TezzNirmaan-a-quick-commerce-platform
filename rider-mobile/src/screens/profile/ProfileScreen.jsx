import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as ordersApi from '../../api/orders';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useAuthStore from '../../store/authStore';
import useCityStore from '../../store/cityStore'; // P4-4A
import client from '../../api/client'; // P5-4C
import { openSupportChat } from '../../services/freshchat'; // P7-4

const VERSION = '1.0.0';

export default function ProfileScreen({ navigation }) {
  const { user, signOut }      = useAuthStore();
  const { selectedCity }       = useCityStore(); // P4-4A

  const MENU_ITEMS = [
    { id: 'orders',    icon: 'receipt-outline',     label: 'My Orders',        sub: 'View and track your orders' },
    { id: 'addresses', icon: 'location-outline',    label: 'Saved Addresses',  sub: 'Manage delivery addresses'  },
    { id: 'city',      icon: 'map-outline',         label: 'Change City',      sub: selectedCity?.name ? `Currently: ${selectedCity.name}` : 'Select a city' }, // P4-4A
    { id: 'settings',  icon: 'settings-outline',    label: 'Account Settings', sub: 'Edit name, manage account'  },
    { id: 'help',      icon: 'help-circle-outline', label: 'Help & Support',   sub: 'Chat with us instantly'     }, // P7-4
  ];

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
      case 'city': // P4-4A
        navigation.navigate('CitySelectGate', { postAuth: true });
        break;
      case 'help': // P7-4
        openSupportChat();
        break;
      case 'settings':
        navigation.navigate('AccountSettings');  // R8
        break;
    }
  };

  // P5-4C: Account erasure — GDPR / DPDP
  const [confirmText, setConfirmText]   = useState('');
  const [deleteModal, setDeleteModal]   = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => client.delete('/customer/account', {
      data: { confirmation: 'DELETE MY ACCOUNT' },
    }),
    onSuccess: () => {
      setDeleteModal(false);
      Alert.alert(
        'Account Deleted',
        'Your account and personal data have been permanently deleted.',
        [{ text: 'OK', onPress: signOut }],
      );
    },
    onError: (err) => {
      Alert.alert('Error', err?.message || 'Could not delete account. Please try again.');
    },
  });

  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Delete Account',
      'This will permanently delete your account, all addresses, and wallet balance. ' +
      'Your order history will be anonymized. This CANNOT be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Proceed',
          style: 'destructive',
          onPress: () => setDeleteModal(true),
        },
      ]
    );
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

        {/* Delete Account — P5-4C */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
          <Ionicons name="trash-outline" size={16} color="#991B1B" />
          <Text style={styles.deleteBtnText}>Delete My Account</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.version}>TezzNirmaan v{VERSION}</Text>
        <Text style={styles.versionSub}>Made with ❤️ in Patna, Bihar</Text>
      </ScrollView>

      {/* Confirmation modal for account deletion */}
      <Modal visible={deleteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⚠️ Confirm Account Deletion</Text>
            <Text style={styles.modalBody}>
              Type{' '}<Text style={styles.modalCode}>DELETE MY ACCOUNT</Text>{' '}
              below to permanently delete your account.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="Type here..."
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[
                styles.modalConfirmBtn,
                confirmText !== 'DELETE MY ACCOUNT' && styles.modalConfirmBtnDisabled,
              ]}
              onPress={() => deleteMutation.mutate()}
              disabled={confirmText !== 'DELETE MY ACCOUNT' || deleteMutation.isPending}
            >
              <Text style={styles.modalConfirmText}>
                {deleteMutation.isPending ? 'Deleting...' : 'Delete My Account'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => { setDeleteModal(false); setConfirmText(''); }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  // P5-4C: Delete Account
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[2],
    borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: BorderRadius.xl,
    padding: Spacing[3],
    marginBottom: Spacing[4],
  },
  deleteBtnText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      '#991B1B',
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    padding: Spacing[6],
    paddingBottom: Spacing[10],
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.lg,
    color:      '#7F1D1D',
    marginBottom: Spacing[3],
  },
  modalBody: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing[4],
  },
  modalCode: {
    fontFamily: Typography.fontFamily.bold,
    color:      Colors.text,
  },
  modalInput: {
    borderWidth:  1,
    borderColor:  Colors.border,
    borderRadius: BorderRadius.lg,
    padding:      Spacing[3],
    fontFamily:   Typography.fontFamily.medium,
    fontSize:     Typography.size.sm,
    color:        Colors.text,
    marginBottom: Spacing[4],
    letterSpacing: 1,
  },
  modalConfirmBtn: {
    backgroundColor: '#DC2626',
    borderRadius:    BorderRadius.xl,
    paddingVertical: Spacing[4],
    alignItems:      'center',
    marginBottom:    Spacing[3],
  },
  modalConfirmBtnDisabled: {
    backgroundColor: '#FCA5A5',
  },
  modalConfirmText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.base,
    color:      '#FFFFFF',
  },
  modalCancelBtn: {
    alignItems: 'center',
    padding:    Spacing[3],
  },
  modalCancelText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
  },
});
