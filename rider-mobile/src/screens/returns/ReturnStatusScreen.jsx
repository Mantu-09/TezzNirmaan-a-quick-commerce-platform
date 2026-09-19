// ────────────────────────────────────────────────────────────
// ReturnStatusScreen.jsx — P6-3
//
// Shows the status of a single return request.
// Navigation: navigated to from RequestReturnScreen (replace)
// or from a notification deep-link with params { returnId, orderNumber }
// ────────────────────────────────────────────────────────────
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons }     from '@expo/vector-icons';
import { useQuery }     from '@tanstack/react-query';
import { format }       from 'date-fns';
import { getReturn }    from '../../api/returns';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { openNewConversation } from '../../services/freshchat'; // P7-4

// ── Status pipeline ───────────────────────────────────────────
const STEPS = [
  { key: 'requested',   label: 'Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'approved',    label: 'Approved' },
  { key: 'refunded',    label: 'Resolved' },
];

// Map rejected to a separate terminal state
const STEP_INDEX = {
  requested:    0,
  under_review: 1,
  approved:     2,
  refunded:     3,
  rejected:     -1,  // handled separately
};

const REASON_LABELS = {
  wrong_item_delivered:     'Wrong item delivered',
  damaged_item:             'Damaged item',
  quality_not_as_described: 'Quality not as described',
  quantity_short:           'Quantity short',
  item_missing:             'Item missing',
  other:                    'Other',
};

function fmt(ts) {
  if (!ts) return '—';
  return format(new Date(ts), 'MMM d, h:mm a');
}

// ── Step progress bar ─────────────────────────────────────────
function StatusStepper({ status }) {
  if (status === 'rejected') {
    return (
      <View style={styles.rejectedBadge}>
        <Ionicons name="close-circle" size={20} color={Colors.error} />
        <Text style={styles.rejectedText}>Return Rejected</Text>
      </View>
    );
  }

  const currentIdx = STEP_INDEX[status] ?? 0;

  return (
    <View style={styles.stepperWrap}>
      {/* Track */}
      <View style={styles.stepperTrack}>
        {STEPS.map((step, i) => {
          const done   = i <= currentIdx;
          const active = i === currentIdx;
          return (
            <React.Fragment key={step.key}>
              <View style={[
                styles.stepDot,
                done   && styles.stepDotDone,
                active && styles.stepDotActive,
              ]}>
                {done && !active && <Ionicons name="checkmark" size={10} color="#fff" />}
                {active && <View style={styles.stepDotInner} />}
              </View>
              {i < STEPS.length - 1 && (
                <View style={[styles.stepLine, i < currentIdx && styles.stepLineDone]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
      {/* Labels */}
      <View style={styles.stepLabels}>
        {STEPS.map((step, i) => (
          <Text
            key={step.key}
            style={[styles.stepLabel, i === currentIdx && styles.stepLabelActive]}
            numberOfLines={1}
          >
            {step.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ── Refund method badge ───────────────────────────────────────
function RefundMethodBadge({ method, amountPaise }) {
  if (!method || !amountPaise) return null;
  const amount = `₹${(amountPaise / 100).toFixed(0)}`;
  const isWallet = method === 'wallet';
  return (
    <View style={[styles.refundBadge, { backgroundColor: isWallet ? '#F0FDF4' : '#EFF6FF' }]}>
      <Ionicons
        name={isWallet ? 'wallet-outline' : 'card-outline'}
        size={16}
        color={isWallet ? Colors.success : Colors.info}
      />
      <Text style={[styles.refundBadgeText, { color: isWallet ? Colors.success : Colors.info }]}>
        {amount} refund via {isWallet ? 'Wallet (instant)' : 'Bank (5–7 days)'}
      </Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function ReturnStatusScreen({ route }) {
  const { returnId, orderNumber } = route.params;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['return', returnId],
    queryFn:  () => getReturn(returnId),
    staleTime: 30 * 1000,
  });

  const ret = data?.return ?? data;

  if (isLoading || !ret) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <Ionicons name="hourglass-outline" size={36} color={Colors.textTertiary} />
          <Text style={styles.loadingText}>Loading return status…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const photos = ret.photo_urls || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ─────────────────────────────────────── */}
        <Text style={styles.title}>Return Request Status</Text>
        <Text style={styles.subtitle}>
          Order <Text style={styles.orderNum}>#{orderNumber || ret.orders?.order_number}</Text>
          {ret.shops?.name ? `  ·  ${ret.shops.name}` : ''}
        </Text>

        {/* ── Status stepper ──────────────────────────────── */}
        <View style={styles.card}>
          <StatusStepper status={ret.status} />

          {/* Dates */}
          <View style={styles.datesRow}>
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>Submitted</Text>
              <Text style={styles.dateValue}>{fmt(ret.requested_at)}</Text>
            </View>
            {ret.reviewed_at && (
              <View style={styles.dateItem}>
                <Text style={styles.dateLabel}>Reviewed</Text>
                <Text style={styles.dateValue}>{fmt(ret.reviewed_at)}</Text>
              </View>
            )}
            {ret.resolved_at && (
              <View style={styles.dateItem}>
                <Text style={styles.dateLabel}>Resolved</Text>
                <Text style={styles.dateValue}>{fmt(ret.resolved_at)}</Text>
              </View>
            )}
          </View>

          {/* Estimated resolution notice */}
          {['requested', 'under_review'].includes(ret.status) && (
            <Text style={styles.estimateText}>
              ⏳ Estimated resolution: within 24 hours
            </Text>
          )}
        </View>

        {/* ── Refund details ───────────────────────────────── */}
        {(ret.status === 'approved' || ret.status === 'refunded') && (
          <RefundMethodBadge method={ret.refund_method} amountPaise={ret.refund_amount_paise} />
        )}

        {/* ── Rejection reason ─────────────────────────────── */}
        {ret.status === 'rejected' && ret.rejection_reason && (
          <View style={styles.rejectionBox}>
            <Text style={styles.rejectionTitle}>Rejection reason</Text>
            <Text style={styles.rejectionBody}>{ret.rejection_reason}</Text>
          </View>
        )}

        {/* ── Return details ───────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your complaint</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reason</Text>
            <Text style={styles.detailValue}>{REASON_LABELS[ret.reason] || ret.reason}</Text>
          </View>
          {ret.description ? (
            <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
              <Text style={styles.detailLabel}>Details</Text>
              <Text style={[styles.detailValue, { flex: 1 }]}>{ret.description}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Photos ───────────────────────────────────────── */}
        {photos.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing[2] }}>
              {photos.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={styles.photo} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Refresh ──────────────────────────────────────── */}
        <TouchableOpacity style={styles.refreshBtn} onPress={() => refetch()}>
          <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
          <Text style={styles.refreshText}>Refresh status</Text>
        </TouchableOpacity>

        {/* P7-4: Dispute button — only for rejected returns */}
        {ret.status === 'rejected' && (
          <TouchableOpacity
            style={styles.disputeBtn}
            onPress={() => openNewConversation(
              `Return dispute: Order #${orderNumber || ret.orders?.order_number}`,
              `My return was rejected. Reason: ${ret.rejection_reason || 'Not provided'}. ` +
              `Order #${orderNumber || ret.orders?.order_number}. I would like to escalate this.`,
            )}
            activeOpacity={0.75}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
            <Text style={styles.disputeBtnText}>Dispute this decision</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.finePrint}>
          Need help? Tap above to chat with us or contact the shop directly.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  scroll:      { padding: Spacing[4], paddingBottom: Spacing[10] },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] },
  loadingText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textTertiary },

  title:    { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.text },
  subtitle: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2, marginBottom: Spacing[4] },
  orderNum: { fontFamily: Typography.fontFamily.semiBold, color: Colors.primary },

  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[3], ...Shadow.sm,
  },
  cardTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text, marginBottom: Spacing[3] },

  // Stepper
  stepperWrap: { marginBottom: Spacing[4] },
  stepperTrack: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  stepDotDone:   { backgroundColor: Colors.primary },
  stepDotActive: { backgroundColor: Colors.primary, width: 22, height: 22, borderRadius: 11 },
  stepDotInner:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  stepLine:      { flex: 1, height: 2, backgroundColor: Colors.border },
  stepLineDone:  { backgroundColor: Colors.primary },
  stepLabels:    { flexDirection: 'row', marginTop: Spacing[1] },
  stepLabel:     { flex: 1, fontSize: 9, color: Colors.textTertiary, fontFamily: Typography.fontFamily.regular, textAlign: 'center' },
  stepLabelActive: { color: Colors.primary, fontFamily: Typography.fontFamily.semiBold },

  // Rejected
  rejectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: Colors.error + '12', borderRadius: BorderRadius.lg,
    padding: Spacing[3], borderWidth: 1, borderColor: Colors.error + '30',
    marginBottom: Spacing[3],
  },
  rejectedText: { fontFamily: Typography.fontFamily.semiBold, color: Colors.error, fontSize: Typography.size.base },

  // Dates
  datesRow:   { flexDirection: 'row', gap: Spacing[4], flexWrap: 'wrap' },
  dateItem:   { gap: 2 },
  dateLabel:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  dateValue:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.text },
  estimateText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: Spacing[3] },

  // Refund badge
  refundBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    borderRadius: BorderRadius.lg, padding: Spacing[3],
    marginBottom: Spacing[3],
  },
  refundBadgeText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },

  // Rejection box
  rejectionBox: {
    backgroundColor: Colors.error + '08', borderRadius: BorderRadius.lg,
    padding: Spacing[4], marginBottom: Spacing[3],
    borderWidth: 1, borderColor: Colors.error + '20',
  },
  rejectionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.error, marginBottom: Spacing[1] },
  rejectionBody:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.text, lineHeight: 20 },

  // Detail rows
  detailRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing[1], gap: Spacing[4] },
  detailLabel: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, flexShrink: 0 },
  detailValue: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.text, textAlign: 'right' },

  // Photos
  photo: { width: 100, height: 100, borderRadius: BorderRadius.lg, marginRight: Spacing[2], backgroundColor: Colors.border },

  // Refresh
  refreshBtn:  { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], justifyContent: 'center', padding: Spacing[3] },
  refreshText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.primary },

  // P7-4: Dispute button
  disputeBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             Spacing[2],
    backgroundColor: Colors.error,
    borderRadius:    BorderRadius.xl,
    paddingVertical: Spacing[3],
    marginHorizontal: Spacing[4],
    marginBottom:    Spacing[3],
  },
  disputeBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.base,
    color:      '#fff',
  },

  finePrint: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing[2] },
});
