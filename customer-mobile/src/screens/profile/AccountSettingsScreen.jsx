// ────────────────────────────────────────────────────────────
// AccountSettingsScreen — edit name, view phone/email,
// and optionally delete account (GDPR / DPDP Act 2023).
// ────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { getProfile, updateProfile, deleteAccount } from '../../api/profile';
import useAuthStore from '../../store/authStore';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';

export default function AccountSettingsScreen() {
  const navigation   = useNavigation();
  const updateUser   = useAuthStore(s => s.updateUser);
  const logout       = useAuthStore(s => s.logout);
  const queryClient  = useQueryClient();

  // Fetch latest profile from backend
  const { data: profileData, isLoading } = useQuery({
    queryKey:  ['profile'],
    queryFn:   getProfile,
    staleTime: 2 * 60 * 1000,
  });
  const profile = profileData?.profile;

  // Local edit state
  const [fullName, setFullName]   = useState('');
  const [isDirty,  setIsDirty]    = useState(false);

  // Sync name field when profile loads (only once)
  React.useEffect(() => {
    if (profile?.full_name && !isDirty) {
      setFullName(profile.full_name);
    }
  }, [profile?.full_name]);

  // ── Save name mutation ──────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => updateProfile({ fullName: fullName.trim() }),
    onSuccess:  (data) => {
      const updated = data?.profile;
      if (updated) updateUser({ full_name: updated.full_name });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      Alert.alert('Saved', 'Your name has been updated.');
      setIsDirty(false);
    },
    onError: (err) => Alert.alert('Error', err.message || 'Could not save. Try again.'),
  });

  // ── Delete account mutation ─────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess:  () => {
      Alert.alert(
        'Account deleted',
        'Your account and all data have been permanently erased.',
        [{ text: 'OK', onPress: () => logout() }],
      );
    },
    onError: (err) => Alert.alert('Error', err.message || 'Could not delete account. Contact support.'),
  });

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This will permanently erase all your orders, wallet balance, and personal data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const canSave = fullName.trim().length >= 2 && isDirty && !saveMutation.isPending;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Profile info section ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>

          {/* Full name — editable */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={v => { setFullName(v); setIsDirty(true); }}
              placeholder="Your full name"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          {/* Phone — read-only (auth identifier) */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <View style={styles.readOnly}>
              <Text style={styles.readOnlyText}>{profile?.phone || '—'}</Text>
              <View style={styles.lockedBadge}>
                <Ionicons name="lock-closed" size={10} color={Colors.textSecondary} />
                <Text style={styles.lockedText}>Can't change</Text>
              </View>
            </View>
          </View>

          {/* Email — read-only if set */}
          {profile?.email ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>{profile.email}</Text>
              </View>
            </View>
          ) : null}

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={() => saveMutation.mutate()}
            disabled={!canSave}
            activeOpacity={0.8}
          >
            {saveMutation.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>

        {/* ── Account joined date ── */}
        {profile?.created_at ? (
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.infoText}>
              Member since {new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
        ) : null}

        {/* ── Danger zone ── */}
        <View style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <Text style={styles.dangerSub}>
            Deleting your account is permanent and cannot be undone. All orders, wallet balance, and personal data will be erased.
          </Text>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDeleteAccount}
            disabled={deleteMutation.isPending}
            activeOpacity={0.8}
          >
            {deleteMutation.isPending
              ? <ActivityIndicator size="small" color="#dc2626" />
              : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#dc2626" />
                  <Text style={styles.deleteBtnText}>Delete My Account</Text>
                </>
              )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: Colors.background },
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:  { padding: Spacing[4], paddingBottom: Spacing[10] },

  // ── Profile card ──
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    ...Shadow.sm,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.text,
    marginBottom: Spacing[4],
  },
  field:      { marginBottom: Spacing[4] },
  fieldLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing[1],
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.background,
  },
  readOnlyText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
  lockedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  lockedText: { fontFamily: Typography.fontFamily.regular, fontSize: 10, color: Colors.textSecondary },

  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[3],
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: '#fff',
  },

  // ── Info row ──
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing[1], marginBottom: Spacing[5],
  },
  infoText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary },

  // ── Danger zone ──
  dangerCard: {
    borderWidth: 1, borderColor: '#fca5a5',
    borderRadius: BorderRadius.xl,
    padding: Spacing[4],
    backgroundColor: '#fff5f5',
  },
  dangerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: '#dc2626', marginBottom: Spacing[2] },
  dangerSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: '#7f1d1d', lineHeight: 20, marginBottom: Spacing[4] },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#dc2626',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing[3],
  },
  deleteBtnText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: '#dc2626' },
});
