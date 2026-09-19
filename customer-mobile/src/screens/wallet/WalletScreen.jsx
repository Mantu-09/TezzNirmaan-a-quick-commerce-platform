// ────────────────────────────────────────────────────────────
// WalletScreen — P3-C
//
// Sections:
//   1. Balance card — large ₹ amount, lifetime stats
//   2. Expiring credits warning (if any expire in <7 days)
//   3. "How to earn more" info strip
//   4. Transaction history — chronological, icon per type,
//      +credit / –debit amounts, expiry date for promos
//
// Design:
//   • Matches TezzNirmaan amber/navy theme
//   • Pull-to-refresh
//   • Skeleton loading state
//   • Empty state for new users
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  Animated, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native'; // P4-2A
import { getWallet, getLoyalty } from '../../api/wallet';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';

// ── Formatters ────────────────────────────────────────────────
const fmt = {
  paise:   v => `₹${((v || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  paiseNo: v => `₹${Math.floor((v || 0) / 100).toLocaleString('en-IN')}`,
  date:    d => {
    if (!d) return '';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  },
  daysLeft: d => {
    if (!d) return null;
    const diff = Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  },
};

// ── Transaction type metadata ──────────────────────────────────
const TXN_META = {
  credit_refund:   { icon: 'return-down-back',       color: Colors.success,   label: 'Refund',      sign: '+' },
  credit_referral: { icon: 'people-outline',          color: Colors.info,      label: 'Referral',    sign: '+' },
  credit_promo:    { icon: 'pricetag-outline',        color: Colors.warning,   label: 'Promo',       sign: '+' },
  credit_cashback: { icon: 'gift-outline',            color: Colors.success,   label: 'Cashback',    sign: '+' },
  debit_order:     { icon: 'cart-outline',            color: Colors.error,     label: 'Order',       sign: '–' },
  debit_expiry:    { icon: 'time-outline',            color: Colors.textTertiary, label: 'Expired',  sign: '–' },
};

// ── How to earn items ───────────────────────────────────────────
const HOW_TO_EARN = [
  { icon: 'return-down-back', color: Colors.success, text: 'Cancel an eligible order — refund goes straight to wallet' },
  { icon: 'pricetag-outline', color: Colors.warning, text: 'Admin promotional credits for loyal customers' },
];

// ── P4-2A: Invite Friends Card ────────────────────────────────────────────────
// ── Loyalty Stamp Card — P19-5 ────────────────────────────────
// 5 stamps = 1 free delivery. Each delivered order = 1 stamp.
function LoyaltyStampCard({ loyalty }) {
  const current       = loyalty?.current_cycle      ?? 0;
  const total         = loyalty?.stamps_per_reward  ?? 5;
  const stampsToNext  = loyalty?.stamps_to_next     ?? total;
  const rewardsEarned = loyalty?.rewards_earned     ?? 0;
  const pct           = Math.min(1, current / total);

  return (
    <View style={styles.loyaltyCard}>
      {/* Header */}
      <View style={styles.loyaltyHeader}>
        <View>
          <Text style={styles.loyaltyTitle}>🎟️ Stamp Card</Text>
          <Text style={styles.loyaltySub}>Collect stamps, get free deliveries</Text>
        </View>
        {rewardsEarned > 0 && (
          <View style={styles.loyaltyBadge}>
            <Text style={styles.loyaltyBadgeText}>{rewardsEarned} earned</Text>
          </View>
        )}
      </View>

      {/* Stamp grid — 5 circles */}
      <View style={styles.stampRow}>
        {Array.from({ length: total }).map((_, i) => {
          const filled = i < current;
          return (
            <View
              key={i}
              style={[styles.stamp, filled && styles.stampFilled]}
            >
              {filled
                ? <Ionicons name="checkmark" size={16} color="#fff" />
                : <Text style={styles.stampNum}>{i + 1}</Text>
              }
            </View>
          );
        })}
      </View>

      {/* Progress bar */}
      <View style={styles.loyaltyTrack}>
        <View style={[styles.loyaltyFill, { width: `${pct * 100}%` }]} />
      </View>

      {/* Status text */}
      <Text style={styles.loyaltyStatus}>
        {current === 0
          ? 'Place your first order to earn a stamp!'
          : current >= total
            ? '🎉 You earned a free delivery! Applied on next order.'
            : `${stampsToNext} more stamp${stampsToNext > 1 ? 's' : ''} for a free delivery`}
      </Text>
    </View>
  );
}

// ── Invite Friends Card — P4-2A ────────────────────────────────
function InviteFriendsCard({ navigation }) {
  return (
    <TouchableOpacity
      style={styles.inviteCard}
      onPress={() => navigation.push('Referral')}
      accessibilityLabel="Invite friends and earn ₹50"
      accessibilityRole="button"
    >
      <View style={styles.inviteLeft}>
        <View style={styles.inviteIconWrap}>
          <Ionicons name="people" size={22} color={Colors.primary} />
        </View>
        <View style={styles.inviteText}>
          <Text style={styles.inviteTitle}>Invite friends — earn ₹50</Text>
          <Text style={styles.inviteSub}>Your friend gets ₹100 · you get ₹50</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
    </TouchableOpacity>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
function Skeleton({ width, height, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: 8, backgroundColor: Colors.skeleton }, style, { opacity }]}
    />
  );
}

// ── Balance Card ──────────────────────────────────────────────
function BalanceCard({ balancePaise, lifetimeEarned, lifetimeSpent }) {
  return (
    <View style={styles.balanceCard}>
      {/* Decorative circle */}
      <View style={styles.balanceDecor} />

      <Text style={styles.balanceLabel}>Wallet Balance</Text>
      <Text style={styles.balanceAmount}>{fmt.paise(balancePaise)}</Text>

      <View style={styles.lifetimeRow}>
        <View style={styles.lifetimeItem}>
          <Text style={styles.lifetimeVal}>{fmt.paiseNo(lifetimeEarned)}</Text>
          <Text style={styles.lifetimeKey}>Total Earned</Text>
        </View>
        <View style={styles.lifetimeDivider} />
        <View style={styles.lifetimeItem}>
          <Text style={styles.lifetimeVal}>{fmt.paiseNo(lifetimeSpent)}</Text>
          <Text style={styles.lifetimeKey}>Total Used</Text>
        </View>
      </View>
    </View>
  );
}

// ── Expiring Credits Warning ──────────────────────────────────
function ExpiringWarning({ transactions }) {
  const expiring = transactions.filter(t => t.expiring_soon && t.type.startsWith('credit_'));
  if (expiring.length === 0) return null;

  const totalExpiring = expiring.reduce((s, t) => s + t.amount_paise, 0);
  const soonestDays   = Math.min(...expiring.map(t => fmt.daysLeft(t.expires_at)));

  return (
    <View style={styles.expiryWarning}>
      <Ionicons name="warning-outline" size={18} color={Colors.warning} />
      <Text style={styles.expiryText}>
        <Text style={{ fontFamily: Typography.fontFamily.bold }}>
          {fmt.paiseNo(totalExpiring)}
        </Text>
        {' '}promo credit expires in{' '}
        <Text style={{ fontFamily: Typography.fontFamily.bold }}>
          {soonestDays} day{soonestDays !== 1 ? 's' : ''}
        </Text>
        . Use it before it vanishes!
      </Text>
    </View>
  );
}

// ── How To Earn strip ─────────────────────────────────────────
function HowToEarn() {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.earnCard}>
      <TouchableOpacity
        style={styles.earnHeader}
        onPress={() => setExpanded(e => !e)}
        accessibilityLabel="How to earn wallet credits"
      >
        <View style={styles.earnHeaderLeft}>
          <Ionicons name="wallet-outline" size={18} color={Colors.primary} />
          <Text style={styles.earnTitle}>How to earn wallet credits</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.earnBody}>
          {HOW_TO_EARN.map((item, i) => (
            <View key={i} style={styles.earnRow}>
              <View style={[styles.earnIconWrap, { backgroundColor: item.color + '22' }]}>
                <Ionicons name={item.icon} size={16} color={item.color} />
              </View>
              <Text style={styles.earnText}>{item.text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Transaction Row ───────────────────────────────────────────
function TxnRow({ txn }) {
  const meta     = TXN_META[txn.type] || TXN_META.debit_order;
  const isCredit = txn.type.startsWith('credit_');
  const daysLeft = fmt.daysLeft(txn.expires_at);

  return (
    <View style={styles.txnRow}>
      {/* Icon */}
      <View style={[styles.txnIconWrap, { backgroundColor: meta.color + '18' }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>

      {/* Text */}
      <View style={styles.txnInfo}>
        <Text style={styles.txnLabel} numberOfLines={1}>
          {txn.description || meta.label}
        </Text>
        <Text style={styles.txnDate}>{fmt.date(txn.created_at)}</Text>
        {txn.expires_at && daysLeft !== null && daysLeft > 0 && (
          <Text style={[styles.txnExpiry, txn.expiring_soon && styles.txnExpirySoon]}>
            Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
          </Text>
        )}
        {txn.is_expired && (
          <Text style={styles.txnExpiredBadge}>Expired</Text>
        )}
      </View>

      {/* Amount */}
      <Text style={[styles.txnAmount, isCredit ? styles.txnCredit : styles.txnDebit]}>
        {meta.sign}{fmt.paise(txn.amount_paise)}
      </Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function WalletScreen() {
  const navigation = useNavigation(); // P4-2A
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey:  ['wallet'],
    queryFn:   () => getWallet(50),
    staleTime: 30 * 1000,
  });

  // Loyalty stamp progress — fetched independently so wallet still works if this fails
  const { data: loyaltyData } = useQuery({
    queryKey:  ['loyalty'],
    queryFn:   getLoyalty,
    staleTime: 2 * 60 * 1000,   // stamps are earned on order delivery — 2 min cache is plenty
    retry:     1,
  });
  const loyalty = loyaltyData;   // { current_cycle, stamps_per_reward, stamps_to_next, rewards_earned, ... }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.loadingContent}>
          <Skeleton width="100%" height={180} style={{ marginBottom: 16 }} />
          <Skeleton width="100%" height={60}  style={{ marginBottom: 16 }} />
          <Skeleton width="100%" height={56}  style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={56}  style={{ marginBottom: 8 }} />
          <Skeleton width="100%" height={56} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.errorWrap}>
          <Ionicons name="cloud-offline-outline" size={40} color={Colors.error} />
          <Text style={styles.errorTitle}>Couldn't load wallet</Text>
          <Text style={styles.errorDesc}>{error?.message || 'Check your connection'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refetch}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const balance      = data?.balance_paise         || 0;
  const earned       = data?.lifetime_earned_paise  || 0;
  const spent        = data?.lifetime_spent_paise   || 0;
  const transactions = data?.transactions           || [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.primary} />
        }
      >
        {/* Balance card */}
        <BalanceCard
          balancePaise={balance}
          lifetimeEarned={earned}
          lifetimeSpent={spent}
        />

        <View style={styles.body}>
          {/* Expiring credits warning */}
          <ExpiringWarning transactions={transactions} />

          {/* P4-2A: Invite Friends card (replaces coming soon placeholder) */}
          <InviteFriendsCard navigation={navigation} />

          {/* P19-5: Loyalty Stamp Card — progress toward free delivery */}
          <LoyaltyStampCard loyalty={loyalty} />

          {/* How to earn */}
          <HowToEarn />

          {/* Transaction history */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transaction History</Text>

            {transactions.length === 0 ? (
              <View style={styles.emptyTxn}>
                <Ionicons name="receipt-outline" size={36} color={Colors.textTertiary} />
                <Text style={styles.emptyTxnText}>
                  {balance === 0
                    ? 'Your wallet is empty. Cancel an eligible order to get an instant refund here!'
                    : 'No transactions yet.'
                  }
                </Text>
              </View>
            ) : (
              <View style={styles.txnList}>
                {transactions.map(txn => (
                  <TxnRow key={txn.id} txn={txn} />
                ))}
              </View>
            )}
          </View>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: Colors.background },
  loadingContent:{ padding: Spacing[4] },

  // Balance card
  balanceCard: {
    backgroundColor: Colors.secondary,
    paddingTop:      Spacing[6],
    paddingBottom:   Spacing[6],
    paddingHorizontal: Spacing[6],
    overflow: 'hidden',
    position: 'relative',
  },
  balanceDecor: {
    position: 'absolute', top: -40, right: -40,
    width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  balanceLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      'rgba(255,255,255,0.7)',
    marginBottom: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   42,
    color:      '#FFFFFF',
    marginBottom: Spacing[4],
    letterSpacing: -1,
  },
  lifetimeRow:   { flexDirection: 'row', alignItems: 'center' },
  lifetimeItem:  { flex: 1 },
  lifetimeDivider:{
    width: 1, height: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: Spacing[4],
  },
  lifetimeVal: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.md,
    color:      '#FFFFFF',
  },
  lifetimeKey: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      'rgba(255,255,255,0.6)',
    marginTop:  2,
  },

  body: { padding: Spacing[4] },

  // Expiry warning
  expiryWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2],
    backgroundColor: Colors.warningLight,
    borderRadius: BorderRadius.xl, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.warning + '60',
    marginBottom: Spacing[4],
  },
  expiryText: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.warning,
    lineHeight: 20,
  },

  // How to earn
  earnCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing[5], overflow: 'hidden',
    ...Shadow.sm,
  },
  earnHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing[4],
  },
  earnHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  earnTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.base,
    color:      Colors.text,
  },
  earnBody: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[4], gap: Spacing[3] },
  earnRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3] },
  earnIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  earnText: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    lineHeight: 18,
  },

  // Transactions
  section:      { marginBottom: Spacing[4] },
  sectionTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.md,
    color:      Colors.text,
    marginBottom: Spacing[3],
  },
  txnList: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    ...Shadow.sm,
  },
  txnRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    padding: Spacing[4],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  txnIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  txnInfo: { flex: 1 },
  txnLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.base,
    color:      Colors.text,
  },
  txnDate: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textTertiary,
    marginTop:  2,
  },
  txnExpiry: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textTertiary,
    marginTop:  2,
  },
  txnExpirySoon: { color: Colors.warning, fontFamily: Typography.fontFamily.semiBold },
  txnExpiredBadge: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.textTertiary,
    marginTop:  2,
  },
  txnAmount: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.md,
    flexShrink: 0,
  },
  txnCredit: { color: Colors.success },
  txnDebit:  { color: Colors.error },

  emptyTxn: {
    padding: Spacing[8], alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyTxnText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 20,
  },

  errorWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  errorTitle:{ fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.error },
  errorDesc: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center' },
  retryBtn:  { marginTop: 8, backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing[3], paddingHorizontal: Spacing[6] },
  retryText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: '#fff' },

  // P19-5: Loyalty Stamp Card
  loyaltyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.primary + '40',
    padding: Spacing[4], marginBottom: Spacing[4],
    ...Shadow.sm,
  },
  loyaltyHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing[4] },
  loyaltyTitle:     { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.text },
  loyaltySub:       { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
  loyaltyBadge:     { backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  loyaltyBadgeText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs, color: '#fff' },
  stampRow:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing[3] },
  stamp: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 2, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.background,
  },
  stampFilled:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stampNum:      { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.textSecondary },
  loyaltyTrack:  { height: 6, borderRadius: 3, backgroundColor: Colors.border, marginBottom: Spacing[3], overflow: 'hidden' },
  loyaltyFill:   { height: '100%', borderRadius: 3, backgroundColor: Colors.primary },
  loyaltyStatus: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center' },

  // P4-2A: Invite Friends card
  inviteCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.primary + '40',
    padding: Spacing[4], marginBottom: Spacing[4],
    ...Shadow.sm,
  },
  inviteLeft:    { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], flex: 1 },
  inviteIconWrap:{ width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  inviteText:    { flex: 1 },
  inviteTitle:   { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.text },
  inviteSub:     { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
});
