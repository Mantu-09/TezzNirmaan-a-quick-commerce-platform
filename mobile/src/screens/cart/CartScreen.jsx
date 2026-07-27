import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import EmptyState from '../../components/common/EmptyState';
import ShopSection from '../../components/cart/ShopSection';   // P4-3B
import TierSection from '../../components/cart/TierSection';
import PromoCodeInput from '../../components/cart/PromoCodeInput'; // P1-C
import Button from '../../components/common/Button';
import { formatPaise } from '../../utils/money';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useCartStore from '../../store/cartStore';
import * as ordersApi from '../../api/orders';
import { getMyPass }  from '../../api/pass'; // P5-3

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
  const {
    items, quickItems, scheduledItems, hasBothTiers,
    isMultiShop, itemsByShop, shopIds, clearCart,
  } = useCartStore();

  // P1-C: Promo state
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError,   setPromoError]   = useState(null);

  // P5-3: Pass status — silent fetch, never blocks checkout
  const { data: passRes } = useQuery({
    queryKey: ['my-pass'],
    queryFn:  getMyPass,
    staleTime: 60 * 1000,
    retry:    false,       // don't retry on auth error (logged-out state)
  });
  const hasActivePass = passRes?.data?.subscription?.isActive === true;

  // ── Totals ───────────────────────────────────────────────────
  // For multi-shop: sum across all shops
  const quickSubtotal     = quickItems.reduce((s, i)     => s + i.unitPricePaise * i.quantity, 0);
  const scheduledSubtotal = scheduledItems.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
  const quickFee          = quickItems.length     ? calcDeliveryFee('quick',     quickSubtotal)     : 0;
  const scheduledFee      = scheduledItems.length ? calcDeliveryFee('scheduled', scheduledSubtotal) : 0;
  const grandTotalBeforeDiscount = quickSubtotal + scheduledSubtotal + quickFee + scheduledFee;
  const discountPaise     = appliedPromo?.discount_paise || 0;
  const grandTotal        = Math.max(0, grandTotalBeforeDiscount - discountPaise);

  const validatePromoMutation = useMutation({
    mutationFn: (code) => {
      const tier = quickItems.length && scheduledItems.length ? null
        : quickItems.length ? 'quick' : 'scheduled';
      return ordersApi.validatePromo(code, grandTotalBeforeDiscount, tier);
    },
    onSuccess: (result) => {
      setAppliedPromo(result?.data || result);
      setPromoError(null);
    },
    onError: (err) => {
      setPromoError(err.message || 'Invalid promo code');
      setAppliedPromo(null);
    },
  });

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoError(null);
  };

  const handleCheckout = () => {
    navigation.navigate('Checkout', { promoCode: appliedPromo?.code || null });
  };

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

  // ── Multi-shop render ────────────────────────────────────────
  if (isMultiShop) {
    const shopEntries = Object.values(itemsByShop);
    const totalDeliveries = shopEntries.reduce((n, s) => {
      return n + (s.quickItems.length > 0 ? 1 : 0) + (s.scheduledItems.length > 0 ? 1 : 0);
    }, 0);

    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Multi-shop info banner */}
          <View style={styles.multiShopBanner}>
            <Text style={styles.bannerEmoji}>🏪</Text>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>
                {shopIds.length} shops · {totalDeliveries} deliveries
              </Text>
              <Text style={styles.bannerSub}>
                Items from different shops arrive in separate deliveries. You pay once for everything.
              </Text>
            </View>
          </View>

          {/* Per-shop sections */}
          {shopEntries.map((shopGroup, idx) => (
            <ShopSection
              key={shopGroup.shopId}
              shopId={shopGroup.shopId}
              shopName={shopGroup.shopName}
              quickItems={shopGroup.quickItems}
              scheduledItems={shopGroup.scheduledItems}
              isFirst={idx === 0}
            />
          ))}

          {/* Grand total */}
          <View style={[styles.grandTotalBox, { marginTop: Spacing[4] }]}>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Basket Total</Text>
              <Text style={[styles.grandValue, discountPaise > 0 && styles.grandValueStruck]}>
                {formatPaise(grandTotalBeforeDiscount)}
              </Text>
            </View>
            {discountPaise > 0 && (
              <View style={styles.grandRow}>
                <Text style={styles.grandLabel}>Promo Discount</Text>
                <Text style={styles.discountValue}>- {formatPaise(discountPaise)}</Text>
              </View>
            )}
            {discountPaise > 0 && (
              <View style={[styles.grandRow, styles.finalRow]}>
                <Text style={styles.grandLabelFinal}>You Pay</Text>
                <Text style={styles.grandValueFinal}>{formatPaise(grandTotal)}</Text>
              </View>
            )}
            <Text style={styles.grandNote}>
              Includes delivery fees for all {shopIds.length} shops
            </Text>
          </View>

          {/* P1-C: Promo code input */}
          <PromoCodeInput
            appliedPromo={appliedPromo}
            onApply={(code) => validatePromoMutation.mutate(code)}
            onRemove={handleRemovePromo}
            loading={validatePromoMutation.isPending}
            error={promoError}
          />

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
            <Text style={styles.checkoutItems}>
              {items.length} item{items.length !== 1 ? 's' : ''} · {shopIds.length} shops
            </Text>
          </View>
          <Button
            variant="primary"
            size="md"
            onPress={handleCheckout}
            style={styles.checkoutBtn}
          >
            Proceed to Checkout →
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // ── Single-shop render (V1 — unchanged behaviour) ────────────
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Mixed-tier explainer banner — shown only when both tiers present (single shop) */}
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
            <Text style={[styles.grandValue, discountPaise > 0 && styles.grandValueStruck]}>
              {formatPaise(grandTotalBeforeDiscount)}
            </Text>
          </View>
          {discountPaise > 0 && (
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Promo Discount</Text>
              <Text style={styles.discountValue}>- {formatPaise(discountPaise)}</Text>
            </View>
          )}
          {discountPaise > 0 && (
            <View style={[styles.grandRow, styles.finalRow]}>
              <Text style={styles.grandLabelFinal}>You Pay</Text>
              <Text style={styles.grandValueFinal}>{formatPaise(grandTotal)}</Text>
            </View>
          )}
          {hasBothTiers && (
            <Text style={styles.grandNote}>Includes charges for both deliveries</Text>
          )}
        </View>

        {/* P5-3: Pass banner — free delivery notice */}
        {hasActivePass && (quickFee > 0 || scheduledFee > 0) && (
          <View style={styles.passBanner}>
            <Text style={styles.passEmoji}>🎫</Text>
            <View style={styles.passText}>
              <Text style={styles.passTitle}>Pass: Free delivery applied</Text>
              <Text style={styles.passSub}>
                Delivery fee{(quickFee > 0 && scheduledFee > 0) ? 's' : ''} waived at checkout
              </Text>
            </View>
          </View>
        )}

        {/* P1-C: Promo code input */}
        <PromoCodeInput
          appliedPromo={appliedPromo}
          onApply={(code) => validatePromoMutation.mutate(code)}
          onRemove={handleRemovePromo}
          loading={validatePromoMutation.isPending}
          error={promoError}
        />

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
          onPress={handleCheckout}
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

  // Multi-shop banner
  multiShopBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
    backgroundColor: Colors.primaryLight || '#FFF5EB',
    borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[4],
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  bannerEmoji: { fontSize: 26, marginTop: 2 },
  bannerText:  { flex: 1 },
  bannerTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.primary, marginBottom: 4 },
  bannerSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 18 },

  // P5-3: Pass banner
  passBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing[3],
    backgroundColor: '#ECFDF5',
    borderRadius:    BorderRadius.xl,
    padding:         Spacing[3],
    marginBottom:    Spacing[3],
    borderWidth:     1,
    borderColor:     '#6EE7B7',
  },
  passEmoji: { fontSize: 22 },
  passText:  { flex: 1 },
  passTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      '#065F46',
  },
  passSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      '#059669',
    marginTop:  2,
  },

  // Single-shop split-tier banner
  splitBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
    backgroundColor: Colors.infoLight, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[4],
    borderWidth: 1, borderColor: Colors.info,
  },
  splitEmoji:    { fontSize: 24 },
  splitText:     { flex: 1 },
  splitTitle:    { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.info, marginBottom: 4 },
  splitSubtitle: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 18 },

  grandTotalBox: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[3], ...Shadow.sm,
  },
  grandRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  finalRow:  { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing[2], paddingTop: Spacing[2] },
  grandLabel: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  grandValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text },
  grandValueStruck: { textDecorationLine: 'line-through', color: Colors.textTertiary, fontSize: Typography.size.base },
  discountValue:  { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.success || '#16a34a' },
  grandLabelFinal:{ fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  grandValueFinal:{ fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.primary },
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
