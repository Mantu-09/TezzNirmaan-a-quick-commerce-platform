// ────────────────────────────────────────────────────────────
// RiderIssueScreen.jsx — P9-4
//
// Rider issue reporting screen — navigated to from
// RiderActiveDeliveryScreen via "Report Issue" button.
//
// UX:
//   • Radio-button style option list
//   • Optional photo attachment
//   • Optional free-text description
//   • Submit → POST /rider/deliveries/:assignmentId/issue
//   • On success: brief confirmation, then go back
// ────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons }     from '@expo/vector-icons';
import * as Haptics     from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme';
import { client } from '../../api/client';

// ── Issue options ─────────────────────────────────────────────
const ISSUE_TYPES = [
  {
    key:   'customer_not_home',
    label: 'Customer not home',
    sub:   'Cannot complete delivery — no one at the address',
    icon:  'home-outline',
  },
  {
    key:   'wrong_address',
    label: 'Wrong address',
    sub:   'GPS / map does not match the delivery location',
    icon:  'location-outline',
  },
  {
    key:   'item_damaged',
    label: 'Item damaged in transit',
    sub:   'Product was damaged before or during delivery',
    icon:  'alert-circle-outline',
  },
  {
    key:   'vehicle_breakdown',
    label: 'Vehicle breakdown',
    sub:   'Cannot continue delivery due to vehicle issue',
    icon:  'bicycle-outline',
  },
  {
    key:   'other',
    label: 'Other',
    sub:   'Describe the issue in the notes below',
    icon:  'ellipsis-horizontal-circle-outline',
  },
];

// ── Option Row ────────────────────────────────────────────────
function OptionRow({ option, selected, onSelect }) {
  return (
    <TouchableOpacity
      style={[styles.optionRow, selected && styles.optionRowSelected]}
      onPress={() => { onSelect(option.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      activeOpacity={0.7}
    >
      <View style={[styles.optionIconWrap, selected && styles.optionIconWrapSelected]}>
        <Ionicons name={option.icon} size={18} color={selected ? Colors.primary : Colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
        <Text style={styles.optionSub}>{option.sub}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected && <View style={styles.radioDot} />}
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────
export default function RiderIssueScreen() {
  const route      = useRoute();
  const navigation = useNavigation();
  const { assignmentId } = route.params || {};

  const [selectedType, setSelectedType] = useState(null);
  const [description,  setDescription]  = useState('');
  const [photoUri,     setPhotoUri]      = useState(null);
  const [submitting,   setSubmitting]    = useState(false);
  const [submitted,    setSubmitted]     = useState(false);

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access required to attach a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.6, aspect: [4, 3] });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleSubmit = async () => {
    if (!selectedType) {
      Alert.alert('Select an issue', 'Please select the type of issue before submitting.');
      return;
    }
    if (selectedType === 'other' && !description.trim()) {
      Alert.alert('Add a description', 'Please describe the issue for "Other" category.');
      return;
    }

    setSubmitting(true);
    try {
      await client.post(`/rider/deliveries/${assignmentId}/issue`, {
        issue_type:  selectedType,
        description: description.trim() || undefined,
        // photo_uri: photoUri — backend can store in metadata if needed
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
      setTimeout(() => navigation.goBack(), 2200);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Failed to report', err?.response?.data?.message || err.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success state ─────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={56} color="#16a34a" />
          </View>
          <Text style={styles.successTitle}>Issue Reported</Text>
          <Text style={styles.successSub}>
            The shop has been notified. Someone will follow up with the customer.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header ──────────────────────────────────────── */}
          <View style={styles.pageHeader}>
            <Ionicons name="warning" size={22} color="#f59e0b" />
            <Text style={styles.pageTitle}>What's the issue?</Text>
          </View>
          <Text style={styles.pageHint}>Select the issue type. The shop owner will be notified immediately.</Text>

          {/* ── Issue options ────────────────────────────────── */}
          <View style={styles.optionList}>
            {ISSUE_TYPES.map(opt => (
              <OptionRow
                key={opt.key}
                option={opt}
                selected={selectedType === opt.key}
                onSelect={setSelectedType}
              />
            ))}
          </View>

          {/* ── Optional description ─────────────────────────── */}
          <View style={styles.descSection}>
            <Text style={styles.descLabel}>
              Additional details{selectedType === 'other' ? <Text style={{ color: '#dc2626' }}> *</Text> : <Text style={{ color: Colors.textTertiary }}> (optional)</Text>}
            </Text>
            <TextInput
              style={styles.descInput}
              placeholder="Describe the issue in more detail…"
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              maxLength={500}
            />
            <Text style={styles.charCount}>{description.length}/500</Text>
          </View>

          {/* ── Photo attachment ─────────────────────────────── */}
          <View style={styles.photoSection}>
            <Text style={styles.descLabel}>Photo <Text style={{ color: Colors.textTertiary }}>(optional)</Text></Text>
            {photoUri
              ? (
                <View style={styles.photoTakenRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                  <Text style={styles.photoTakenText}>Photo attached</Text>
                  <TouchableOpacity onPress={() => setPhotoUri(null)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )
              : (
                <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto}>
                  <Ionicons name="camera-outline" size={16} color={Colors.primary} />
                  <Text style={styles.photoBtnText}>Take Photo</Text>
                </TouchableOpacity>
              )
            }
          </View>

          {/* ── Submit ─────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.submitBtn, (!selectedType || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!selectedType || submitting}
            activeOpacity={0.8}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>Submit Report</Text>
                </>
            }
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  scroll:   { flex: 1 },
  content:  { padding: Spacing.md },

  // Page header
  pageHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  pageTitle:  { fontSize: 20, fontWeight: '800', color: Colors.text, fontFamily: Typography.fontFamily?.bold },
  pageHint:   { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 18 },

  // Option list
  optionList:    { gap: 8, marginBottom: Spacing.md },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  optionRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}08`,
  },
  optionIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.surface2 || '#1e2235',
    alignItems: 'center', justifyContent: 'center',
  },
  optionIconWrapSelected: { backgroundColor: `${Colors.primary}18` },
  optionLabel:   { fontSize: 14, fontWeight: '700', color: Colors.text },
  optionLabelSelected: { color: Colors.primary },
  optionSub:     { fontSize: 11, color: Colors.textSecondary, marginTop: 2, lineHeight: 15 },

  // Radio button
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  radioSelected: { borderColor: Colors.primary },
  radioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.primary,
  },

  // Description
  descSection: { marginBottom: Spacing.md },
  descLabel:   { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  descInput: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
    fontSize: 14, color: Colors.text,
    textAlignVertical: 'top', minHeight: 90,
    fontFamily: Typography.fontFamily?.regular,
  },
  charCount: { fontSize: 10, color: Colors.textTertiary, marginTop: 4, textAlign: 'right' },

  // Photo
  photoSection: { marginBottom: Spacing.md },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: `${Colors.primary}12`,
    borderRadius: BorderRadius.md,
    paddingVertical: 10, paddingHorizontal: 16,
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: `${Colors.primary}30`,
  },
  photoBtnText:   { fontSize: 13, fontWeight: '700', color: Colors.primary },
  photoTakenRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoTakenText: { fontSize: 13, color: '#16a34a', fontWeight: '600' },
  removeText:     { fontSize: 12, color: '#dc2626', textDecorationLine: 'underline', marginLeft: 4 },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 15,
  },
  submitBtnDisabled: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  // Success
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  successIcon: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#16a34a18',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 10 },
  successSub:   { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
