import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import EmptyState from '../../components/common/EmptyState';
import TierSection from '../../components/cart/TierSection';
import Button from '../../components/common/Button';
import { formatPaise } from '../../utils/money';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useCartStore from '../../store/cartStore';

// Flat delivery fees matching backend constants (paise)
const QUICK_FEE     = 4000;   // ₹40
const SCHEDULED_FEE = 10000;  // ₹100
const QUICK_FREE_ABOVE     = 50000;  // ₹500
const SCHEDULED_FREE_ABOVE = 200000; // ₹2000

function calcDeliveryFee(tier, subtotalPaise) {
  if (tier === 'quick')     return subtotalPaise >= QUICK_FREE_ABOVE     ? 0 : QUICK_FEE;
  if (tier === 'scheduled') return subtotalPaise >= SCHEDULED_FREE_ABOVE ? 0 : SCHEDULED_FEE;
  return 0;
}

export default function CartScreen({ navigation }) {
  const { items, quickItems, scheduledItems, hasBothTiers, clearCart } = useCartStore();

  const quickSubtotal     = quickItems.reduce((s, i)     => s + i.unitPricePaise * i.quantity, 0);
  const scheduledSubtotal = scheduledItems.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
  const quickFee          = quickItems.length     ? calcDeliveryFee('quick',     quickSubtotal)     : 0;
  const scheduledFee      = scheduledItems.length ? calcDeliveryFee('scheduled', scheduledSubtotal) : 0;
  const grandTotal        = quickSubtotal + scheduledSubtotal + quickFee + scheduledFee;

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          variant="cart"
          onAction={() => navigation.navigate('HomeTab')}
          actionLabel="Browse Products"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Mixed-tier explainer banner — shown only when both tiers present */}
        {hasBothTiers && (
          <View style={styles.splitBanner}>
            <Text style={styles.splitEmoji}>📦📦</Text>
            <View style={styles.splitText}>
              <Text style={styles.splitTitle}>2 separate deliveries</Text>
              <Text style={styles.splitSubtitle}>
                Your cart has Quick and Scheduled items. They'll arrive in separate deliveries — that's normal!
              </Text>
            </View>
          </View>
        )}

        {/* Quick tier section */}
        {quickItems.length > 0 && (
          <TierSection
            tier="quick"
            items={quickItems}
            subtotalPaise={quickSubtotal}
            deliveryFeePaise={quickFee}
          />
        )}

        {/* Scheduled tier section */}
        {scheduledItems.length > 0 && (
          <TierSection
            tier="scheduled"
            items={scheduledItems}
            subtotalPaise={scheduledSubtotal}
            deliveryFeePaise={scheduledFee}
          />
        )}

        {/* Grand total */}
        <View style={styles.grandTotalBox}>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Grand Total</Text>
            <Text style={styles.grandValue}>{formatPaise(grandTotal)}</Text>
          </View>
          {hasBothTiers && (
            <Text style={styles.grandNote}>Includes charges for both deliveries</Text>
          )}
        </View>

        {/* Clear cart */}
        <TouchableOpacity style={styles.clearBtn} onPress={clearCart}>
          <Ionicons name="trash-outline" size={14} color={Colors.error} />
          <Text style={styles.clearText}>Clear cart</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky checkout bar */}
      <View style={styles.checkoutBar}>
        <View>
          <Text style={styles.checkoutTotal}>{formatPaise(grandTotal)}</Text>
          <Text style={styles.checkoutItems}>{items.length} item{items.length !== 1 ? 's' : ''}</Text>
        </View>
        <Button
          variant="primary"
          size="md"
          onPress={() => navigation.navigate('Checkout')}
          style={styles.checkoutBtn}
        >
          Proceed to Checkout →
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[4] },

  splitBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
    backgroundColor: Colors.infoLight, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[4],
    borderWidth: 1, borderColor: Colors.info,
  },
  splitEmoji:    { fontSize: 24 },
  splitText:     { flex: 1 },
  splitTitle:    { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.info, marginBottom: 4 },
  splitSubtitle: { fontFamily: Typography.fontFamily.regular,  fontSize: Typography.size.sm,   color: Colors.textSecondary, lineHeight: 18 },

  grandTotalBox: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[3], ...Shadow.sm,
  },
  grandRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grandLabel: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  grandValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text },
  grandNote:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: Spacing[2] },

  clearBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: Spacing[3] },
  clearText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.error },

  checkoutBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, padding: Spacing[4],
    borderTopWidth: 1, borderTopColor: Colors.border, ...Shadow.xl,
  },
  checkoutTotal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  checkoutItems: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  checkoutBtn:   { flex: 1, marginLeft: Spacing[4] },
});
