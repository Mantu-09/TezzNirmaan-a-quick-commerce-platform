// ────────────────────────────────────────────────────────────
// RiderOnboardingScreen.jsx — Phase G
//
// Multi-step KYC onboarding for new riders.
// Shown when user.role === 'rider' && !kyc_complete.
//
// Steps:
//   1. Personal Info  (full_name, dob, gender)
//   2. Vehicle Info   (type, reg_number, model)
//   3. Documents      (Aadhaar, PAN, DL, RC, Insurance)
//   4. Bank Account   (account number, IFSC, holder name)
//   5. Review & Submit
//
// On submit → POST /rider/onboarding/submit
// After submit → navigate back to RiderNavigator
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView }  from 'react-native-safe-area-context';
import { Ionicons }      from '@expo/vector-icons';
import * as ImagePicker  from 'expo-image-picker';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useAuthStore       from '../../store/authStore';
import { client }         from '../../api/client';

const TOTAL_STEPS = 5;

const VEHICLE_TYPES = ['Bicycle', 'Motorcycle', 'Scooter', 'E-Bike', 'E-Scooter'];
const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

// ── Document Upload Item ─────────────────────────────────────
function DocItem({ label, status, onPress }) {
  const colors = {
    pending:  { bg: Colors.warning + '15', border: Colors.warning, icon: 'time-outline',        iconColor: Colors.warning  },
    uploaded: { bg: Colors.success + '15', border: Colors.success, icon: 'checkmark-circle',    iconColor: Colors.success  },
    none:     { bg: Colors.surface,        border: Colors.border,  icon: 'cloud-upload-outline', iconColor: Colors.textSecondary },
  };
  const s = colors[status] || colors.none;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.docItem, { backgroundColor: s.bg, borderColor: s.border }]}
    >
      <Ionicons name={s.icon} size={22} color={s.iconColor} />
      <Text style={[styles.docLabel, status === 'uploaded' && { color: Colors.success }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
}

// ── Step indicator ───────────────────────────────────────────
function StepBar({ current }) {
  return (
    <View style={styles.stepBar}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i < current  && styles.stepDone,
            i === current && styles.stepActive,
          ]}
        />
      ))}
    </View>
  );
}

// ── Labelled Input ──────────────────────────────────────────
function LabeledInput({ label, value, onChangeText, placeholder, keyboardType = 'default', autoCapitalize = 'sentences', maxLength }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSecondary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
      />
    </View>
  );
}

// ── Option Picker ──────────────────────────────────────────
function OptionPicker({ label, options, value, onSelect }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            onPress={() => onSelect(opt)}
            style={[styles.optionChip, value === opt && styles.optionChipActive]}
          >
            <Text style={[styles.optionChipText, value === opt && styles.optionChipTextActive]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
export default function RiderOnboardingScreen({ navigation }) {
  const { user, setSession } = useAuthStore();

  const [step,        setStep]        = useState(0);
  const [submitting,  setSubmitting]  = useState(false);

  // Step 1 — Personal
  const [fullName,  setFullName]  = useState(user?.full_name || '');
  const [dob,       setDob]       = useState('');
  const [gender,    setGender]    = useState('');

  // Step 2 — Vehicle
  const [vehicleType,   setVehicleType]   = useState('');
  const [vehicleRegNo,  setVehicleRegNo]  = useState('');
  const [vehicleModel,  setVehicleModel]  = useState('');

  // Step 3 — Documents
  const [docs, setDocs] = useState({
    aadhaar_front:    null,
    aadhaar_back:     null,
    pan_card:         null,
    driving_license:  null,
    vehicle_rc:       null,
    vehicle_insurance:null,
  });
  const DOC_LABELS = {
    aadhaar_front:    'Aadhaar Front',
    aadhaar_back:     'Aadhaar Back',
    pan_card:         'PAN Card',
    driving_license:  'Driving License',
    vehicle_rc:       'Vehicle RC',
    vehicle_insurance:'Vehicle Insurance',
  };

  // Step 4 — Bank
  const [accountNo,   setAccountNo]   = useState('');
  const [ifscCode,    setIfscCode]    = useState('');
  const [holderName,  setHolderName]  = useState(user?.full_name || '');
  const [bankName,    setBankName]    = useState('');
  const [ifscLoading, setIfscLoading] = useState(false);

  // ── Document picker ─────────────────────────────────────────
  const handleDocPick = useCallback(async (docKey) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Please allow access to your photo library to upload documents.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality:    0.7,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      setDocs(prev => ({ ...prev, [docKey]: result.assets[0] }));
    }
  }, []);

  // ── IFSC lookup ─────────────────────────────────────────────
  const handleIfscLookup = useCallback(async () => {
    if (ifscCode.length !== 11) return;
    setIfscLoading(true);
    try {
      const res = await fetch(`https://ifsc.razorpay.com/${ifscCode.toUpperCase()}`);
      if (res.ok) {
        const data = await res.json();
        setBankName(`${data.BANK} — ${data.BRANCH}`);
      }
    } catch {
      setBankName('');
    } finally {
      setIfscLoading(false);
    }
  }, [ifscCode]);

  // ── Validation per step ─────────────────────────────────────
  const stepValid = () => {
    if (step === 0) return fullName.trim().length >= 2 && dob.length >= 6 && gender;
    if (step === 1) return vehicleType && vehicleRegNo.trim().length >= 5 && vehicleModel.trim();
    if (step === 2) return Object.values(docs).every(d => d !== null);
    if (step === 3) return accountNo.length >= 9 && ifscCode.length === 11 && holderName.trim();
    return true;
  };

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Upload documents to storage via pre-signed URLs
      const docUrls = {};
      for (const [key, asset] of Object.entries(docs)) {
        if (!asset) continue;
        try {
          // Get pre-signed URL
          const urlRes = await client.post('/rider/kyc/upload-url', {
            doc_type:     key,
            content_type: 'image/jpeg',
          });
          const { upload_url, public_url } = urlRes.data;
          // Upload
          const imgData = await fetch(asset.uri);
          const blob    = await imgData.blob();
          await fetch(upload_url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
          docUrls[key] = public_url;
        } catch {
          docUrls[key] = asset.uri; // fallback — backend will handle
        }
      }

      // Submit full onboarding payload
      await client.post('/rider/onboarding/submit', {
        personal: { full_name: fullName, dob, gender },
        vehicle:  { type: vehicleType, registration_number: vehicleRegNo.toUpperCase(), model: vehicleModel },
        documents: docUrls,
        bank: {
          account_number:      accountNo,
          ifsc_code:           ifscCode.toUpperCase(),
          account_holder_name: holderName,
          bank_name:           bankName,
        },
      });

      Alert.alert(
        '✅ Submitted!',
        'Your KYC documents have been submitted. We will review them within 24-48 hours and notify you.',
        [{
          text: 'Continue',
          onPress: () => {
            // Update user in store to reflect kyc submitted
            if (setSession && user) {
              setSession({ token: null, user: { ...user, kyc_submitted: true } });
            }
            navigation?.goBack();
          },
        }]
      );
    } catch (err) {
      Alert.alert('Submission Failed', err.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step Content ────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 0: return (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Personal Information</Text>
          <Text style={styles.stepSubtitle}>Please enter your details exactly as on your Aadhaar card.</Text>
          <LabeledInput label="Full Name" value={fullName} onChangeText={setFullName} placeholder="As on Aadhaar" />
          <LabeledInput label="Date of Birth (DD/MM/YYYY)" value={dob} onChangeText={setDob} placeholder="e.g. 15/04/1998" keyboardType="numeric" maxLength={10} />
          <OptionPicker label="Gender" options={GENDER_OPTIONS} value={gender} onSelect={setGender} />
        </View>
      );
      case 1: return (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Vehicle Information</Text>
          <Text style={styles.stepSubtitle}>Enter details of the vehicle you'll use for deliveries.</Text>
          <OptionPicker label="Vehicle Type" options={VEHICLE_TYPES} value={vehicleType} onSelect={setVehicleType} />
          <LabeledInput label="Registration Number" value={vehicleRegNo} onChangeText={setVehicleRegNo} placeholder="e.g. MH01AB1234" autoCapitalize="characters" maxLength={12} />
          <LabeledInput label="Vehicle Make & Model" value={vehicleModel} onChangeText={setVehicleModel} placeholder="e.g. Hero Splendor Plus" />
        </View>
      );
      case 2: return (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Upload Documents</Text>
          <Text style={styles.stepSubtitle}>Upload clear photos of all required documents. Accepted: JPG, PNG.</Text>
          {Object.entries(DOC_LABELS).map(([key, label]) => (
            <DocItem
              key={key}
              label={label}
              status={docs[key] ? 'uploaded' : 'none'}
              onPress={() => handleDocPick(key)}
            />
          ))}
        </View>
      );
      case 3: return (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Bank Account</Text>
          <Text style={styles.stepSubtitle}>Earnings will be deposited to this account. Must be in your own name.</Text>
          <LabeledInput label="Account Holder Name" value={holderName} onChangeText={setHolderName} placeholder="As on bank records" />
          <LabeledInput label="Account Number" value={accountNo} onChangeText={setAccountNo} placeholder="Enter account number" keyboardType="numeric" maxLength={18} />
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>IFSC Code</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, fontFamily: Typography.fontFamily.mono || 'monospace' }]}
                value={ifscCode}
                onChangeText={v => { setIfscCode(v.toUpperCase()); setBankName(''); }}
                placeholder="e.g. SBIN0001234"
                placeholderTextColor={Colors.textSecondary}
                autoCapitalize="characters"
                maxLength={11}
                onEndEditing={handleIfscLookup}
              />
              {ifscLoading && <ActivityIndicator color={Colors.primary} style={{ marginLeft: 8 }} />}
            </View>
            {bankName ? (
              <Text style={{ fontSize: 12, color: Colors.success, marginTop: 4, fontWeight: '600' }}>✓ {bankName}</Text>
            ) : null}
          </View>
        </View>
      );
      case 4: return (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Review & Submit</Text>
          <Text style={styles.stepSubtitle}>Please review your information before submitting.</Text>
          {[
            { section: 'Personal',  data: { Name: fullName, DOB: dob, Gender: gender } },
            { section: 'Vehicle',   data: { Type: vehicleType, 'Reg No': vehicleRegNo, Model: vehicleModel } },
            { section: 'Documents', data: Object.fromEntries(Object.entries(DOC_LABELS).map(([k, v]) => [v, docs[k] ? '✅ Uploaded' : '❌ Missing'])) },
            { section: 'Bank',      data: { Holder: holderName, 'Account No': accountNo ? `••••${accountNo.slice(-4)}` : '', IFSC: ifscCode } },
          ].map(({ section, data }) => (
            <View key={section} style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>{section}</Text>
              {Object.entries(data).map(([k, v]) => (
                <View key={k} style={styles.reviewRow}>
                  <Text style={styles.reviewKey}>{k}</Text>
                  <Text style={styles.reviewVal}>{v || '—'}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={{ backgroundColor: '#fffbeb', borderRadius: BorderRadius.md, padding: 12, marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: '#92400e', fontFamily: Typography.fontFamily.regular }}>
              ⚠️ By submitting, you confirm that all provided information is accurate and the documents are genuine. False information may result in permanent account suspension.
            </Text>
          </View>
        </View>
      );
      default: return null;
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        {step > 0 ? (
          <TouchableOpacity onPress={() => setStep(s => s - 1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
        ) : <View style={{ width: 24 }} />}
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Rider Verification</Text>
          <Text style={styles.headerSub}>Step {step + 1} of {TOTAL_STEPS}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress */}
      <StepBar current={step} />

      {/* Scrollable content */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {renderStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          onPress={step < TOTAL_STEPS - 1 ? () => setStep(s => s + 1) : handleSubmit}
          disabled={!stepValid() || submitting}
          activeOpacity={0.8}
          style={[styles.cta, (!stepValid() || submitting) && styles.ctaDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>
              {step < TOTAL_STEPS - 1 ? 'Continue →' : '✅ Submit KYC'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:               { flex: 1, backgroundColor: Colors.background },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 12 },
  headerTitle:        { fontFamily: Typography.fontFamily.bold, fontSize: 16, color: Colors.text },
  headerSub:          { fontFamily: Typography.fontFamily.regular, fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  stepBar:            { flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.md, marginBottom: 8 },
  stepDot:            { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  stepActive:         { backgroundColor: Colors.primary },
  stepDone:           { backgroundColor: Colors.primary + '60' },

  scroll:             { flex: 1 },
  stepContent:        { padding: Spacing.md, gap: 4 },
  stepTitle:          { fontFamily: Typography.fontFamily.bold, fontSize: 20, color: Colors.text, marginBottom: 4 },
  stepSubtitle:       { fontFamily: Typography.fontFamily.regular, fontSize: 13, color: Colors.textSecondary, marginBottom: 16, lineHeight: 20 },

  fieldWrap:          { marginBottom: 16 },
  fieldLabel:         { fontFamily: Typography.fontFamily.semibold, fontSize: 13, color: Colors.text, marginBottom: 6 },
  input: {
    backgroundColor:  Colors.surface,
    borderWidth:      1.5,
    borderColor:      Colors.border,
    borderRadius:     BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical:  10,
    fontSize:         14,
    fontFamily:       Typography.fontFamily.regular,
    color:            Colors.text,
  },

  optionChip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  optionChipActive:   { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  optionChipText:     { fontFamily: Typography.fontFamily.semibold, fontSize: 13, color: Colors.textSecondary },
  optionChipTextActive:{ color: Colors.primary },

  docItem: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              12,
    padding:          14,
    borderRadius:     BorderRadius.md,
    borderWidth:      1.5,
    marginBottom:     10,
  },
  docLabel:           { flex: 1, fontFamily: Typography.fontFamily.semibold, fontSize: 13, color: Colors.text },

  reviewSection:      { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: 14, marginBottom: 12 },
  reviewSectionTitle: { fontFamily: Typography.fontFamily.bold, fontSize: 13, color: Colors.text, marginBottom: 10 },
  reviewRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.background },
  reviewKey:          { fontFamily: Typography.fontFamily.regular, fontSize: 12, color: Colors.textSecondary },
  reviewVal:          { fontFamily: Typography.fontFamily.semibold, fontSize: 12, color: Colors.text, maxWidth: '55%', textAlign: 'right' },

  footer:             { padding: Spacing.md, paddingBottom: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background },
  cta: {
    backgroundColor: Colors.primary,
    borderRadius:    BorderRadius.lg,
    paddingVertical: 16,
    alignItems:      'center',
  },
  ctaDisabled:        { backgroundColor: Colors.border },
  ctaText:            { fontFamily: Typography.fontFamily.bold, fontSize: 16, color: '#fff' },
});
