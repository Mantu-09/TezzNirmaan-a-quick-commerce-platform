// ────────────────────────────────────────────────────────────
// ShopOrderDetailScreen — P8-4A
//
// Full sub-order detail view for shop owners.
// Reached by tapping "View full details →" on a queue card,
// or from the ShopOwnerNavigator stack.
//
// Features:
//   • Complete item list with quantities and line totals
//   • Customer address with "Open in Maps" button
//   • Customer phone number with one-tap call
//   • Payment method + status
//   • Status progression buttons (Accept → Preparing → Ready)
//   • Internal packing notes field
//   • Delivery tier + estimated time badge
// ────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Linking, Alert, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons }     from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import {
  getShopSubOrder,
  confirmShopOrder,
  rejectShopOrder,
  startPreparing,
  markReady,
} from '../../api/shopOwner';

// ── Helpers ────────────────────────────────────────────────────
const fmtPaise = (p) =>
  `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const STATUS_ORDER = ['new', 'confirmed', 'preparing', 'ready', 'dispatched', 'delivered'];

const STATUS_META = {
  new:        { label: 'New Order',        icon: 'receipt-outline',      color: Colors.error   },
  confirmed:  { label: 'Order Confirmed',  icon: 'checkmark-circle',     color: Colors.success },
  preparing:  { label: 'Preparing',        icon: 'construct-outline',    color: Colors.warning },
  ready:      { label: 'Ready for Pickup', icon: 'bag-check-outline',    color: Colors.info    },
  dispatched: { label: 'Out for Delivery', icon: 'bicycle-outline',      color: Colors.secondary },
  delivered:  { label: 'Delivered',        icon: 'home-outline',         color: Colors.success },
  cancelled:  { label: 'Cancelled',        icon: 'close-circle-outline', color: Colors.textTertiary },
};

const REJECT_REASONS = [
  'Item out of stock',
  'Shop is closing early',
  'Too many orders right now',
  'Customer unreachable',
  'Other',
];

// ── Status Timeline ───────────────────────────────────────────
function StatusTimeline({ currentStatus }) {
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  return (
    <View style={styles.timeline}>
      {STATUS_ORDER.slice(0, 5).map((s, i) => {
        const isDone    = i < currentIdx;
        const isCurrent = i === currentIdx;
        const meta      = STATUS_META[s];
        return (
          <React.Fragment key={s}>
            <View style={styles.timelineStep}>
              <View style={[
                styles.timelineDot,
                isDone    && styles.timelineDotDone,
                isCurrent && styles.timelineDotCurrent,
              ]}>
                {isDone ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : (
                  <View style={[
                    styles.timelineDotInner,
                    isCurrent && { backgroundColor: Colors.primary },
                  ]} />
                )}
              </View>
              <Text style={[
                styles.timelineLabel,
                (isDone || isCurrent) && { color: Colors.text },
              ]} numberOfLines={1}>
                {meta.label}
              </Text>
            </View>
            {i < STATUS_ORDER.slice(0, 5).length - 1 && (
              <View style={[
                styles.timelineConnector,
                isDone && { backgroundColor: Colors.success },
              ]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Action Button ─────────────────────────────────────────────
function PrimaryAction({ status, loading, onAccept, onReject, onPreparing, onReady }) {
  if (status === 'new') {
    return (
      <View style={styles.dualAction}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.rejectBtn]}
          onPress={onReject}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={20} color={Colors.error} />
          <Text style={[styles.actionBtnLabel, { color: Colors.error }]}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.acceptBtn]}
          onPress={onAccept}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={[styles.actionBtnLabel, { color: '#fff' }]}>Accept Order</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }
  if (status === 'confirmed') {
    return (
      <TouchableOpacity
        style={[styles.singleAction, { backgroundColor: Colors.warning }]}
        onPress={onPreparing} disabled={loading} activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.singleActionLabel}>▶ Start Preparing</Text>
        )}
      </TouchableOpacity>
    );
  }
  if (status === 'preparing') {
    return (
      <TouchableOpacity
        style={[styles.singleAction, { backgroundColor: Colors.info }]}
        onPress={onReady} disabled={loading} activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.singleActionLabel}>✓ Mark Ready for Pickup</Text>
        )}
      </TouchableOpacity>
    );
  }
  return null;
}

// ── Main Screen ───────────────────────────────────────────────
export default function ShopOrderDetailScreen({ route, navigation }) {
  const { subOrderId } = route.params;

  const [order,        setOrder]       = useState(null);
  const [loading,      setLoading]     = useState(true);
  const [actioning,    setActioning]   = useState(false);
  const [rejectSheet,  setRejectSheet] = useState(false);
  const [packingNotes, setPackingNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getShopSubOrder(subOrderId);
      setOrder(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [subOrderId]);

  useEffect(() => { load(); }, [load]);

  // ── Actions ──────────────────────────────────────────────
  const handleAccept = async () => {
    setActioning(true);
    try {
      await confirmShopOrder(subOrderId);
      setOrder(o => ({ ...o, status: 'confirmed' }));
    } catch (e) { Alert.alert('Error', e.message); }
    finally     { setActioning(false); }
  };

  const handleRejectSelect = async (reason) => {
    setRejectSheet(false);
    setActioning(true);
    try {
      await rejectShopOrder(subOrderId, reason);
      navigation.goBack();
    } catch (e) { Alert.alert('Error', e.message); }
    finally     { setActioning(false); }
  };

  const handlePreparing = async () => {
    setActioning(true);
    try {
      await startPreparing(subOrderId);
      setOrder(o => ({ ...o, status: 'preparing' }));
    } catch (e) { Alert.alert('Error', e.message); }
    finally     { setActioning(false); }
  };

  const handleReady = async () => {
    setActioning(true);
    try {
      await markReady(subOrderId);
      setOrder(o => ({ ...o, status: 'ready' }));
    } catch (e) { Alert.alert('Error', e.message); }
    finally     { setActioning(false); }
  };

  const callCustomer = () => {
    if (!order?.customer_phone) return;
    Linking.openURL(`tel:${order.customer_phone}`);
  };

  const openMaps = () => {
    const addr = order?.delivery_address;
    if (!addr) return;
    const query = encodeURIComponent(
      `${addr.address_line1}, ${addr.area}, ${addr.city}`
    );
    const url = Platform.OS === 'ios'
      ? `maps://maps.apple.com/?q=${query}`
      : `https://maps.google.com/?q=${query}`;
    Linking.openURL(url);
  };

  // ── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Order not found.</Text>
      </SafeAreaView>
    );
  }

  const canAct = ['new', 'confirmed', 'preparing'].includes(order.status);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Order Header ── */}
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderNum}>#{order.order_number}</Text>
            <Text style={styles.orderTime}>
              {new Date(order.created_at).toLocaleString('en-IN', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[
              styles.tierBadge,
              { backgroundColor: order.delivery_tier === 'quick' ? Colors.quickLight : Colors.scheduledLight },
            ]}>
              <Text style={[
                styles.tierText,
                { color: order.delivery_tier === 'quick' ? Colors.quickText : Colors.scheduledText },
              ]}>
                {order.delivery_tier === 'quick' ? '⚡ Quick' : '📅 Scheduled'}
              </Text>
            </View>
            <Text style={styles.orderTotal}>{fmtPaise(order.total_amount)}</Text>
          </View>
        </View>

        {/* ── Status Timeline ── */}
        <View style={styles.card}>
          <StatusTimeline currentStatus={order.status} />
        </View>

        {/* ── Items ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>📦 Order Items</Text>
          {(order.items || []).map((item, i) => (
            <View key={item.id || i} style={[styles.itemRow, i > 0 && styles.itemBorder]}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemName}>{item.product_name}</Text>
                <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
              </View>
              <Text style={styles.itemTotal}>{fmtPaise(item.total_paise)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Order Total</Text>
            <Text style={styles.totalValue}>{fmtPaise(order.total_amount)}</Text>
          </View>
        </View>

        {/* ── Customer ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>👤 Customer</Text>

          {/* Phone call */}
          <TouchableOpacity style={styles.contactRow} onPress={callCustomer} activeOpacity={0.7}>
            <View style={styles.contactIcon}>
              <Ionicons name="call" size={18} color={Colors.primary} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>Tap to Call</Text>
              <Text style={styles.contactValue}>{order.customer_phone || '—'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>

          {/* Address + maps */}
          <TouchableOpacity style={styles.contactRow} onPress={openMaps} activeOpacity={0.7}>
            <View style={[styles.contactIcon, { backgroundColor: Colors.infoLight }]}>
              <Ionicons name="location" size={18} color={Colors.info} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>Delivery Address</Text>
              <Text style={styles.contactValue}>
                {order.delivery_address?.address_line1}
                {order.delivery_address?.area ? `, ${order.delivery_address.area}` : ''}
              </Text>
            </View>
            <Ionicons name="map-outline" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* ── Payment ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>💳 Payment</Text>
          <View style={styles.paymentRow}>
            <Ionicons
              name={order.payment_method === 'online' ? 'checkmark-circle' : 'cash-outline'}
              size={20}
              color={order.payment_method === 'online' ? Colors.success : Colors.warning}
            />
            <Text style={[
              styles.paymentText,
              { color: order.payment_method === 'online' ? Colors.success : Colors.warning },
            ]}>
              {order.payment_method === 'online'
                ? 'Paid via UPI / Online ✓'
                : 'Cash on Delivery — collect ₹' + fmtPaise(order.total_amount).replace('₹', '')}
            </Text>
          </View>
        </View>

        {/* ── Packing Notes (internal) ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>📝 Packing Notes (internal)</Text>
          {order.customer_notes ? (
            <View style={styles.customerNote}>
              <Text style={styles.customerNoteLabel}>Customer note:</Text>
              <Text style={styles.customerNoteText}>{order.customer_notes}</Text>
            </View>
          ) : null}
          <TextInput
            style={styles.notesInput}
            value={packingNotes}
            onChangeText={setPackingNotes}
            placeholder="Add packing instructions for your staff…"
            placeholderTextColor={Colors.textTertiary}
            multiline
            numberOfLines={3}
          />
        </View>
      </ScrollView>

      {/* ── Sticky Action Footer ── */}
      {canAct && (
        <View style={styles.actionFooter}>
          <PrimaryAction
            status={order.status}
            loading={actioning}
            onAccept={handleAccept}
            onReject={() => setRejectSheet(true)}
            onPreparing={handlePreparing}
            onReady={handleReady}
          />
        </View>
      )}

      {/* ── Reject Reason Sheet ── */}
      {rejectSheet && (
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Reason for Rejection</Text>
            {REJECT_REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={styles.sheetRow}
                onPress={() => handleRejectSelect(r)}
                activeOpacity={0.7}
              >
                <Text style={styles.sheetRowText}>{r}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => setRejectSheet(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText:   { color: Colors.textSecondary, fontFamily: Typography.fontFamily.medium },
  scroll:      { padding: Spacing.md, gap: 12, paddingBottom: 120 },

  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 4,
  },
  orderNum:    { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text },
  orderTime:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  tierBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tierText:    { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs },
  orderTotal:  { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text },

  card: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.lg,
    padding:         Spacing.md,
    gap:             8,
    ...Shadow.sm,
  },
  sectionTitle: {
    fontFamily:   Typography.fontFamily.bold,
    fontSize:     Typography.size.sm,
    color:        Colors.textSecondary,
    textTransform:'uppercase',
    letterSpacing: 0.8,
    marginBottom:  4,
  },

  // Timeline
  timeline:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  timelineStep:       { alignItems: 'center', flex: 1 },
  timelineDot:        {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, marginBottom: 4,
  },
  timelineDotDone:    { backgroundColor: Colors.success, borderColor: Colors.success },
  timelineDotCurrent: { borderColor: Colors.primary, borderWidth: 2 },
  timelineDotInner:   { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  timelineConnector:  { flex: 1, height: 2, backgroundColor: Colors.border, marginBottom: 18 },
  timelineLabel:      { fontFamily: Typography.fontFamily.regular, fontSize: 10, color: Colors.textTertiary, textAlign: 'center' },

  // Items
  itemRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8 },
  itemBorder:{ borderTopWidth: 1, borderTopColor: Colors.border },
  itemLeft:  { flex: 1 },
  itemName:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: Colors.text },
  itemQty:   { fontFamily: Typography.fontFamily.regular,  fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  itemTotal: { fontFamily: Typography.fontFamily.bold,     fontSize: Typography.size.md, color: Colors.text },
  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: Colors.border, paddingTop: 10, marginTop: 4 },
  totalLabel:{ fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.text },
  totalValue:{ fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.primary },

  // Contact
  contactRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  contactIcon:  { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  contactInfo:  { flex: 1 },
  contactLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary },
  contactValue: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: Colors.text, marginTop: 2 },

  // Payment
  paymentRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  paymentText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, flex: 1 },

  // Notes
  customerNote:     { backgroundColor: Colors.infoLight, borderRadius: BorderRadius.md, padding: Spacing.sm },
  customerNoteLabel:{ fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs, color: Colors.info, marginBottom: 4 },
  customerNoteText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.secondary },
  notesInput:       {
    backgroundColor: Colors.surface2, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, minHeight: 80,
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.text,
    textAlignVertical: 'top',
  },

  // Action footer
  actionFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: Spacing.md, paddingBottom: 28,
    ...Shadow.md,
  },
  dualAction:  { flexDirection: 'row', gap: 12 },
  actionBtn:   {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: BorderRadius.md,
  },
  rejectBtn:   { backgroundColor: Colors.errorLight, borderWidth: 1, borderColor: Colors.error + '40' },
  acceptBtn:   { backgroundColor: Colors.primary },
  actionBtnLabel: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md },
  singleAction: { paddingVertical: 16, borderRadius: BorderRadius.md, alignItems: 'center' },
  singleActionLabel: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: '#fff' },

  // Reject sheet
  overlay: { position: 'absolute', inset: 0, backgroundColor: Colors.overlay, justifyContent: 'flex-end', zIndex: 100 },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: 40 },
  sheetTitle:      { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text, marginBottom: 12 },
  sheetRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetRowText:    { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.md, color: Colors.text },
  sheetCancel:     { marginTop: 12, alignItems: 'center', paddingVertical: 12, backgroundColor: Colors.surface2, borderRadius: BorderRadius.md },
  sheetCancelText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.textSecondary },
});
