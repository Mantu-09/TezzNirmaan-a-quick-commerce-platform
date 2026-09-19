// ────────────────────────────────────────────────────────────
// Referral Screen — P4-2A
//
// Shows the customer's unique referral code, share options,
// and their earnings history.
//
// Sections:
//   1. Hero card — code + one-tap Share on WhatsApp
//   2. How it works — 2-step visual flow
//   3. Stats strip — friends invited, total earned
//   4. Events list — rewarded + pending referrals
//
// Navigation: push from WalletScreen "Invite Friends" card
// ────────────────────────────────────────────────────────────
import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Clipboard, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useCityStore from '../../store/cityStore'; // P4-4A — dynamic city for share copy

// ── API helper ────────────────────────────────────────────────
async function fetchReferralStats() {
  const { data } = await apiClient.get('/customer/referral');
  return data.data;
}

// ── Formatters ────────────────────────────────────────────────
const fmt = {
  paise: v => `₹${Math.floor((v || 0) / 100).toLocaleString('en-IN')}`,
  date:  d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
};

// ── Code Box ──────────────────────────────────────────────────
function CodeBox({ code, shareUrl, cityName, onCopied }) {
  const handleCopy = useCallback(async () => {
    Clipboard.setString(shareUrl);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onCopied?.();
  }, [shareUrl, onCopied]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message:
          `Order hardware, cement, paint & more from TezzNirmaan in ${cityName} — delivered in 60 min!\n\n` +
          `Use my code ${code} to get ₹100 off your first order. 🎁\n\n` +
          `Download the app: ${shareUrl}`,
        title: 'Join TezzNirmaan — get ₹100 off!',
      });
    } catch (e) {
      // Share sheet dismissed — no-op
    }
  }, [code, shareUrl, cityName]);

  return (
    <View style={styles.codeCard}>
      <Text style={styles.codeLabel}>Your referral code</Text>

      <View style={styles.codeRow}>
        <Text style={styles.codeText}>{code}</Text>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={handleCopy}
          accessibilityLabel="Copy referral code"
          accessibilityRole="button"
        >
          <Ionicons name="copy-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.whatsappBtn}
        onPress={handleShare}
        accessibilityLabel="Share on WhatsApp"
        accessibilityRole="button"
      >
        <Ionicons name="logo-whatsapp" size={20} color="#fff" />
        <Text style={styles.whatsappText}>Share on WhatsApp</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.copyLinkBtn} onPress={handleCopy}>
        <Ionicons name="link-outline" size={16} color={Colors.primary} />
        <Text style={styles.copyLinkText}>Copy invite link</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── How It Works ──────────────────────────────────────────────
function HowItWorks() {
  return (
    <View style={styles.howCard}>
      <Text style={styles.sectionTitle}>How it works</Text>
      <View style={styles.stepsRow}>

        <View style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: Colors.info + '22' }]}>
            <Ionicons name="person-add-outline" size={20} color={Colors.info} />
          </View>
          <Text style={styles.stepNum}>1</Text>
          <Text style={styles.stepText}>Friend signs up with your code</Text>
          <View style={[styles.stepBadge, { backgroundColor: Colors.info + '18' }]}>
            <Text style={[styles.stepBadgeText, { color: Colors.info }]}>They get ₹100</Text>
          </View>
        </View>

        <View style={styles.stepArrow}>
          <Ionicons name="arrow-forward" size={18} color={Colors.textTertiary} />
        </View>

        <View style={styles.step}>
          <View style={[styles.stepIcon, { backgroundColor: Colors.success + '22' }]}>
            <Ionicons name="bag-check-outline" size={20} color={Colors.success} />
          </View>
          <Text style={styles.stepNum}>2</Text>
          <Text style={styles.stepText}>Friend places first order</Text>
          <View style={[styles.stepBadge, { backgroundColor: Colors.success + '18' }]}>
            <Text style={[styles.stepBadgeText, { color: Colors.success }]}>You get ₹50</Text>
          </View>
        </View>

      </View>
    </View>
  );
}

// ── Stats Strip ───────────────────────────────────────────────
function StatsStrip({ timesUsed, totalEarnedPaise, pendingCount, rewardedCount }) {
  return (
    <View style={styles.statsRow}>
      <View style={styles.statItem}>
        <Text style={styles.statVal}>{timesUsed || 0}</Text>
        <Text style={styles.statKey}>Friends invited</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={[styles.statVal, { color: Colors.success }]}>{fmt.paise(totalEarnedPaise)}</Text>
        <Text style={styles.statKey}>Total earned</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Text style={styles.statVal}>{pendingCount || 0}</Text>
        <Text style={styles.statKey}>Pending orders</Text>
      </View>
    </View>
  );
}

// ── Event Row ─────────────────────────────────────────────────
function EventRow({ event, index }) {
  const isPending  = event.status === 'pending';
  const isRewarded = event.status === 'rewarded';

  return (
    <View style={styles.eventRow}>
      <View style={[styles.eventIcon, { backgroundColor: isPending ? Colors.warning + '20' : Colors.success + '20' }]}>
        <Ionicons
          name={isPending ? 'time-outline' : 'checkmark-circle-outline'}
          size={18}
          color={isPending ? Colors.warning : Colors.success}
        />
      </View>
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle}>
          {isPending ? `Friend #${index + 1} signed up` : `Friend #${index + 1} ordered`}
        </Text>
        <Text style={styles.eventSub}>
          {isPending
            ? 'Waiting for their first order…'
            : `Reward unlocked · ${fmt.date(event.rewarded_at)}`}
        </Text>
      </View>
      {isRewarded && (
        <Text style={styles.eventAmount}>+{fmt.paise(event.earned_paise)}</Text>
      )}
      {isPending && (
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingText}>Pending</Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function ReferralScreen() {
  const [copied, setCopied] = React.useState(false);
  const { selectedCity } = useCityStore(); // P6-0C: dynamic city for share copy
  const cityName = selectedCity?.name || 'your city';

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey:  ['referral-stats'],
    queryFn:   fetchReferralStats,
    staleTime: 60 * 1000,
  });

  const handleCopied = useCallback(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={Colors.error} />
          <Text style={styles.errorTitle}>Couldn't load referral data</Text>
          <Text style={styles.errorSub}>{error?.message || 'Check your connection'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refetch}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const events = data?.events || [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {copied && (
        <View style={styles.toast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <Text style={styles.toastText}>Link copied to clipboard!</Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.primary} />}
        contentContainerStyle={styles.scroll}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🎁</Text>
          <Text style={styles.heroTitle}>Invite friends, earn ₹50</Text>
          <Text style={styles.heroSub}>
            Share your code. Your friend gets <Text style={styles.heroHighlight}>₹100</Text> off their first order.
            You get <Text style={styles.heroHighlight}>₹50</Text> when they do.
          </Text>
        </View>

        {/* Code box */}
        {data?.code && (
          <CodeBox
            code={data.code}
            shareUrl={data.share_url}
            cityName={cityName}
            onCopied={handleCopied}
          />
        )}

        {/* How it works */}
        <HowItWorks />

        {/* Stats */}
        <StatsStrip
          timesUsed={data?.times_used}
          totalEarnedPaise={data?.total_earned_paise}
          pendingCount={data?.pending_count}
          rewardedCount={data?.rewarded_count}
        />

        {/* Events list */}
        {events.length > 0 && (
          <View style={styles.eventsCard}>
            <Text style={styles.sectionTitle}>Your referrals</Text>
            {events.map((event, i) => (
              <EventRow key={event.id} event={event} index={i} />
            ))}
          </View>
        )}

        {events.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={36} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>
              No referrals yet — share your code and start earning!
            </Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[4] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },

  // Toast
  toast: {
    position: 'absolute', top: 16, alignSelf: 'center', zIndex: 99,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.success, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 16,
    ...Shadow.md,
  },
  toastText: { color: '#fff', fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },

  // Hero
  hero: {
    alignItems: 'center', paddingVertical: Spacing[6],
    paddingHorizontal: Spacing[4], marginBottom: Spacing[4],
  },
  heroEmoji:     { fontSize: 48, marginBottom: Spacing[3] },
  heroTitle:     { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.text, textAlign: 'center', marginBottom: Spacing[2] },
  heroSub:       { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  heroHighlight: { fontFamily: Typography.fontFamily.bold, color: Colors.primary },

  // Code card
  codeCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius['2xl'],
    borderWidth: 1, borderColor: Colors.border, padding: Spacing[5],
    marginBottom: Spacing[4], alignItems: 'center', ...Shadow.sm,
  },
  codeLabel: {
    fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm,
    color: Colors.textTertiary, textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: Spacing[3],
  },
  codeRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.xl,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[5],
    marginBottom: Spacing[4],
  },
  codeText: {
    fontFamily: Typography.fontFamily.bold, fontSize: 28,
    color: Colors.primary, letterSpacing: 4, flex: 1, textAlign: 'center',
  },
  copyBtn: { padding: Spacing[2] },

  whatsappBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: '#25D366', borderRadius: BorderRadius.xl,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[6],
    marginBottom: Spacing[2], ...Shadow.sm,
  },
  whatsappText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: '#fff' },

  copyLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], padding: Spacing[2] },
  copyLinkText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.primary },

  // How it works
  howCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius['2xl'],
    borderWidth: 1, borderColor: Colors.border, padding: Spacing[5],
    marginBottom: Spacing[4], ...Shadow.sm,
  },
  stepsRow:    { flexDirection: 'row', alignItems: 'center', marginTop: Spacing[4] },
  step:        { flex: 1, alignItems: 'center', gap: Spacing[2] },
  stepArrow:   { paddingHorizontal: Spacing[2] },
  stepIcon:    { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  stepNum:     { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs, color: Colors.textTertiary },
  stepText:    { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text, textAlign: 'center', lineHeight: 18 },
  stepBadge:   { borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10 },
  stepBadgeText:{ fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs },

  // Stats
  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: BorderRadius['2xl'], borderWidth: 1, borderColor: Colors.border,
    padding: Spacing[4], marginBottom: Spacing[4], ...Shadow.sm,
  },
  statItem:   { flex: 1, alignItems: 'center' },
  statDivider:{ width: 1, backgroundColor: Colors.border, marginHorizontal: Spacing[2] },
  statVal:    { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text },
  statKey:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2, textAlign: 'center' },

  // Events
  eventsCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius['2xl'],
    borderWidth: 1, borderColor: Colors.border, padding: Spacing[5],
    marginBottom: Spacing[4], ...Shadow.sm,
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  eventIcon:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  eventInfo:   { flex: 1 },
  eventTitle:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text },
  eventSub:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  eventAmount: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.success, flexShrink: 0 },
  pendingBadge:{ backgroundColor: Colors.warning + '20', borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8 },
  pendingText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, color: Colors.warning },

  // Empty
  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius['2xl'],
    borderWidth: 1, borderColor: Colors.border, padding: Spacing[8],
    alignItems: 'center', gap: Spacing[3], ...Shadow.sm,
  },
  emptyText: {
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm,
    color: Colors.textSecondary, textAlign: 'center', lineHeight: 20,
  },

  // Error
  errorTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.error },
  errorSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center' },
  retryBtn:   { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing[3], paddingHorizontal: Spacing[6], marginTop: 8 },
  retryText:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: '#fff' },

  // Section title (shared)
  sectionTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.text, marginBottom: Spacing[2] },
});
