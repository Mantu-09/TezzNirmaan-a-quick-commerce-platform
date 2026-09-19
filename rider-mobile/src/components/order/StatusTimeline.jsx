import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, BorderRadius, Spacing } from '../../theme';

const STEPS = [
  { key: 'pending',          label: 'Order Placed',      icon: '📋' },
  { key: 'confirmed',        label: 'Confirmed',         icon: '✅' },
  { key: 'preparing',        label: 'Being Packed',      icon: '📦' },
  { key: 'ready_for_pickup', label: 'Ready',             icon: '🏪' },
  { key: 'out_for_delivery', label: 'Out for Delivery',  icon: '🛵' },
  { key: 'delivered',        label: 'Delivered',         icon: '🎉' },
];

const STATUS_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.key, i]));

export default function StatusTimeline({ currentStatus, timestamps = {} }) {
  const currentIdx = STATUS_INDEX[currentStatus] ?? 0;
  const isCancelled = currentStatus === 'cancelled';

  if (isCancelled) {
    return (
      <View style={styles.cancelledBox}>
        <Text style={styles.cancelledEmoji}>❌</Text>
        <Text style={styles.cancelledText}>This order was cancelled</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {STEPS.map((step, idx) => {
        const isDone    = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isPending = idx > currentIdx;

        return (
          <View key={step.key} style={styles.stepRow}>
            {/* Vertical connector */}
            <View style={styles.connectorCol}>
              <View style={[
                styles.dot,
                isDone    && styles.dotDone,
                isCurrent && styles.dotCurrent,
                isPending && styles.dotPending,
              ]}>
                <Text style={styles.dotEmoji}>
                  {isDone ? '✓' : step.icon}
                </Text>
              </View>
              {idx < STEPS.length - 1 && (
                <View style={[styles.line, isDone && styles.lineDone]} />
              )}
            </View>

            {/* Label */}
            <View style={styles.labelCol}>
              <Text style={[styles.stepLabel, isPending && styles.stepLabelPending]}>
                {step.label}
              </Text>
              {isCurrent && (
                <View style={styles.currentPill}>
                  <Text style={styles.currentPillText}>Current</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { paddingVertical: Spacing[2] },

  stepRow:      { flexDirection: 'row', minHeight: 48 },
  connectorCol: { width: 36, alignItems: 'center' },
  labelCol:     { flex: 1, paddingLeft: Spacing[3], paddingTop: 4, paddingBottom: Spacing[4] },

  dot: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface2,
    borderWidth: 2, borderColor: Colors.border,
  },
  dotDone: {
    backgroundColor: Colors.success,
    borderColor:     Colors.success,
  },
  dotCurrent: {
    backgroundColor: Colors.primary,
    borderColor:     Colors.primary,
  },
  dotPending: { opacity: 0.4 },
  dotEmoji:   { fontSize: 14 },

  line:     { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: Colors.success },

  stepLabel:        { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base, color: Colors.text },
  stepLabelPending: { color: Colors.textTertiary },

  currentPill: {
    marginTop: 4, alignSelf: 'flex-start',
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  currentPillText: { color: Colors.primary, fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs },

  cancelledBox: {
    padding: Spacing[5], alignItems: 'center',
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.xl,
  },
  cancelledEmoji: { fontSize: 32, marginBottom: Spacing[3] },
  cancelledText:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: Colors.error },
});
