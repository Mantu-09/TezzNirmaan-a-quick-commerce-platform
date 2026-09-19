/**
 * PassScreen — P5-3: TezzNirmaan Pass
 *
 * Two states:
 *   ACTIVE   → savings card + days-remaining progress bar + cancel option
 *   INACTIVE → plan picker (Weekly / Monthly) + benefit pills
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { formatPaise } from '../../utils/money';
import * as passApi from '../../api/pass';

// ── Constants ─────────────────────────────────────────────────
const GOLD_GRADIENT  = ['#F59E0B', '#D97706', '#B45309'];
const GREEN_GRADIENT = ['#10B981', '#059669', '#047857'];
const CARD_GRADIENT  = ['#1E293B', '#0F172A'];

// ── Progress bar for days remaining ──────────────────────────
function DaysProgress({ daysLeft, totalDays }) {
  const pct = Math.min(1, daysLeft / totalDays);
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

// ── Single benefit pill ───────────────────────────────────────
function BenefitPill({ icon, label }) {
  return (
    <View style={styles.benefitPill}>
      <Ionicons name={icon} size={16} color={Colors.primary} />
      <Text style={styles.benefitText}>{label}</Text>
    </View>
  );
}

// ── Plan card ─────────────────────────────────────────────────
function PlanCard({ plan, isRecommended, onSelect, loading }) {
  const weekly  = plan.tier === 'weekly';
  const priceRs = Math.round(plan.price_paise / 100);

  return (
    <TouchableOpacity
      style={[styles.planCard, isRecommended && styles.planCardRecommended]}
      onPress={() => onSelect(plan)}
      activeOpacity={0.85}
      disabled={loading}
    >
      {isRecommended && (
        <View style={styles.recommendedBadge}>
          <Text style={styles.recommendedBadgeText}>⭐ Best value</Text>
        </View>
      )}

      <LinearGradient
        colors={weekly ? GOLD_GRADIENT : GREEN_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.planGradient}
      >
        <Text style={styles.planEmoji}>{weekly ? '⚡' : '🏆'}</Text>
      </LinearGradient>

      <Text style={styles.planName}>{plan.name}</Text>
      <Text style={styles.planPrice}>
        ₹{priceRs}
        <Text style={styles.planPeriod}>/{weekly ? 'week' : 'month'}</Text>
      </Text>

      <View style={styles.planBenefits}>
        <Text style={styles.planBenefitLine}>🚚 Free delivery on every order</Text>
        <Text style={styles.planBenefitLine}>
          💰 {plan.cashback_multiplier}× cashback
        </Text>
        <Text style={styles.planBenefitLine}>✅ Cancel anytime</Text>
      </View>

      <View style={[
        styles.planButton,
        { backgroundColor: weekly ? '#D97706' : '#059669' }
      ]}>
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.planButtonText}>
              {weekly ? 'Get Weekly Pass' : 'Get Monthly Pass'}
            </Text>
        }
      </View>
    </TouchableOpacity>
  );
}

// ── Active subscription card ──────────────────────────────────
function ActiveCard({ sub, onCancel, cancelling }) {
  const plan      = sub.pass_plans;
  const totalDays = plan?.tier === 'weekly' ? 7 : 30;
  const expiryStr = new Date(sub.expires_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long',
  });
  const savedRs = Math.round((sub.totalWaivedPaise || 0) / 100);

  return (
    <LinearGradient colors={CARD_GRADIENT} style={styles.activeCard}>
      {/* Header row */}
      <View style={styles.activeHeader}>
        <View>
          <Text style={styles.activeTitle}>🎫 TezzNirmaan Pass</Text>
          <Text style={styles.activePlanName}>{plan?.name}</Text>
        </View>
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>ACTIVE</Text>
        </View>
      </View>

      {/* Savings row */}
      {savedRs > 0 && (
        <View style={styles.savingsRow}>
          <Ionicons name="trending-up" size={18} color="#34D399" />
          <Text style={styles.savingsText}>
            You've saved <Text style={styles.savingsAmount}>₹{savedRs}</Text> this cycle
          </Text>
        </View>
      )}

      {/* Days progress */}
      <View style={styles.daysRow}>
        <Text style={styles.daysLabel}>Active until {expiryStr}</Text>
        <Text style={styles.daysCount}>{sub.daysLeft} days left</Text>
      </View>
      <DaysProgress daysLeft={sub.daysLeft} totalDays={totalDays} />

      {/* Cashback pill */}
      <View style={styles.multiplierRow}>
        <Ionicons name="flash" size={14} color="#FBBF24" />
        <Text style={styles.multiplierText}>
          {plan?.cashback_multiplier}× cashback on every order
        </Text>
      </View>

      {/* Cancel option */}
      {sub.auto_renew && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          disabled={cancelling}
        >
          {cancelling
            ? <ActivityIndicator color={Colors.textTertiary} size="small" />
            : <Text style={styles.cancelBtnText}>Cancel auto-renewal</Text>
          }
        </TouchableOpacity>
      )}
      {!sub.auto_renew && (
        <Text style={styles.autoRenewOff}>
          Auto-renewal off · Access until {expiryStr}
        </Text>
      )}
    </LinearGradient>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function PassScreen() {
  const queryClient = useQueryClient();
  const [buyingPlanId, setBuyingPlanId] = useState(null);

  // Fetch plans (public)
  const { data: plansRes, isLoading: plansLoading } = useQuery({
    queryKey: ['pass-plans'],
    queryFn:  passApi.getPassPlans,
    staleTime: 10 * 60 * 1000, // 10 min — plans rarely change
  });

  // Fetch user's current subscription
  const { data: subRes, isLoading: subLoading } = useQuery({
    queryKey: ['my-pass'],
    queryFn:  passApi.getMyPass,
    staleTime: 60 * 1000,
  });

  const plans = plansRes?.data?.plans || [];
  const sub   = subRes?.data?.subscription;  // null if no active pass

  // Purchase mutation — in prod this would first create a Razorpay order
  // For MVP: pass payment_id = null (shop owner activates manually or in dev mode)
  const purchaseMutation = useMutation({
    mutationFn: ({ planId }) => passApi.purchasePass(planId, null),
    onMutate:   ({ planId }) => setBuyingPlanId(planId),
    onSettled:  () => setBuyingPlanId(null),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: ['my-pass'] });
      Alert.alert('🎉 Pass Activated!', 'Enjoy free delivery and bonus cashback on every order.');
    },
    onError: (err) => {
      Alert.alert('Purchase Failed', err?.message || 'Please try again.');
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: passApi.cancelPass,
    onSuccess:  (res) => {
      queryClient.invalidateQueries({ queryKey: ['my-pass'] });
      Alert.alert('Cancelled', res?.data?.message || 'Auto-renewal cancelled.');
    },
    onError: (err) => {
      Alert.alert('Error', err?.message || 'Could not cancel. Try again.');
    },
  });

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Cancel Auto-renewal?',
      'You keep access until your pass expires. We won\'t charge you again.',
      [
        { text: 'Keep Pass', style: 'cancel' },
        { text: 'Cancel Auto-renewal', style: 'destructive',
          onPress: () => cancelMutation.mutate() },
      ]
    );
  }, [cancelMutation]);

  const isLoading = plansLoading || subLoading;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🎫 TezzNirmaan Pass</Text>
          <Text style={styles.headerSub}>
            Free delivery on every order. More cashback. Cancel anytime.
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing[8] }} />
        ) : sub?.isActive ? (
          /* ── Active subscriber view ── */
          <>
            <ActiveCard
              sub={sub}
              onCancel={handleCancel}
              cancelling={cancelMutation.isPending}
            />

            {/* Benefits reminder */}
            <Text style={styles.sectionTitle}>Your pass benefits</Text>
            <View style={styles.benefitGrid}>
              <BenefitPill icon="bicycle-outline"  label="Free delivery always" />
              <BenefitPill icon="flash-outline"     label={`${sub.pass_plans?.cashback_multiplier}× cashback`} />
              <BenefitPill icon="time-outline"      label="Priority support" />
              <BenefitPill icon="close-circle-outline" label="Cancel anytime" />
            </View>
          </>
        ) : (
          /* ── Plan picker view ── */
          <>
            <Text style={styles.sectionTitle}>Choose your pass</Text>
            <View style={styles.plansRow}>
              {plans.map((plan, idx) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  isRecommended={plan.tier === 'monthly'}
                  loading={buyingPlanId === plan.id}
                  onSelect={(p) => purchaseMutation.mutate({ planId: p.id })}
                />
              ))}
            </View>

            {/* Bottom benefit pills */}
            <Text style={styles.sectionTitle}>Why get a Pass?</Text>
            <View style={styles.benefitGrid}>
              <BenefitPill icon="bicycle-outline"  label="Free delivery on every order" />
              <BenefitPill icon="flash-outline"     label="1.5–2× cashback multiplier" />
              <BenefitPill icon="shield-checkmark-outline" label="No minimum order value" />
              <BenefitPill icon="close-circle-outline"     label="Cancel anytime, no questions" />
            </View>

            <Text style={styles.finePrint}>
              * Pass activates immediately after payment. Delivery fee waiver applies to
              all orders placed while pass is active. Cashback is awarded on delivery
              confirmation per our standard policy.
            </Text>
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
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: Spacing[4],
    paddingBottom: Spacing[10],
  },

  // Header
  header: {
    marginBottom: Spacing[5],
  },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size['2xl'],
    color:      Colors.text,
    marginBottom: Spacing[1],
  },
  headerSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    lineHeight: 20,
  },

  sectionTitle: {
    fontFamily:   Typography.fontFamily.semiBold,
    fontSize:     Typography.size.md,
    color:        Colors.text,
    marginTop:    Spacing[5],
    marginBottom: Spacing[3],
  },

  // Plan cards
  plansRow: {
    flexDirection: 'row',
    gap:           Spacing[3],
  },
  planCard: {
    flex:            1,
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.xl,
    padding:         Spacing[4],
    borderWidth:     1,
    borderColor:     Colors.border,
    ...Shadow.card,
  },
  planCardRecommended: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  recommendedBadge: {
    backgroundColor: Colors.primary + '20',
    borderRadius:    BorderRadius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical:   2,
    alignSelf:       'flex-start',
    marginBottom:    Spacing[2],
  },
  recommendedBadgeText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.primary,
  },
  planGradient: {
    width:  44,
    height: 44,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems:     'center',
    marginBottom:   Spacing[2],
  },
  planEmoji: {
    fontSize: 22,
  },
  planName: {
    fontFamily:   Typography.fontFamily.bold,
    fontSize:     Typography.size.md,
    color:        Colors.text,
    marginBottom: Spacing[1],
  },
  planPrice: {
    fontFamily:   Typography.fontFamily.bold,
    fontSize:     Typography.size.xl,
    color:        Colors.text,
    marginBottom: Spacing[3],
  },
  planPeriod: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
  },
  planBenefits: {
    gap:          Spacing[1],
    marginBottom: Spacing[3],
  },
  planBenefitLine: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
  },
  planButton: {
    borderRadius:    BorderRadius.lg,
    paddingVertical: Spacing[3],
    alignItems:      'center',
  },
  planButtonText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      '#FFFFFF',
  },

  // Active card
  activeCard: {
    borderRadius: BorderRadius.xl,
    padding:      Spacing[5],
    ...Shadow.lg,
  },
  activeHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   Spacing[3],
  },
  activeTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.lg,
    color:      '#FFFFFF',
  },
  activePlanName: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      'rgba(255,255,255,0.7)',
    marginTop:  2,
  },
  activeBadge: {
    backgroundColor: '#10B981',
    borderRadius:    BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical:   Spacing[1],
  },
  activeBadgeText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.xs,
    color:      '#FFFFFF',
    letterSpacing: 1,
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[2],
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderRadius:    BorderRadius.lg,
    padding:         Spacing[3],
    marginBottom:    Spacing[3],
  },
  savingsText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      '#A7F3D0',
  },
  savingsAmount: {
    fontFamily: Typography.fontFamily.bold,
    color:      '#34D399',
  },
  daysRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginBottom:   Spacing[2],
  },
  daysLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      'rgba(255,255,255,0.7)',
  },
  daysCount: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      '#FFFFFF',
  },
  progressTrack: {
    height:           6,
    backgroundColor:  'rgba(255,255,255,0.15)',
    borderRadius:     3,
    overflow:         'hidden',
    marginBottom:     Spacing[3],
  },
  progressFill: {
    height:          '100%',
    backgroundColor: '#34D399',
    borderRadius:    3,
  },
  multiplierRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[2],
    marginBottom:  Spacing[4],
  },
  multiplierText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      '#FDE68A',
  },
  cancelBtn: {
    borderWidth:    1,
    borderColor:    'rgba(255,255,255,0.25)',
    borderRadius:   BorderRadius.lg,
    paddingVertical: Spacing[2],
    alignItems:     'center',
  },
  cancelBtnText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      'rgba(255,255,255,0.6)',
  },
  autoRenewOff: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      'rgba(255,255,255,0.5)',
    textAlign:  'center',
    marginTop:  Spacing[2],
  },

  // Benefit pills
  benefitGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           Spacing[2],
  },
  benefitPill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing[2],
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.full,
    borderWidth:     1,
    borderColor:     Colors.border,
    paddingHorizontal: Spacing[3],
    paddingVertical:   Spacing[2],
  },
  benefitText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.text,
  },

  // Fine print
  finePrint: {
    fontFamily:  Typography.fontFamily.regular,
    fontSize:    Typography.size.xs,
    color:       Colors.textTertiary,
    lineHeight:  18,
    marginTop:   Spacing[5],
    paddingHorizontal: Spacing[1],
  },
});
