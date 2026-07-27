// ────────────────────────────────────────────────────────────
// PromoCodeInput.jsx — P1-C
//
// Used on CartScreen (preview) and CheckoutScreen (applied on order).
//
// Props:
//   onApply      (code: string) => void  — parent triggers API call
//   appliedPromo {promo_id, code, discount_paise, message} | null
//   onRemove     () => void
//   loading      boolean
//   error        string | null
// ────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { formatPaise } from '../../utils/money';

export default function PromoCodeInput({
  onApply,
  appliedPromo,
  onRemove,
  loading = false,
  error = null,
}) {
  const [inputCode, setInputCode] = useState('');

  const handleApply = () => {
    const trimmed = inputCode.trim().toUpperCase();
    if (!trimmed) return;
    onApply(trimmed);
  };

  // ── Applied state ──────────────────────────────────────────
  if (appliedPromo) {
    return (
      <View style={styles.appliedBox}>
        <View style={styles.appliedLeft}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.appliedCode}>{appliedPromo.code}</Text>
            <Text style={styles.appliedSaving}>
              {appliedPromo.message || `You save ${formatPaise(appliedPromo.discount_paise)}`}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={12} style={styles.removeBtn}>
          <Ionicons name="close-circle" size={20} color={Colors.error} />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Input state ────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={[styles.inputRow, error && styles.inputRowError]}>
        <Ionicons name="pricetag-outline" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.input}
          placeholder="Enter promo code"
          placeholderTextColor={Colors.textTertiary}
          value={inputCode}
          onChangeText={t => setInputCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleApply}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.applyBtn, (!inputCode.trim() || loading) && styles.applyBtnDisabled]}
          onPress={handleApply}
          disabled={!inputCode.trim() || loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.applyBtnText}>Apply</Text>
          }
        </TouchableOpacity>
      </View>
      {error && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={13} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing[3] },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingLeft: Spacing[4],
    paddingRight: Spacing[1],
    paddingVertical: Spacing[1],
    ...Shadow.sm,
  },
  inputRowError: { borderColor: Colors.error },

  input: {
    flex: 1,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.base,
    color: Colors.text,
    letterSpacing: 1,
    paddingVertical: Spacing[3],
  },

  applyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    minWidth: 72,
    alignItems: 'center',
  },
  applyBtnDisabled: { backgroundColor: Colors.textTertiary },
  applyBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.sm,
    color: '#fff',
  },

  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    marginTop: Spacing[2],
    paddingHorizontal: Spacing[2],
  },
  errorText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.error,
    flex: 1,
  },

  // Applied state
  appliedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successLight || '#f0fdf4',
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.success || '#16a34a',
    padding: Spacing[3],
    marginBottom: Spacing[3],
    ...Shadow.sm,
  },
  appliedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    flex: 1,
  },
  checkCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.success || '#16a34a',
    alignItems: 'center', justifyContent: 'center',
  },
  appliedCode: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.success || '#16a34a',
    letterSpacing: 1,
  },
  appliedSaving: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  removeBtn: { padding: Spacing[1] },
});
