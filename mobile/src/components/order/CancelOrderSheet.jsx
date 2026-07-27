// ────────────────────────────────────────────────────────────
// CancelOrderSheet.jsx — P1-B
//
// A bottom sheet that lets the customer pick a cancellation reason
// and confirm order cancellation.
//
// Props:
//   orderId         {string}   — order UUID
//   isOnlinePayment {boolean}  — show refund message when true
//   onConfirm       {function} — (reason: string) => void
//   onDismiss       {function} — () => void
//   loading         {boolean}  — show spinner while mutation is in-flight
// ────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import Button from '../common/Button';

const CANCEL_REASONS = [
  'Changed my mind',
  'Ordered by mistake',
  'Found better price elsewhere',
  'Delivery time too long',
  'Other',
];

export default function CancelOrderSheet({
  orderId,
  isOnlinePayment = false,
  onConfirm,
  onDismiss,
  loading = false,
}) {
  const [selectedReason, setSelectedReason] = useState(null);

  const handleConfirm = () => {
    if (!selectedReason) return;
    onConfirm(selectedReason);
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      {/* Dimmed backdrop — tap to dismiss */}
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <View style={styles.sheet}>
        {/* Handle pill */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="close-circle" size={28} color={Colors.error} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Cancel Order</Text>
            <Text style={styles.subtitle}>Please select a reason for cancellation</Text>
          </View>
          <TouchableOpacity onPress={onDismiss} hitSlop={12}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Reason list */}
        <View style={styles.reasons}>
          {CANCEL_REASONS.map(reason => {
            const selected = selectedReason === reason;
            return (
              <TouchableOpacity
                key={reason}
                style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                onPress={() => setSelectedReason(reason)}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioInner} />}
                </View>
                <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                  {reason}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Refund notice — shown for online payments */}
        {isOnlinePayment && (
          <View style={styles.refundNotice}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
            <Text style={styles.refundText}>
              Since you paid online, a full refund will be initiated and credited to your account
              within{' '}
              <Text style={styles.refundBold}>5–7 business days</Text>.
            </Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            variant="outline"
            size="md"
            style={styles.keepBtn}
            onPress={onDismiss}
          >
            Keep Order
          </Button>
          <Button
            variant="filled"
            size="md"
            style={[styles.cancelBtn, !selectedReason && styles.cancelBtnDisabled]}
            textStyle={styles.cancelBtnText}
            loading={loading}
            disabled={!selectedReason || loading}
            onPress={handleConfirm}
          >
            Confirm Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    paddingBottom: Platform.OS === 'ios' ? 34 : 24, // safe area for iPhone home bar
    ...Shadow.lg,
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Spacing[3],
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerIcon: {
    marginTop: 2,
  },
  title: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.lg,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  reasons: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
    gap: Spacing[1],
  },

  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  reasonRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10', // 6% tint
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },

  reasonText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    color: Colors.text,
    flex: 1,
  },
  reasonTextSelected: {
    fontFamily: Typography.fontFamily.medium,
    color: Colors.primary,
  },

  refundNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    marginHorizontal: Spacing[5],
    marginTop: Spacing[4],
    padding: Spacing[3],
    backgroundColor: Colors.primary + '12',
    borderRadius: BorderRadius.lg,
  },
  refundText: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.text,
    lineHeight: 18,
  },
  refundBold: {
    fontFamily: Typography.fontFamily.semiBold,
  },

  actions: {
    flexDirection: 'row',
    gap: Spacing[3],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[5],
  },
  keepBtn: {
    flex: 1,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.error,
    borderColor: Colors.error,
  },
  cancelBtnDisabled: {
    backgroundColor: Colors.textTertiary,
    borderColor: Colors.textTertiary,
  },
  cancelBtnText: {
    color: '#fff',
  },
});
