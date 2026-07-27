// ────────────────────────────────────────────────────────────
// ContractorApplyScreen — P6-6
//
// Allows any authenticated user to apply for a B2B contractor
// account. Shows current status if an application already exists.
// ────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { applyForContractor, getContractorProfile } from '../../api/b2b';
import { formatPaise } from '../../utils/money';

// ── Radio group helper ────────────────────────────────────────
function RadioGroup({ label, options, value, onChange }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={styles.radioRow}
          onPress={() => onChange(opt.value)}
          activeOpacity={0.7}
        >
          <View style={styles.radioOuter}>
            {value === opt.value && <View style={styles.radioInner} />}
          </View>
          <Text style={styles.radioLabel}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Status card (post-application) ───────────────────────────
function StatusCard({ profile }) {
  const isVerified = profile.is_verified;
  const isRejected = !!profile.rejection_reason;

  const config = isVerified
    ? { icon: 'checkmark-circle', color: Colors.success, bg: Colors.successLight, title: 'Account Verified ✓', sub: `${profile.company_name} · Discount: ${profile.discount_percent}%` }
    : isRejected
    ? { icon: 'close-circle', color: Colors.error, bg: Colors.errorLight ?? '#fef2f2', title: 'Application Rejected', sub: profile.rejection_reason }
    : { icon: 'time-outline', color: Colors.warning, bg: Colors.warningLight, title: 'Under Review', sub: 'Verification takes 1–2 business days.' };

  return (
    <View style={[styles.statusCard, { backgroundColor: config.bg, borderColor: config.color + '40' }]}>
      <Ionicons name={config.icon} size={32} color={config.color} />
      <View style={{ flex: 1, marginLeft: Spacing[3] }}>
        <Text style={[styles.statusTitle, { color: config.color }]}>{config.title}</Text>
        <Text style={styles.statusSub}>{config.sub}</Text>
        {isVerified && (
          <View style={styles.creditRow}>
            <Text style={styles.creditLabel}>
              Credit Limit: <Text style={styles.creditVal}>{formatPaise(profile.credit_limit_paise)}</Text>
            </Text>
            <Text style={styles.creditLabel}>
              Terms: <Text style={styles.creditVal}>
                {profile.payment_terms_days === 0 ? 'Cash only' : `Net ${profile.payment_terms_days} days`}
              </Text>
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
const VOLUME_OPTIONS = [
  { value: 'under_50k',      label: 'Under ₹50,000 / month' },
  { value: '50k_to_200k',   label: '₹50,000 – ₹2,00,000 / month' },
  { value: 'above_200k',    label: 'Above ₹2,00,000 / month' },
];

const TERMS_OPTIONS = [
  { value: 0,  label: 'Cash only (no credit)' },
  { value: 7,  label: 'Net 7 days' },
  { value: 15, label: 'Net 15 days' },
  { value: 30, label: 'Net 30 days' },
];

export default function ContractorApplyScreen({ navigation }) {
  const queryClient = useQueryClient();

  const [companyName,       setCompanyName]       = useState('');
  const [gstNumber,         setGstNumber]         = useState('');
  const [panNumber,         setPanNumber]         = useState('');
  const [volumeBand,        setVolumeBand]        = useState('50k_to_200k');
  const [requestedTerms,    setRequestedTerms]    = useState(7);

  // Check if already applied
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['contractor-profile'],
    queryFn:  getContractorProfile,
    retry:    false,
  });
  const existingProfile = profileData?.profile;

  const { mutate: submitApplication, isLoading: submitting } = useMutation({
    mutationFn: () => applyForContractor({
      companyName:           companyName.trim(),
      gstNumber:             gstNumber.trim() || undefined,
      panNumber:             panNumber.trim() || undefined,
      monthlyVolumeBand:     volumeBand,
      requestedPaymentTerms: requestedTerms,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractor-profile'] });
      Alert.alert(
        'Application Submitted ✓',
        'Our team will review your application within 1–2 business days. You\'ll receive a notification when it\'s approved.',
        [{ text: 'OK' }]
      );
    },
    onError: (err) => {
      Alert.alert('Submission Failed', err.message || 'Something went wrong. Please try again.');
    },
  });

  const handleSubmit = () => {
    if (!companyName.trim()) {
      Alert.alert('Required', 'Please enter your company name.'); return;
    }
    submitApplication();
  };

  if (profileLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero header */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="business" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Contractor Account</Text>
          <Text style={styles.heroSub}>
            Unlock bulk pricing, credit terms, and GST invoices — built for construction contractors.
          </Text>
        </View>

        {/* If already applied → show status */}
        {existingProfile ? (
          <>
            <StatusCard profile={existingProfile} />
            {existingProfile.is_verified && (
              <TouchableOpacity
                style={styles.invoiceBtn}
                onPress={() => navigation.navigate('ContractorInvoices')}
              >
                <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
                <Text style={styles.invoiceBtnText}>View GST Invoices</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {/* Benefits strip */}
            <View style={styles.benefitsRow}>
              {[
                { icon: 'pricetag-outline',   label: 'Volume Discounts' },
                { icon: 'time-outline',        label: 'Credit Terms' },
                { icon: 'document-text-outline', label: 'GST Invoices' },
              ].map(b => (
                <View key={b.label} style={styles.benefitChip}>
                  <Ionicons name={b.icon} size={16} color={Colors.secondary} />
                  <Text style={styles.benefitText}>{b.label}</Text>
                </View>
              ))}
            </View>

            {/* Form */}
            <View style={styles.card}>
              {/* Company name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Company Name *</Text>
                <TextInput
                  style={styles.input}
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="e.g. Sharma Constructions Pvt Ltd"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              {/* GST Number */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>GST Number <Text style={styles.optional}>(optional)</Text></Text>
                <TextInput
                  style={styles.input}
                  value={gstNumber}
                  onChangeText={setGstNumber}
                  placeholder="e.g. 10AABCS1429B1Z7"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="characters"
                  maxLength={15}
                />
              </View>

              {/* PAN Number */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>PAN Number <Text style={styles.optional}>(optional)</Text></Text>
                <TextInput
                  style={styles.input}
                  value={panNumber}
                  onChangeText={setPanNumber}
                  placeholder="e.g. AABCS1429B"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="characters"
                  maxLength={10}
                />
              </View>
            </View>

            {/* Volume */}
            <View style={styles.card}>
              <RadioGroup
                label="Monthly Order Estimate"
                options={VOLUME_OPTIONS}
                value={volumeBand}
                onChange={setVolumeBand}
              />
            </View>

            {/* Credit terms */}
            <View style={styles.card}>
              <RadioGroup
                label="Credit Terms Requested"
                options={TERMS_OPTIONS}
                value={requestedTerms}
                onChange={setRequestedTerms}
              />
              <Text style={styles.termsNote}>
                Final credit limit and terms are set by our team after verification.
              </Text>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitBtnText}>Submit Application</Text>
              }
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              Verification takes 1–2 business days. You'll receive a push notification when approved.
            </Text>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[4] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Hero
  hero: { alignItems: 'center', paddingVertical: Spacing[5], marginBottom: Spacing[4] },
  heroIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing[3],
  },
  heroTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size['2xl'] ?? 24,
    color:      Colors.text,
    marginBottom: Spacing[2],
  },
  heroSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 20,
    paddingHorizontal: Spacing[5],
  },

  // Benefits chips
  benefitsRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginBottom:   Spacing[4],
    gap: Spacing[2],
  },
  benefitChip: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: Spacing[1],
    backgroundColor: Colors.secondaryLight,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
  },
  benefitText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.secondary,
    textAlign:  'center',
  },

  // Card wrapper
  card: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.xl,
    padding:         Spacing[4],
    marginBottom:    Spacing[4],
    ...Shadow.sm,
  },

  // Field
  fieldGroup: { marginBottom: Spacing[4] },
  fieldLabel: {
    fontFamily:   Typography.fontFamily.semiBold,
    fontSize:     Typography.size.sm,
    color:        Colors.text,
    marginBottom: Spacing[2],
  },
  optional: {
    fontFamily: Typography.fontFamily.regular,
    color:      Colors.textTertiary,
  },
  input: {
    borderWidth:  1.5,
    borderColor:  Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical:   Spacing[3],
    fontFamily:   Typography.fontFamily.regular,
    fontSize:     Typography.size.base,
    color:        Colors.text,
    backgroundColor: Colors.background,
  },

  // Radio
  radioRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[3],
    paddingVertical: Spacing[2],
  },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  radioInner: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  radioLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.text,
  },
  termsNote: {
    fontFamily:  Typography.fontFamily.regular,
    fontSize:    Typography.size.xs,
    color:       Colors.textTertiary,
    marginTop:   Spacing[2],
    lineHeight:  16,
  },

  // Submit
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    BorderRadius.xl,
    paddingVertical: Spacing[4],
    alignItems:      'center',
    marginBottom:    Spacing[3],
    ...Shadow.md,
  },
  submitBtnText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.base,
    color:      Colors.primaryText ?? '#fff',
    letterSpacing: 0.3,
  },
  disclaimer: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textTertiary,
    textAlign:  'center',
    lineHeight: 16,
  },

  // Status card
  statusCard: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    borderRadius:  BorderRadius.xl,
    borderWidth:   1,
    padding:       Spacing[4],
    marginBottom:  Spacing[4],
  },
  statusTitle: {
    fontFamily:   Typography.fontFamily.bold,
    fontSize:     Typography.size.md,
    marginBottom: Spacing[1],
  },
  statusSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    lineHeight: 18,
  },
  creditRow: { marginTop: Spacing[3], gap: Spacing[1] },
  creditLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
  },
  creditVal: {
    fontFamily: Typography.fontFamily.semiBold,
    color:      Colors.text,
  },

  // Invoice button
  invoiceBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing[2],
    backgroundColor: Colors.surface,
    borderRadius:   BorderRadius.xl,
    padding:        Spacing[4],
    ...Shadow.sm,
  },
  invoiceBtnText: {
    flex:       1,
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      Colors.primary,
  },
});
