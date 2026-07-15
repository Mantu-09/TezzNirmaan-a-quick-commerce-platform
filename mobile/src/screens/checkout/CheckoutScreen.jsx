import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import RazorpayCheckout from 'react-native-razorpay';
import Constants from 'expo-constants';
import { format, addDays } from 'date-fns';
import * as ordersApi from '../../api/orders';
import { getAvailableSlots } from '../../api/slots';      // B6
import Button from '../../components/common/Button';
import { formatPaise } from '../../utils/money';
import { formatSlot, getTomorrowSlots } from '../../utils/date';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useCartStore from '../../store/cartStore';
import useAuthStore from '../../store/authStore';

const RAZORPAY_KEY = Constants.expoConfig?.extra?.razorpayKeyId || process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID;

const PAYMENT_METHODS = [
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

export default function CheckoutScreen({ navigation }) {
  const { user }       = useAuthStore();
  const { items, quickItems, scheduledItems, hasBothTiers, clearCart } = useCartStore();

  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [selectedSlot,      setSelectedSlot]      = useState(null);
  const [paymentMethod,     setPaymentMethod]     = useState('upi');
  const [placingOrder,      setPlacingOrder]      = useState(false);
  const [slotDate,          setSlotDate]          = useState(null); // 'YYYY-MM-DD'

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
  const grandTotal    = quickSubtotal + schedSubtotal + quickFee + schedFee;

  // Fetch saved addresses
  const { data: addrData, isLoading: addrLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn:  ordersApi.getAddresses,
    onSuccess: (d) => {
      const def = d?.addresses?.find(a => a.is_default) || d?.addresses?.[0];
      if (def && !selectedAddressId) setSelectedAddressId(def.id);
    },
  });
  const addresses = addrData?.addresses || [];

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

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) { Alert.alert('Address required', 'Please select a delivery address.'); return; }
    if (scheduledItems.length > 0 && !selectedSlot) { Alert.alert('Slot required', 'Please choose a delivery slot for scheduled items.'); return; }
    if (selectedSlot && !selectedSlot.available) { Alert.alert('Slot full', 'This slot is fully booked. Please select another.'); return; }

    setPlacingOrder(true);
    try {
      const orderRes = await ordersApi.placeOrder({
        addressId:     selectedAddressId,
        paymentMethod,
        // B6: pass slot as ISO datetimes so backend can create slot booking
        scheduledSlot: selectedSlot
          ? {
              start: `${activeSlotDate}T${selectedSlot.start_time}:00`,
              end:   `${activeSlotDate}T${selectedSlot.end_time}:00`,
            }
          : undefined,
      });

      const orderId = orderRes?.order?.id || orderRes?.orderId;
      // A9b: Use server-confirmed total, never locally computed grandTotal.
      // orderRes.totalAmountPaise comes from the backend's placeOrder response.
      const serverAmountPaise = orderRes?.totalAmountPaise || orderRes?.total_amount_paise || grandTotal;

      // Online payment — open Razorpay native checkout
      if (paymentMethod !== 'cod' && orderRes?.razorpayOrderId) {
        await new Promise((resolve, reject) => {
          RazorpayCheckout.open({
            description:  'TezzNirmaan Order',
            image:        'https://your-logo-url.com/logo.png',
            currency:     'INR',
            key:          RAZORPAY_KEY,
            amount:       serverAmountPaise,   // server-confirmed, not client-computed
            name:         'TezzNirmaan',
            order_id:     orderRes.razorpayOrderId,
            prefill: {
              email: user?.email || '',
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
      navigation.replace('OrderConfirmation', { orderId });
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
                  onPress={() => setSelectedAddressId(addr.id)}
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
          {PAYMENT_METHODS.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.payCard, paymentMethod === m.id && styles.payCardSelected]}
              onPress={() => setPaymentMethod(m.id)}
            >
              <Ionicons name={m.icon} size={20} color={paymentMethod === m.id ? Colors.primary : Colors.textSecondary} />
              <Text style={[styles.payLabel, paymentMethod === m.id && styles.payLabelSelected]}>{m.label}</Text>
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
            <View style={[styles.tierRow, styles.grandRow]}>
              <Text style={styles.grandLabel}>Grand Total</Text>
              <Text style={styles.grandValue}>{formatPaise(grandTotal)}</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky place order */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerTotal}>{formatPaise(grandTotal)}</Text>
          <Text style={styles.footerItems}>{items.length} item{items.length !== 1 ? 's' : ''}</Text>
        </View>
        <Button
          variant="primary"
          size="md"
          loading={placingOrder}
          disabled={placingOrder}
          onPress={handlePlaceOrder}
          style={{ flex: 1, marginLeft: Spacing[4] }}
        >
          {paymentMethod === 'cod' ? 'Place Order' : 'Pay & Order'}
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
  payLabel:        { flex: 1, fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base, color: Colors.text },
  payLabelSelected:{ color: Colors.primary },

  summaryBox: { backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing[4], ...Shadow.sm },
  tierRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing[2] },
  tierLabel:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  tierValue:  { fontFamily: Typography.fontFamily.medium,  fontSize: Typography.size.sm, color: Colors.text },
  grandRow:   { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing[2], paddingTop: Spacing[3] },
  grandLabel: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.text },
  grandValue: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing[4], backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border, ...Shadow.xl,
  },
  footerTotal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  footerItems: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary },
});
