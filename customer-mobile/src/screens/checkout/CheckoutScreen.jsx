import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import RazorpayCheckout from 'react-native-razorpay';
import Constants from 'expo-constants';
import { format, addDays } from 'date-fns';
import * as ordersApi from '../../api/orders';
import { checkServiceability } from '../../api/cities'; // Session K

import { getAvailableSlots } from '../../api/slots';      // B6
import { getWallet } from '../../api/wallet';             // P3-C
import { getCheckoutBenefits } from '../../api/b2b';      // P6-6
import Button from '../../components/common/Button';
import { formatPaise } from '../../utils/money';
import { formatSlot, getTomorrowSlots } from '../../utils/date';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useCartStore from '../../store/cartStore';
import useAuthStore from '../../store/authStore';

const RAZORPAY_KEY = Constants.expoConfig?.extra?.razorpayKeyId || process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;

// P3-C: wallet payment methods are injected dynamically after wallet balance is fetched
const BASE_PAYMENT_METHODS = [
  { id: 'upi',  label: 'UPI / PhonePe / GPay', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Credit / Debit Card',  icon: 'card-outline'           },
  { id: 'cod',  label: 'Cash on Delivery',      icon: 'cash-outline'           },
];

// Flat delivery fee logic (mirrors backend constants)
const QUICK_FEE = 4000;
const SCHED_FEE = 10000;
function deliveryFee(tier, subtotal) {
  if (tier === 'quick')     return subtotal >= 50000  ? 0 : QUICK_FEE;
  if (tier === 'scheduled') return subtotal >= 200000 ? 0 : SCHED_FEE;
  return 0;
}

export default function CheckoutScreen({ navigation, route }) {
  const { user }       = useAuthStore();
  const { items, quickItems, scheduledItems, hasBothTiers, isMultiShop, shopIds, clearCart } = useCartStore();

  // P1-C: Promo code passed from CartScreen
  const promoCode = route?.params?.promoCode || null;

  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [selectedSlot,      setSelectedSlot]      = useState(null);
  const [paymentMethod,     setPaymentMethod]     = useState('upi');
  const [placingOrder,      setPlacingOrder]      = useState(false);
  const [slotDate,          setSlotDate]          = useState(null); // 'YYYY-MM-DD'
  // P6-6: B2B contractor fields
  const [poNumber,          setPoNumber]          = useState('');
  const [wantGstInvoice,    setWantGstInvoice]    = useState(false);
  const [useCredit,         setUseCredit]         = useState(false);

  // Session F — Address-change cart revalidation
  // Whenever the customer picks a different delivery address, we immediately
  // call previewOrder/previewBasket so the backend validates stock, listing
  // status, shop geo-range, and server-side prices for the NEW address.
  // The Place Order button is blocked until revalidation succeeds.
  const [revalidating,    setRevalidating]    = useState(false);
  const [revalidationErr, setRevalidationErr] = useState(null);   // string | null
  const [priceChanges,    setPriceChanges]    = useState([]);     // [{name, oldPaise, newPaise}]
  const [revalidatedId,   setRevalidatedId]   = useState(null);   // last addressId that passed

  // TD-10: Guard against empty cart checkout.
  // If the user lands here with no items (e.g., after placing an order,
  // deep-linking, or session restore), redirect back to Cart immediately.
  useEffect(() => {
    if (items.length === 0) {
      navigation.replace('Cart');
    }
  }, [items.length, navigation]);

  // Determine shop from first scheduled item (all items share one shop in TezzNirmaan)
  const shopId = items[0]?.shopId;

  // B6: pick the next available weekday as default slot date
  const defaultSlotDate = useMemo(() => {
    const tomorrow = addDays(new Date(), 1);
    return format(tomorrow, 'yyyy-MM-dd');
  }, []);

  const activeSlotDate = slotDate || defaultSlotDate;

  const quickSubtotal = quickItems.reduce((s, i)     => s + i.unitPricePaise * i.quantity, 0);
  const schedSubtotal = scheduledItems.reduce((s, i) => s + i.unitPricePaise * i.quantity, 0);
  const quickFee      = quickItems.length     ? deliveryFee('quick',     quickSubtotal) : 0;
  const schedFee      = scheduledItems.length ? deliveryFee('scheduled', schedSubtotal) : 0;
  const grandTotalBeforePromo = quickSubtotal + schedSubtotal + quickFee + schedFee;

  // P6-6: Fetch B2B contractor benefits for this order total (fires when total > 0)
  const { data: b2bData } = useQuery({
    queryKey: ['b2b-benefits', grandTotalBeforePromo],
    queryFn:  () => getCheckoutBenefits(grandTotalBeforePromo),
    enabled:  grandTotalBeforePromo > 0,
    staleTime: 5 * 60 * 1000,
  });
  const b2bBenefits  = b2bData || {};
  const isContractor = b2bBenefits.isContractor === true;
  const b2bDiscount  = isContractor ? (b2bBenefits.discountPaise || 0) : 0;
  // P1-C: Discount is server-confirmed; we show an optimistic preview here only.
  // P6-6: B2B discount is also optimistic — server re-validates via contractor profile.
  const grandTotal = Math.max(0, grandTotalBeforePromo - b2bDiscount); // server will apply real discount

  // P3-C: Fetch wallet balance for the current user
  const { data: walletData } = useQuery({
    queryKey: ['wallet'],
    queryFn:  () => getWallet(5),   // only need balance, not full history
    staleTime: 30 * 1000,
  });
  const walletBalance    = walletData?.balance_paise || 0;
  const walletCoverage   = Math.min(walletBalance, grandTotal);
  const walletCoversAll  = walletCoverage >= grandTotal;
  const afterWallet      = Math.max(0, grandTotal - walletCoverage);

  // Build dynamic payment methods list
  const PAYMENT_METHODS = [
    ...(walletBalance > 0 ? [{
      id:    'wallet',
      label: walletCoversAll
        ? `TezzWallet  (${formatPaise(walletBalance)} — covers full order)`
        : `TezzWallet  (${formatPaise(walletBalance)} — covers ${formatPaise(walletCoverage)})`,
      icon:  'wallet-outline',
    }] : []),
    ...BASE_PAYMENT_METHODS,
  ];

  // Fetch saved addresses
  const { data: addrData, isLoading: addrLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn:  ordersApi.getAddresses,
  });
  const addresses = addrData?.addresses || [];

  // Session F: auto-select default address when addresses first load,
  // and immediately revalidate against it.
  // useEffect (not onSuccess) so we always have the latest handleAddressChange closure.
  useEffect(() => {
    if (!addrData) return;
    const def = addrData.addresses?.find(a => a.is_default) || addrData.addresses?.[0];
    if (def && !selectedAddressId) handleAddressChange(def.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrData]); // intentionally omit handleAddressChange from deps — it changes every render
                  // but the guard inside (newId === selectedId → return) prevents re-runs

  // B6: Fetch real slot availability from server
  const shouldFetchSlots = scheduledItems.length > 0 && !!shopId;
  const { data: slotData, isLoading: slotsLoading } = useQuery({
    queryKey: ['available-slots', shopId, activeSlotDate],
    queryFn:  () => getAvailableSlots(shopId, activeSlotDate),
    enabled:  shouldFetchSlots,
    staleTime: 2 * 60 * 1000, // 2 min — slots fill up
  });
  // Fallback to static slots if shop has no templates configured
  const serverSlots = slotData?.slots || [];
  const staticSlots = getTomorrowSlots();
  const displaySlots = serverSlots.length > 0 ? serverSlots : staticSlots.map(s => ({
    template_id: s.id,
    start_time:  s.start.split('T')[1]?.slice(0, 5) || s.start,
    end_time:    s.end.split('T')[1]?.slice(0, 5)   || s.end,
    label:       s.label,
    available:   true,
    booking_count: 0,
    max_orders:    10,
  }));

  // ── Session F: Address-change revalidation ──────────────────────────────
  // Called every time the customer taps a different delivery address.
  // Runs previewOrder (single-shop) or previewBasket (multi-shop) to let
  // the backend check: stock, listing status, shop geo-range, server prices.
  //
  // Possible outcomes:
  //   A) Backend throws → items unavailable / out of range → show error banner
  //   B) Backend returns changed prices → surface price-change banner, let
  //      customer confirm before enabling Place Order
  //   C) Backend returns same prices → revalidation passes silently
  const handleAddressChange = async (newAddressId) => {
    if (newAddressId === selectedAddressId) return;

    setSelectedAddressId(newAddressId);
    setRevalidationErr(null);
    setPriceChanges([]);
    setRevalidatedId(null);

    if (!newAddressId) return;

    setRevalidating(true);
    try {
      // The mobile API client interceptor unwraps { success, data } automatically,
      // so previewOrder/previewBasket return the data payload directly.
      const previewData = isMultiShop
        ? await ordersApi.previewBasket(newAddressId)
        : await ordersApi.previewOrder(newAddressId);

      // ── Price-change detection ───────────────────────────────────────────
      // Extract all server-side items from the preview response to compare
      // against cart store prices.
      //
      // previewBasket returns { shops: { [shopId]: { tiers: { quick: { items }, scheduled: { items } } } } }
      // previewOrder  returns { tiers: { quick: { items }, scheduled: { items } } }
      const extractTierItems = (tiers) => [
        ...(tiers?.quick?.items     || []),
        ...(tiers?.scheduled?.items || []),
      ];

      const serverItems = isMultiShop
        ? Object.values(previewData.shops || {}).flatMap(s => extractTierItems(s.tiers))
        : extractTierItems(previewData.tiers);

      const changes = [];
      for (const si of serverItems) {
        const cartItem = items.find(ci => ci.productId === si.productId);
        if (!cartItem) continue;
        if (si.unitPricePaise !== cartItem.unitPricePaise) {
          changes.push({
            name:      si.productName  || cartItem.name,
            oldPaise:  cartItem.unitPricePaise,
            newPaise:  si.unitPricePaise,
          });
        }
      }

      if (changes.length > 0) {
        // Surface price changes — customer must confirm before proceeding.
        setPriceChanges(changes);
        // Do NOT set revalidatedId yet — user must acknowledge first.
      } else {
        // All clear — revalidation passed, no price changes.
        setRevalidatedId(newAddressId);
      }
    } catch (err) {
      // The backend throws with a clear message:
      //   "\"Product name\" is currently out of stock"
      //   "Delivery not available for Quick items at your address (X km away)"
      //   etc.
      setRevalidationErr(err.message || 'This address cannot be delivered to. Please check your cart.');
    } finally {
      setRevalidating(false);
    }
  };

  // Customer explicitly confirms they accept price changes → unblock checkout.
  const handleConfirmPriceChanges = () => {
    setPriceChanges([]);
    setRevalidatedId(selectedAddressId);
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) { Alert.alert('Address required', 'Please select a delivery address.'); return; }
    if (scheduledItems.length > 0 && !selectedSlot) { Alert.alert('Slot required', 'Please choose a delivery slot for scheduled items.'); return; }
    if (selectedSlot && !selectedSlot.available) { Alert.alert('Slot full', 'This slot is fully booked. Please select another.'); return; }

    // Session K: Serviceability gate — verify delivery address is in service area
    const selectedAddr = (addrData?.addresses || []).find(a => a.id === selectedAddressId);
    if (selectedAddr?.lat && selectedAddr?.lng) {
      try {
        const svc = await checkServiceability(selectedAddr.lat, selectedAddr.lng);
        if (!svc.serviceable) {
          Alert.alert(
            'Not Serviceable',
            svc.reason || 'We don\'t deliver to this address yet.' +
              (svc.nearest_city ? `\n\nNearest area: ${svc.nearest_city.name}` : ''),
            [{ text: 'OK' }]
          );
          return;
        }
      } catch (_) {
        // Non-fatal: if serviceability check fails (network error), allow order
      }
    }

    setPlacingOrder(true);

    try {
      const walletCoversAllNow = walletBalance >= grandTotal;
      const effectivePaymentMethod =
        paymentMethod === 'wallet' && !walletCoversAllNow
          ? 'wallet_partial'
          : paymentMethod;

      let orderRes;

      if (isMultiShop) {
        orderRes = await ordersApi.placeBasketOrder({
          addressId:     selectedAddressId,
          paymentMethod: useCredit ? 'credit' : effectivePaymentMethod,
          promoCode:     promoCode || undefined,
          // P6-6: B2B fields
          poNumber:        poNumber || undefined,
          wantGstInvoice:  wantGstInvoice,
        });
      } else {
        orderRes = await ordersApi.placeOrder({
          addressId:     selectedAddressId,
          paymentMethod: useCredit ? 'credit' : effectivePaymentMethod,
          promoCode:     promoCode || undefined,
          wallet_amount_paise:
            paymentMethod === 'wallet' && !walletCoversAllNow
              ? walletBalance
              : undefined,
          scheduledSlot: selectedSlot
            ? {
                start: `${activeSlotDate}T${selectedSlot.start_time}:00`,
                end:   `${activeSlotDate}T${selectedSlot.end_time}:00`,
              }
            : undefined,
          // P6-6: B2B fields
          poNumber:       poNumber || undefined,
          wantGstInvoice: wantGstInvoice,
        });
      }

      // For baskets, orderId is the first shop order; basketId is the grouping key
      const orderId   = orderRes?.orders?.[0]?.orderId || orderRes?.orderId || orderRes?.order?.id;
      const basketId  = orderRes?.basketId || null;
      const serverAmountPaise = orderRes?.basketTotalPaise || orderRes?.totalAmountPaise || orderRes?.total_amount_paise || grandTotal;

      // Online payment — open Razorpay native checkout
      if (
        paymentMethod !== 'cod' &&
        paymentMethod !== 'wallet' &&
        paymentMethod !== 'wallet_partial' &&
        orderRes?.razorpayOrderId
      ) {
        await new Promise((resolve, reject) => {
          RazorpayCheckout.open({
            description:  basketId ? `TezzNirmaan — ${shopIds?.length || 1} shops` : 'TezzNirmaan Order',
            image:        'https://your-logo-url.com/logo.png',
            currency:     'INR',
            key:          RAZORPAY_KEY,
            amount:       serverAmountPaise,
            name:         'TezzNirmaan',
            order_id:     orderRes.razorpayOrderId,
            prefill: {
              email:   user?.email || '',
              contact: user?.phone || '',
              name:    user?.full_name || '',
            },
            theme: { color: Colors.primary },
          }).then(async (data) => {
            await ordersApi.verifyPayment({
              orderId,
              razorpayOrderId:   data.razorpay_order_id,
              razorpayPaymentId: data.razorpay_payment_id,
              razorpaySignature: data.razorpay_signature,
            });
            resolve();
          }).catch(reject);
        });
      }

      clearCart();
      navigation.replace('OrderConfirmation', { orderId, basketId, orders: orderRes?.orders || null });
    } catch (e) {
      Alert.alert('Order failed', e.message || 'Something went wrong. Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Split banner */}
        {hasBothTiers && (
          <View style={styles.splitBanner}>
            <Ionicons name="information-circle" size={20} color={Colors.info} />
            <Text style={styles.splitText}>
              Your cart has Quick and Scheduled items — they'll arrive in <Text style={{ fontFamily: Typography.fontFamily.semiBold }}>2 separate deliveries</Text>.
            </Text>
          </View>
        )}

        {/* ── Step 1: Address ─────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Delivery Address</Text>
          {addrLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ margin: Spacing[4] }} />
          ) : addresses.length === 0 ? (
            <TouchableOpacity style={styles.addAddrBtn} onPress={() => navigation.navigate('AddressForm')}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
              <Text style={styles.addAddrText}>Add Delivery Address</Text>
            </TouchableOpacity>
          ) : (
            <>
              {addresses.map((addr) => (
                <TouchableOpacity
                  key={addr.id}
                  style={[styles.addrCard, selectedAddressId === addr.id && styles.addrCardSelected]}
                  onPress={() => handleAddressChange(addr.id)}
                >
                  <View style={styles.addrRadio}>
                    {selectedAddressId === addr.id
                      ? <Ionicons name="radio-button-on" size={20} color={Colors.primary} />
                      : <Ionicons name="radio-button-off" size={20} color={Colors.textTertiary} />
                    }
                  </View>
                  <View style={styles.addrDetails}>
                    <View style={styles.addrLabelRow}>
                      <Text style={styles.addrLabel}>{addr.label?.toUpperCase() || 'HOME'}</Text>
                      {addr.is_default && <View style={styles.defaultPill}><Text style={styles.defaultText}>DEFAULT</Text></View>}
                    </View>
                    <Text style={styles.addrName}>{addr.full_name}</Text>
                    <Text style={styles.addrLine}>{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''}</Text>
                    <Text style={styles.addrLine}>{addr.city}, {addr.state} – {addr.pincode}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.addAddrBtn} onPress={() => navigation.navigate('AddressForm')}>
                <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
                <Text style={styles.addAddrText}>Add new address</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Session F: Address revalidation banners ──────────────────── */}

        {/* A) Checking spinner — shown while preview call is in-flight */}
        {revalidating && (
          <View style={styles.revalBanner}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.revalBannerText}>Checking availability at new address…</Text>
          </View>
        )}

        {/* B) Unavailability / out-of-range error banner */}
        {!revalidating && revalidationErr && (
          <View style={[styles.revalBanner, styles.revalBannerError]}>
            <Ionicons name="alert-circle" size={18} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.revalErrTitle}>Can't deliver to this address</Text>
              <Text style={styles.revalErrMsg}>{revalidationErr}</Text>
              <Text style={styles.revalErrHint}>
                Please select a different address or remove unavailable items from your cart.
              </Text>
            </View>
          </View>
        )}

        {/* C) Price-change confirmation banner */}
        {!revalidating && priceChanges.length > 0 && (
          <View style={[styles.revalBanner, styles.revalBannerWarn]}>
            <Ionicons name="pricetag" size={18} color="#d97706" />
            <View style={{ flex: 1 }}>
              <Text style={styles.revalWarnTitle}>Prices updated for this address</Text>
              {priceChanges.map((ch, i) => (
                <Text key={i} style={styles.revalWarnItem}>
                  {ch.name}: {formatPaise(ch.oldPaise)} → {formatPaise(ch.newPaise)}
                </Text>
              ))}
              <View style={styles.revalWarnActions}>
                <TouchableOpacity
                  onPress={handleConfirmPriceChanges}
                  style={styles.revalWarnAccept}
                  activeOpacity={0.8}
                >
                  <Text style={styles.revalWarnAcceptText}>Accept & Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── Step 2: Slot (only for scheduled items) ────────── */}
        {scheduledItems.length > 0 && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[3] }}>
              <Text style={styles.sectionTitle}>📅 Scheduled Delivery Slot</Text>
              {/* Date picker — next 3 days */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[1, 2, 3].map(offset => {
                  const d = format(addDays(new Date(), offset), 'yyyy-MM-dd');
                  const label = offset === 1 ? 'Tomorrow' : format(addDays(new Date(), offset), 'EEE d');
                  return (
                    <TouchableOpacity
                      key={d}
                      onPress={() => { setSlotDate(d); setSelectedSlot(null); }}
                      style={[
                        styles.datePill,
                        activeSlotDate === d && styles.datePillSelected,
                      ]}
                    >
                      <Text style={[styles.datePillText, activeSlotDate === d && styles.datePillTextSelected]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {slotsLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing[4] }} />
            ) : displaySlots.length === 0 ? (
              <Text style={{ fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', padding: Spacing[4] }}>
                No delivery slots available for this date. Try another day.
              </Text>
            ) : (
              <View style={styles.slotGrid}>
                {displaySlots.map((slot) => {
                  const slotKey = slot.template_id || slot.id;
                  const isSelected = selectedSlot?.template_id === slotKey;
                  const isFull = !slot.available;
                  return (
                    <TouchableOpacity
                      key={slotKey}
                      style={[
                        styles.slotChip,
                        isSelected  && styles.slotChipSelected,
                        isFull      && styles.slotChipFull,
                      ]}
                      onPress={() => !isFull && setSelectedSlot(slot)}
                      disabled={isFull}
                    >
                      <Text style={[
                        styles.slotText,
                        isSelected  && styles.slotTextSelected,
                        isFull      && styles.slotTextFull,
                      ]}>
                        {slot.label}
                      </Text>
                      {/* Capacity bar — only for server-driven slots */}
                      {slot.max_orders > 0 && (
                        <View style={styles.slotCapacity}>
                          <View style={[
                            styles.slotCapacityFill,
                            { width: `${Math.min(100, (slot.booking_count / slot.max_orders) * 100)}%`,
                              backgroundColor: isFull ? Colors.error : isSelected ? Colors.secondary : Colors.primary }
                          ]} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── Step 3: Payment ──────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💳 Payment Method</Text>

          {/* P3-C: Wallet balance info strip (shown when wallet has funds) */}
          {walletBalance > 0 && (
            <View style={styles.walletInfoStrip}>
              <Ionicons name="wallet" size={16} color={Colors.secondary} />
              <Text style={styles.walletInfoText}>
                TezzWallet: <Text style={{ fontFamily: Typography.fontFamily.bold }}>{formatPaise(walletBalance)}</Text>
                {walletCoversAll
                  ? ' — fully covers this order'
                  : ` — covers ${formatPaise(walletCoverage)} of this order`
                }
              </Text>
            </View>
          )}

          {PAYMENT_METHODS.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.payCard, paymentMethod === m.id && styles.payCardSelected,
                m.id === 'wallet' && styles.payCardWallet]}
              onPress={() => setPaymentMethod(m.id)}
              accessibilityLabel={`Pay with ${m.label}`}
            >
              <Ionicons name={m.icon} size={20} color={paymentMethod === m.id ? Colors.primary : Colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.payLabel, paymentMethod === m.id && styles.payLabelSelected]}>
                  {m.id === 'wallet' ? 'TezzWallet' : m.label}
                </Text>
                {/* Wallet sub-label: show balance and coverage */}
                {m.id === 'wallet' && (
                  <Text style={styles.walletSubLabel}>
                    {walletCoversAll
                      ? `₹0 remaining after wallet`
                      : `${formatPaise(afterWallet)} via UPI after wallet`
                    }
                  </Text>
                )}
              </View>
              {paymentMethod === m.id
                ? <Ionicons name="radio-button-on"  size={20} color={Colors.primary} />
                : <Ionicons name="radio-button-off" size={20} color={Colors.textTertiary} />
              }
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Step 4: Order Summary ─────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧾 Order Summary</Text>
          {/* P1-C: Promo applied badge */}
          {promoCode && (
            <View style={styles.promoAppliedBadge}>
              <Ionicons name="pricetag" size={14} color={Colors.success || '#16a34a'} />
              <Text style={styles.promoAppliedText}>
                Promo <Text style={{ fontFamily: Typography.fontFamily.bold }}>{promoCode}</Text> applied
              </Text>
            </View>
          )}
          <View style={styles.summaryBox}>
            {quickItems.length > 0 && (
              <View style={styles.tierRow}>
                <Text style={styles.tierLabel}>⚡ Quick ({quickItems.length} items)</Text>
                <Text style={styles.tierValue}>{formatPaise(quickSubtotal + quickFee)}</Text>
              </View>
            )}
            {scheduledItems.length > 0 && (
              <View style={styles.tierRow}>
                <Text style={styles.tierLabel}>📅 Scheduled ({scheduledItems.length} items)</Text>
                <Text style={styles.tierValue}>{formatPaise(schedSubtotal + schedFee)}</Text>
              </View>
            )}
            {/* P6-6: Business discount row */}
            {isContractor && b2bDiscount > 0 && (
              <View style={styles.tierRow}>
                <Text style={[styles.tierLabel, { color: Colors.success }]}>
                  🏢 Business discount ({b2bBenefits.discountPercent}%)
                </Text>
                <Text style={[styles.tierValue, { color: Colors.success }]}>−{formatPaise(b2bDiscount)}</Text>
              </View>
            )}
            <View style={[styles.tierRow, styles.grandRow]}>
              <Text style={styles.grandLabel}>Grand Total</Text>
              <Text style={styles.grandValue}>{formatPaise(grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* ── Step 5: B2B Options (contractors only) ───────── */}
        {isContractor && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏢 Business Options</Text>
            <View style={styles.b2bCard}>
              {/* Credit payment option */}
              {b2bBenefits.creditAvailablePaise > 0 && (
                <TouchableOpacity
                  style={styles.b2bToggleRow}
                  onPress={() => { setUseCredit(v => !v); if (!useCredit) setPaymentMethod('upi'); }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.b2bToggleLabel}>Pay on Credit</Text>
                    <Text style={styles.b2bToggleSub}>
                      Due {b2bBenefits.paymentTermsDays} days after delivery · Available: {formatPaise(b2bBenefits.creditAvailablePaise)}
                    </Text>
                  </View>
                  <View style={[styles.toggle, useCredit && styles.toggleOn]}>
                    <View style={[styles.toggleThumb, useCredit && styles.toggleThumbOn]} />
                  </View>
                </TouchableOpacity>
              )}

              {/* GST Invoice toggle */}
              <TouchableOpacity
                style={[styles.b2bToggleRow, { marginTop: Spacing[3] }]}
                onPress={() => setWantGstInvoice(v => !v)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.b2bToggleLabel}>Generate GST Invoice</Text>
                  <Text style={styles.b2bToggleSub}>
                    {b2bBenefits.gstNumber ? `GSTIN: ${b2bBenefits.gstNumber}` : 'Invoice will be emailed within 24h'}
                  </Text>
                </View>
                <View style={[styles.toggle, wantGstInvoice && styles.toggleOn]}>
                  <View style={[styles.toggleThumb, wantGstInvoice && styles.toggleThumbOn]} />
                </View>
              </TouchableOpacity>

              {/* PO Number */}
              <View style={{ marginTop: Spacing[3] }}>
                <Text style={styles.b2bToggleLabel}>PO Number <Text style={styles.b2bOptional}>(optional)</Text></Text>
                <TextInput
                  style={styles.poInput}
                  value={poNumber}
                  onChangeText={setPoNumber}
                  placeholder="Purchase Order number"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="characters"
                />
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky place order */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerTotal}>{formatPaise(grandTotal)}</Text>
          <Text style={styles.footerItems}>{items.length} item{items.length !== 1 ? 's' : ''}</Text>
        </View>
        {/* Session F: disable checkout while revalidation is pending or failed */}
        {revalidating ? (
          <View style={[styles.footerCheckBtn, styles.footerCheckBtnDisabled]}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.footerCheckBtnText}>Checking…</Text>
          </View>
        ) : revalidationErr || priceChanges.length > 0 ? (
          <View style={[styles.footerCheckBtn, styles.footerCheckBtnBlocked]}>
            <Ionicons name="alert-circle-outline" size={16} color="#fff" />
            <Text style={styles.footerCheckBtnText}>
              {revalidationErr ? 'Unavailable' : 'Review prices ↑'}
            </Text>
          </View>
        ) : (
          <Button
            variant="primary"
            size="md"
            loading={placingOrder}
            disabled={placingOrder || !selectedAddressId || revalidatedId !== selectedAddressId}
            onPress={handlePlaceOrder}
            style={{ flex: 1, marginLeft: Spacing[4] }}
          >
            {paymentMethod === 'cod'
              ? 'Place Order'
              : paymentMethod === 'wallet' && walletCoversAll
              ? 'Pay with Wallet'
              : paymentMethod === 'wallet'
              ? `Wallet + Pay ${formatPaise(afterWallet)}`
              : 'Pay & Order'
            }
          </Button>
        )}
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
  splitText: { flex: 1, fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.info, lineHeight: 18 },

  section:      { marginBottom: Spacing[5] },
  sectionTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.text, marginBottom: Spacing[3] },

  addrCard: {
    flexDirection: 'row', padding: Spacing[4], backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl, borderWidth: 1.5, borderColor: Colors.border,
    marginBottom: Spacing[3], gap: Spacing[3],
  },
  addrCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  addrRadio:   { paddingTop: 2 },
  addrDetails: { flex: 1 },
  addrLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: 4 },
  addrLabel:   { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs, color: Colors.textSecondary, letterSpacing: 1 },
  defaultPill: { backgroundColor: Colors.successLight, borderRadius: BorderRadius.full, paddingHorizontal: 6, paddingVertical: 1 },
  defaultText: { fontFamily: Typography.fontFamily.semiBold, fontSize: 9, color: Colors.success },
  addrName:    { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text },
  addrLine:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },

  addAddrBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], padding: Spacing[3] },
  addAddrText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.primary },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  slotChip: {
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minWidth: '45%',
  },
  slotChipSelected: { borderColor: Colors.secondary, backgroundColor: Colors.secondaryLight },
  slotChipFull:     { opacity: 0.45, backgroundColor: Colors.surface },
  slotText:         { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text },
  slotTextSelected: { color: Colors.secondary },
  slotTextFull:     { color: Colors.textTertiary },
  slotCapacity: {
    height: 3, borderRadius: 2, backgroundColor: Colors.border,
    marginTop: 6, overflow: 'hidden',
  },
  slotCapacityFill: { height: '100%', borderRadius: 2 },

  datePill: {
    paddingHorizontal: Spacing[3], paddingVertical: 4,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  datePillSelected:     { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  datePillText:         { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, color: Colors.textSecondary },
  datePillTextSelected: { color: Colors.primary },

  payCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    padding: Spacing[4], backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl, borderWidth: 1.5, borderColor: Colors.border,
    marginBottom: Spacing[3],
  },
  payCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  // P3-C: wallet card gets a subtle secondary (navy) tint
  payCardWallet: { borderColor: Colors.secondary + '40' },
  payLabel:        { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base, color: Colors.text },
  payLabelSelected:{ color: Colors.primary },
  walletSubLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
    marginTop:  2,
  },
  // P3-C: wallet info strip above payment methods
  walletInfoStrip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: Colors.secondaryLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing[3],
    marginBottom: Spacing[3],
    borderWidth: 1, borderColor: Colors.secondary + '30',
  },
  walletInfoText: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.secondary,
  },

  summaryBox: { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing[4], ...Shadow.sm },
  tierRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing[2] },
  tierLabel:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tierValue:  { fontFamily: Typography.fontFamily.medium,  fontSize: Typography.size.sm, color: Colors.text },
  grandRow:   { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing[2], paddingTop: Spacing[3] },
  grandLabel: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.text },
  grandValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  // P1-C
  promoAppliedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: (Colors.successLight || '#f0fdf4'), borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], marginBottom: Spacing[3],
    borderWidth: 1, borderColor: (Colors.success || '#16a34a') + '40',
  },
  promoAppliedText: {
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm,
    color: Colors.success || '#16a34a',
  },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing[4], backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border, ...Shadow.xl,
  },
  footerTotal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  footerItems: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary },

  // Session F: revalidation banners
  revalBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
    borderRadius: BorderRadius.xl, padding: Spacing[4],
    marginBottom: Spacing[4],
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  revalBannerError: {
    backgroundColor: '#fef2f2',
    borderColor: '#dc262640',
  },
  revalBannerWarn: {
    backgroundColor: '#fffbeb',
    borderColor: '#d9770640',
  },
  revalBannerText: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  revalErrTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.sm,
    color: '#dc2626',
    marginBottom: 4,
  },
  revalErrMsg: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: '#991b1b',
    marginBottom: 4,
    lineHeight: 18,
  },
  revalErrHint: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.xs,
    color: '#6b7280',
    lineHeight: 16,
  },
  revalWarnTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.sm,
    color: '#92400e',
    marginBottom: 6,
  },
  revalWarnItem: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: '#78350f',
    marginBottom: 2,
  },
  revalWarnActions: { marginTop: 10 },
  revalWarnAccept: {
    backgroundColor: '#d97706',
    borderRadius: BorderRadius.lg,
    paddingVertical: 8, paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  revalWarnAcceptText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.sm,
    color: '#fff',
  },

  // Session F: footer button states for blocked/checking
  footerCheckBtn: {
    flex: 1, marginLeft: Spacing[4],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: BorderRadius.xl,
    paddingVertical: 14, paddingHorizontal: Spacing[4],
  },
  footerCheckBtnDisabled: { backgroundColor: Colors.primary + '80' },
  footerCheckBtnBlocked:  { backgroundColor: '#dc2626' },
  footerCheckBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.sm,
    color: '#fff',
  },

  b2bCard: {
    backgroundColor: Colors.secondaryLight,
    borderRadius:    BorderRadius.xl,
    padding:         Spacing[4],
    borderWidth:     1,
    borderColor:     Colors.secondary + '25',
  },
  b2bToggleRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing[3],
  },
  b2bToggleLabel: {
    fontFamily:   Typography.fontFamily.semiBold,
    fontSize:     Typography.size.sm,
    color:        Colors.text,
    marginBottom: 2,
  },
  b2bToggleSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
  },
  b2bOptional: {
    fontFamily: Typography.fontFamily.regular,
    color:      Colors.textTertiary,
    fontSize:   Typography.size.xs,
  },
  poInput: {
    borderWidth:  1.5,
    borderColor:  Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[3],
    paddingVertical:   Spacing[2],
    fontFamily:   Typography.fontFamily.regular,
    fontSize:     Typography.size.sm,
    color:        Colors.text,
    backgroundColor: Colors.surface,
    marginTop:    Spacing[2],
  },
  // Toggle switch
  toggle: {
    width: 44, height: 24, borderRadius: 12,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    padding: 2,
  },
  toggleOn: { backgroundColor: Colors.secondary },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
});
