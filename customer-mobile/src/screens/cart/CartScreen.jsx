/**
 * CartScreen.jsx — Blinkit-Style Cart
 * ─────────────────────────────────────────────────────
 * Layout:
 *   1. Store status card (open/closed + item count)
 *   2. Item rows (image | name + size | qty stepper | price)
 *   3. Bill Details (items total + delivery + handling + grand total)
 *   4. Cancellation Policy card
 *   5. Promo code input
 *   6. Sticky bottom bar:
 *        Left:  grand total + "TOTAL" label
 *        Right: "Login to Proceed ->" (guest) OR "Proceed to Checkout ->" (auth'd)
 *
 * Auth gate: Tapping checkout as a guest opens AuthBottomSheet (mobile+OTP).
 *            After login, cart syncs and user goes to Checkout.
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import EmptyState    from '../../components/common/EmptyState';
import PromoCodeInput from '../../components/cart/PromoCodeInput';
import AuthBottomSheet from '../../components/common/AuthBottomSheet';
import { formatPaise } from '../../utils/money';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useCartStore  from '../../store/cartStore';
import useAuthStore  from '../../store/authStore';
import * as ordersApi from '../../api/orders';
import { getMyPass }  from '../../api/pass';
import { openSupportChat } from '../../services/freshchat';

// ── Fee constants (matching backend) ────────────────────────
const QUICK_FEE            = 4000;   // ₹40
const SCHEDULED_FEE        = 10000;  // ₹100
const QUICK_FREE_ABOVE     = 50000;  // ₹500
const SCHEDULED_FREE_ABOVE = 200000; // ₹2000
const HANDLING_FEE         = 200;    // ₹2 flat handling fee

function calcDeliveryFee(tier, subtotalPaise) {
  if (tier === 'quick')     return subtotalPaise >= QUICK_FREE_ABOVE     ? 0 : QUICK_FEE;
  if (tier === 'scheduled') return subtotalPaise >= SCHEDULED_FREE_ABOVE ? 0 : SCHEDULED_FEE;
  return 0;
}

// ── CartItemRow: single product in Blinkit style ─────────────
function CartItemRow({ item, onIncrease, onDecrease }) {
  const priceRs = Math.round((item.unitPricePaise || 0) / 100);
  return (
    <View style={styles.itemRow}>
      {/* Product image */}
      <View style={styles.itemImgWrap}>
        {item.imageUrl
          ? <Image source={{ uri: item.imageUrl }} style={styles.itemImg} resizeMode="cover" />
          : <View style={[styles.itemImg, styles.itemImgPlaceholder]}>
              <Text style={{ fontSize: 22 }}>🏗️</Text>
            </View>}
      </View>

      {/* Info */}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.itemUnit}>{item.unit}</Text>
        <Text style={styles.itemPrice}>₹{(priceRs * item.quantity).toLocaleString('en-IN')}</Text>
      </View>

      {/* Qty stepper */}
      <View style={styles.qtyControl}>
        <TouchableOpacity style={styles.qtyBtn} onPress={onDecrease} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="remove" size={16} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.qty}>{item.quantity}</Text>
        <TouchableOpacity style={styles.qtyBtn} onPress={onIncrease} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── BillRow helper ───────────────────────────────────────────
function BillRow({ label, value, bold, info, isTotal }) {
  return (
    <View style={[styles.billRow, isTotal && styles.billRowTotal]}>
      <View style={styles.billLabelRow}>
        <Text style={[styles.billLabel, bold && styles.billLabelBold, isTotal && styles.billLabelTotal]}>
          {label}
        </Text>
        {info && (
          <Ionicons name="information-circle-outline" size={14} color={Colors.textTertiary} style={{ marginLeft: 4 }} />
        )}
      </View>
      <Text style={[styles.billValue, bold && styles.billValueBold, isTotal && styles.billValueTotal]}>
        {value}
      </Text>
    </View>
  );
}

export default function CartScreen({ navigation }) {
  const {
    items, quickItems, scheduledItems, hasBothTiers,
    isMultiShop, itemsByShop, shopIds, clearCart,
    updateQuantity, removeItem,
  } = useCartStore();

  const { isAuthenticated } = useAuthStore();
  const [showAuthSheet, setShowAuthSheet] = useState(false);

  // P1-C: Promo state
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError,   setPromoError]   = useState(null);

  // P5-3: Pass status
  const { data: passRes } = useQuery({
    queryKey: ['my-pass'],
    queryFn:  getMyPass,
    staleTime: 60 * 1000,
    retry:    false,
    enabled:  isAuthenticated,
  });
  const hasActivePass = passRes?.data?.subscription?.isActive === true;

  // ── Totals ───────────────────────────────────────────────────
  const quickSubtotal     = quickItems.reduce((s, i)     => s + i.unitPricePaise * i.quantity, 0);
  const scheduledSubtotal = scheduledItems.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
  const itemsSubtotal     = quickSubtotal + scheduledSubtotal;
  const quickFee          = quickItems.length     ? calcDeliveryFee('quick',     quickSubtotal)     : 0;
  const scheduledFee      = scheduledItems.length ? calcDeliveryFee('scheduled', scheduledSubtotal) : 0;
  const deliveryFee       = quickFee + scheduledFee;
  const handlingFee       = items.length > 0 ? HANDLING_FEE : 0;
  const grandTotalBeforeDiscount = itemsSubtotal + deliveryFee + handlingFee;
  const discountPaise     = appliedPromo?.discount_paise || 0;
  const grandTotal        = Math.max(0, grandTotalBeforeDiscount - discountPaise);

  const validatePromoMutation = useMutation({
    mutationFn: (code) => {
      const tier = quickItems.length && scheduledItems.length ? null
        : quickItems.length ? 'quick' : 'scheduled';
      return ordersApi.validatePromo(code, grandTotalBeforeDiscount, tier);
    },
    onSuccess: (result) => { setAppliedPromo(result?.data || result); setPromoError(null); },
    onError:   (err)    => { setPromoError(err.message || 'Invalid promo code'); setAppliedPromo(null); },
  });

  const handleRemovePromo = () => { setAppliedPromo(null); setPromoError(null); };

  const handleCheckout = () => {
    if (!isAuthenticated) {
      setShowAuthSheet(true);
      return;
    }
    navigation.navigate('Checkout', { promoCode: appliedPromo?.code || null });
  };

  const handleAuthSuccess = () => {
    setShowAuthSheet(false);
    // Small delay so auth store updates before navigation
    setTimeout(() => {
      navigation.navigate('Checkout', { promoCode: appliedPromo?.code || null });
    }, 200);
  };

  // ── Empty cart ───────────────────────────────────────────────
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

  // ── Render items per tier (or per shop for multi-shop) ───────
  const renderItems = (itemList) =>
    itemList.map((item) => (
      <CartItemRow
        key={item.productId + item.shopId}
        item={item}
        onIncrease={() => updateQuantity(item.productId, item.quantity + 1, item.shopId)}
        onDecrease={() => updateQuantity(item.productId, item.quantity - 1, item.shopId)}
      />
    ));

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Store status card ── */}
        <View style={styles.storeCard}>
          <View style={styles.storeIcon}>
            <Text style={{ fontSize: 26 }}>🏪</Text>
          </View>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>TezzNirmaan Store</Text>
            <Text style={styles.storeStatus}>
              Shipment of {items.length} item{items.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* ── Quick tier ── */}
        {quickItems.length > 0 && (
          <View style={styles.tierBlock}>
            <View style={styles.tierHeader}>
              <Ionicons name="flash" size={14} color={Colors.primary} />
              <Text style={styles.tierLabel}>Quick Delivery (60–90 min)</Text>
            </View>
            {renderItems(quickItems)}
          </View>
        )}

        {/* ── Scheduled tier ── */}
        {scheduledItems.length > 0 && (
          <View style={styles.tierBlock}>
            <View style={styles.tierHeader}>
              <Ionicons name="calendar-outline" size={14} color="#1D4ED8" />
              <Text style={[styles.tierLabel, { color: '#1D4ED8' }]}>Scheduled Delivery</Text>
            </View>
            {renderItems(scheduledItems)}
          </View>
        )}

        {/* ── Bill Details ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bill details</Text>
          <BillRow
            label="Items total"
            value={formatPaise(itemsSubtotal)}
            info
          />
          <BillRow
            label="Delivery charge"
            value={deliveryFee === 0 ? 'FREE' : formatPaise(deliveryFee)}
            info
          />
          <BillRow
            label="Handling charge"
            value={formatPaise(handlingFee)}
            info
          />
          {discountPaise > 0 && (
            <BillRow
              label="Promo discount"
              value={`- ${formatPaise(discountPaise)}`}
            />
          )}
          <View style={styles.billDivider} />
          <BillRow
            label="Grand total"
            value={formatPaise(grandTotal)}
            bold
            isTotal
            info
          />
        </View>

        {/* ── Pass banner ── */}
        {hasActivePass && deliveryFee > 0 && (
          <View style={styles.passBanner}>
            <Text style={styles.passEmoji}>🎫</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.passTitle}>Pass: Free delivery applied</Text>
              <Text style={styles.passSub}>Delivery fee waived at checkout</Text>
            </View>
          </View>
        )}

        {/* ── Cancellation Policy ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cancellation Policy</Text>
          <Text style={styles.policyText}>
            Orders cannot be cancelled once packed for delivery. In case of
            unexpected delays, a refund will be provided, if applicable.
          </Text>
        </View>

        {/* ── Promo code ── */}
        <PromoCodeInput
          appliedPromo={appliedPromo}
          onApply={(code) => validatePromoMutation.mutate(code)}
          onRemove={handleRemovePromo}
          loading={validatePromoMutation.isPending}
          error={promoError}
        />

        {/* ── Clear cart ── */}
        <TouchableOpacity style={styles.clearBtn} onPress={clearCart}>
          <Ionicons name="trash-outline" size={14} color={Colors.error} />
          <Text style={styles.clearText}>Clear cart</Text>
        </TouchableOpacity>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* ── Sticky checkout bar ── */}
      <View style={styles.checkoutBar}>
        <View style={styles.checkoutLeft}>
          <Text style={styles.checkoutTotal}>{formatPaise(grandTotal)}</Text>
          <Text style={styles.checkoutLabel}>TOTAL</Text>
        </View>

        {/* Help FAB */}
        <TouchableOpacity
          style={styles.helpFab}
          onPress={() => openSupportChat()}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkoutBtn}
          onPress={handleCheckout}
          activeOpacity={0.88}
        >
          <Text style={styles.checkoutBtnText}>
            {isAuthenticated ? 'Proceed to Checkout' : 'Login to Proceed'}
            {'  >'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Auth bottom sheet (guest checkout) ── */}
      <AuthBottomSheet
        visible={showAuthSheet}
        onClose={() => setShowAuthSheet(false)}
        onSuccess={handleAuthSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingTop: Spacing[3] },

  // ── Store status card ────────────────────────────────────────
  storeCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing[4], marginBottom: Spacing[3],
    borderRadius: BorderRadius.xl,
    padding: Spacing[4],
    ...Shadow.sm,
  },
  storeIcon: {
    width: 48, height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  storeInfo: { flex: 1 },
  storeName: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text },
  storeStatus: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },

  // ── Tier blocks ──────────────────────────────────────────────
  tierBlock: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing[4], marginBottom: Spacing[3],
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  tierHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[2],
    backgroundColor: Colors.primary + '10',
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tierLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },

  // ── Cart item rows ───────────────────────────────────────────
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: Spacing[3],
  },
  itemImgWrap: {
    width: 56, height: 56,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface2,
  },
  itemImg:           { width: '100%', height: '100%' },
  itemImgPlaceholder:{ alignItems: 'center', justifyContent: 'center' },
  itemInfo: { flex: 1 },
  itemName: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text, marginBottom: 2 },
  itemUnit: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: 4 },
  itemPrice:{ fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.text },

  qtyControl: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 30, height: 34,
    alignItems: 'center', justifyContent: 'center',
  },
  qty: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: '#fff',
    minWidth: 28,
    textAlign: 'center',
  },

  // ── Cards (Bill Details, Cancellation Policy) ────────────────
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing[4], marginBottom: Spacing[3],
    borderRadius: BorderRadius.xl,
    padding: Spacing[4],
    ...Shadow.sm,
  },
  cardTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.text,
    marginBottom: Spacing[3],
  },

  // ── Bill rows ────────────────────────────────────────────────
  billRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing[2],
  },
  billRowTotal: { marginTop: Spacing[1] },
  billLabelRow: { flexDirection: 'row', alignItems: 'center' },
  billLabel:      { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  billLabelBold:  { fontFamily: Typography.fontFamily.bold, color: Colors.text },
  billLabelTotal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.text },
  billValue:      { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text },
  billValueBold:  { fontFamily: Typography.fontFamily.bold },
  billValueTotal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  billDivider: {
    height: 1, backgroundColor: Colors.border,
    marginVertical: Spacing[2],
  },

  // ── Cancellation policy ──────────────────────────────────────
  policyText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // ── Pass banner ──────────────────────────────────────────────
  passBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: '#ECFDF5',
    marginHorizontal: Spacing[4], marginBottom: Spacing[3],
    borderRadius: BorderRadius.xl,
    padding: Spacing[3],
    borderWidth: 1, borderColor: '#6EE7B7',
  },
  passEmoji: { fontSize: 22 },
  passTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: '#065F46' },
  passSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: '#059669', marginTop: 2 },

  clearBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: Spacing[4] },
  clearText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.error },

  // ── Sticky checkout bar ──────────────────────────────────────
  checkoutBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    borderTopWidth: 1, borderTopColor: Colors.border,
    ...Shadow.xl,
    gap: Spacing[2],
  },
  checkoutLeft: { flex: 0 },
  checkoutTotal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text },
  checkoutLabel: { fontFamily: Typography.fontFamily.medium, fontSize: 10, color: Colors.textSecondary, letterSpacing: 0.5 },
  helpFab: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    ...Shadow.sm,
  },
  checkoutBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing[3],
    alignItems: 'center',
  },
  checkoutBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: '#fff',
  },
});
