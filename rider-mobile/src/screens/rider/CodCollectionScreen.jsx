// ────────────────────────────────────────────────────────────
// CodCollectionScreen.jsx — R3
//
// Shown after rider marks a delivery as "delivered" for COD orders.
// Rider confirms they have physically collected cash from the customer.
//
// Flow:
//   RiderActiveDeliveryScreen → markDelivered() → payment_method === 'cod'
//   → navigate('CodCollection', { assignmentId, amountPaise, customerName, subOrderNumber })
//   → rider taps "I collected the cash" → collectCod() → confetti + back to home
// ────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons }     from '@expo/vector-icons';
import * as Haptics     from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import { collectCod } from '../../api/rider';

const PRIMARY   = '#E8740C';
const SECONDARY = '#0D3B6E';
const BG        = '#F7F6F3';
const SURFACE   = '#FFFFFF';
const SUCCESS   = '#22c55e';
const CASH_GREEN = '#16a34a';

// ── Confetti particle ─────────────────────────────────────────
function ConfettiParticle({ startX, color, delay }) {
  const y       = useRef(new Animated.Value(0)).current;
  const x       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(y,       { toValue: 400, duration: 1200, useNativeDriver: true }),
        Animated.timing(x,       { toValue: startX, duration: 1200, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.delay(900),
          Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: -20,
        left: '50%',
        width: 10,
        height: 10,
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ translateY: y }, { translateX: x }],
        opacity,
      }}
    />
  );
}

const CONFETTI_COLORS = ['#E8520A', '#FFD700', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
const confettiPieces = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  startX: (Math.random() - 0.5) * 300,
  color:  CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay:  Math.random() * 200,
}));

// ── Main Screen ───────────────────────────────────────────────
export default function CodCollectionScreen() {
  const navigation = useNavigation();
  const route      = useRoute();

  const {
    assignmentId,
    amountPaise     = 0,
    customerName    = 'Customer',
    subOrderNumber  = '',
  } = route.params || {};

  const [loading,   setLoading]   = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Pulse animation for the cash amount
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.00, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Confirm handler ───────────────────────────────────────
  async function handleConfirm() {
    if (loading || confirmed) return;
    setLoading(true);
    try {
      await collectCod(assignmentId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmed(true);
      setShowConfetti(true);
      // Auto-navigate after 2.5s
      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'RiderHome' }] });
      }, 2500);
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = err?.response?.data?.message || 'Failed to confirm collection. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Skip handler (edge case) ──────────────────────────────
  function handleSkip() {
    Alert.alert(
      'Skip COD Confirmation?',
      'You can mark it later from your COD Summary. However, please ensure you hand over the cash promptly.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip for Now',
          style: 'destructive',
          onPress: () => navigation.reset({ index: 0, routes: [{ name: 'RiderHome' }] }),
        },
      ]
    );
  }

  const amountRupees = Math.round(amountPaise / 100);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Confetti overlay */}
      {showConfetti && (
        <View style={styles.confettiContainer} pointerEvents="none">
          {confettiPieces.map(p => (
            <ConfettiParticle key={p.id} startX={p.startX} color={p.color} delay={p.delay} />
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={confirmed ? 'checkmark-circle' : 'cash-outline'}
              size={48}
              color={confirmed ? SUCCESS : CASH_GREEN}
            />
          </View>
          <Text style={styles.title}>
            {confirmed ? 'Cash Collected! ✓' : 'Collect Cash'}
          </Text>
          <Text style={styles.subtitle}>
            {confirmed
              ? 'Great job! Your COD summary has been updated.'
              : 'Please collect the payment from the customer before leaving.'}
          </Text>
        </View>

        {/* Amount card */}
        <Animated.View style={[styles.amountCard, confirmed && styles.amountCardDone,
          { transform: [{ scale: confirmed ? 1 : pulse }] }]}>
          <Text style={styles.amountLabel}>Amount to Collect</Text>
          <Text style={[styles.amount, confirmed && styles.amountDone]}>
            ₹{amountRupees.toLocaleString('en-IN')}
          </Text>
          <View style={styles.codBadge}>
            <Ionicons name="cash-outline" size={14} color={SURFACE} />
            <Text style={styles.codBadgeText}>Cash on Delivery</Text>
          </View>
        </Animated.View>

        {/* Order info */}
        {subOrderNumber ? (
          <View style={styles.infoRow}>
            <Ionicons name="receipt-outline" size={16} color={SECONDARY} />
            <Text style={styles.infoText}>Order: {subOrderNumber}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Ionicons name="person-outline" size={16} color={SECONDARY} />
          <Text style={styles.infoText}>Customer: {customerName}</Text>
        </View>

        {/* Instructions */}
        {!confirmed && (
          <View style={styles.instructionBox}>
            <Text style={styles.instructionTitle}>Before you leave:</Text>
            <View style={styles.instructionItem}>
              <Ionicons name="checkmark-circle-outline" size={18} color={CASH_GREEN} />
              <Text style={styles.instructionText}>Count the notes carefully — ₹{amountRupees}</Text>
            </View>
            <View style={styles.instructionItem}>
              <Ionicons name="checkmark-circle-outline" size={18} color={CASH_GREEN} />
              <Text style={styles.instructionText}>Ask for exact change if needed</Text>
            </View>
            <View style={styles.instructionItem}>
              <Ionicons name="checkmark-circle-outline" size={18} color={CASH_GREEN} />
              <Text style={styles.instructionText}>Tap the button below once you have the cash</Text>
            </View>
          </View>
        )}

        {/* CTA or success */}
        {confirmed ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={32} color={SUCCESS} />
            <Text style={styles.successText}>Cash confirmed. Returning to home…</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={SURFACE} />
              ) : (
                <>
                  <Ionicons name="cash" size={22} color={SURFACE} />
                  <Text style={styles.confirmBtnText}>I Have Collected ₹{amountRupees}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} disabled={loading}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  confettiContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999,
    alignItems: 'center',
  },
  scroll: {
    padding: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: SECONDARY,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },

  // Amount card
  amountCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: CASH_GREEN,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  amountCardDone: {
    borderColor: SUCCESS,
    backgroundColor: '#f0fdf4',
  },
  amountLabel: {
    fontSize: 13,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  amount: {
    fontSize: 48,
    fontWeight: '800',
    color: CASH_GREEN,
    letterSpacing: -1,
    marginBottom: 12,
  },
  amountDone: {
    color: SUCCESS,
  },
  codBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CASH_GREEN,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  codBadgeText: {
    color: SURFACE,
    fontSize: 12,
    fontWeight: '600',
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  infoText: {
    fontSize: 14,
    color: SECONDARY,
    fontWeight: '500',
  },

  // Instructions
  instructionBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginTop: 8,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: SECONDARY,
    marginBottom: 12,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },

  // CTA button
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CASH_GREEN,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 24,
    width: '100%',
    gap: 10,
    marginBottom: 14,
    shadowColor: CASH_GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    color: SURFACE,
    fontSize: 17,
    fontWeight: '700',
  },

  // Skip
  skipBtn: {
    paddingVertical: 10,
  },
  skipText: {
    fontSize: 13,
    color: '#94a3b8',
    textDecorationLine: 'underline',
  },

  // Success state
  successBox: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  successText: {
    fontSize: 15,
    color: SUCCESS,
    fontWeight: '600',
    textAlign: 'center',
  },
});
