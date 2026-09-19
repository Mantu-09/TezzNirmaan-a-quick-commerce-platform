// ────────────────────────────────────────────────────────────
// RequestReturnScreen.jsx — P6-3
//
// Allows customers to file a return for a delivered sub-order.
// Flow:
//   1. Choose return reason (radio list)
//   2. Add up to 5 photos via camera or gallery (Supabase Storage)
//   3. Optional description text
//   4. Submit → POST /orders/sub/:subOrderId/return
//
// Navigation: navigated to from OrderTrackingScreen with params:
//   { subOrderId, orderNumber, shopName }
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView }  from 'react-native-safe-area-context';
import { Ionicons }      from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMutation }   from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { supabase }      from '../../utils/supabase';
import { requestReturn } from '../../api/returns';
import Button            from '../../components/common/Button';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useAuthStore      from '../../store/authStore';

// ── Constants ────────────────────────────────────────────────

const REASONS = [
  { value: 'wrong_item_delivered',      label: 'Wrong item delivered' },
  { value: 'damaged_item',              label: 'Damaged item' },
  { value: 'quality_not_as_described',  label: 'Quality not as described' },
  { value: 'quantity_short',            label: 'Quantity short' },
  { value: 'item_missing',              label: 'Item missing' },
  { value: 'other',                     label: 'Other' },
];

// Supabase Storage bucket for return photos (must be created in dashboard)
const BUCKET = 'return-photos';

// ── Photo upload helper ───────────────────────────────────────

async function uploadPhoto(uri, userId) {
  // Convert URI to Blob
  const response = await fetch(uri);
  const blob     = await response.blob();
  const ext      = uri.split('.').pop() || 'jpg';
  const path     = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: `image/${ext}`, upsert: false });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

// ── Main Screen ───────────────────────────────────────────────

export default function RequestReturnScreen({ route }) {
  const { subOrderId, orderNumber, shopName } = route.params;
  const navigation = useNavigation();
  const userId     = useAuthStore(s => s.user?.id);

  const [selectedReason, setSelectedReason] = useState(null);
  const [description,    setDescription]    = useState('');
  const [photos,         setPhotos]         = useState([]); // [{ uri, uploading, url, error }]

  // ── Photo picking ──────────────────────────────────────────
  const pickPhoto = useCallback(async (source) => {
    if (photos.length >= 5) {
      Alert.alert('Max photos', 'You can attach up to 5 photos.');
      return;
    }

    const permResult = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permResult.granted) {
      Alert.alert('Permission needed', `Please allow ${source} access in Settings.`);
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: false });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const photoId = Date.now().toString();

    // Add placeholder while uploading
    setPhotos(prev => [...prev, { id: photoId, uri: asset.uri, uploading: true, url: null, error: null }]);

    try {
      const publicUrl = await uploadPhoto(asset.uri, userId);
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? { ...p, uploading: false, url: publicUrl } : p
      ));
    } catch (err) {
      setPhotos(prev => prev.map(p =>
        p.id === photoId ? { ...p, uploading: false, error: err.message } : p
      ));
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
    }
  }, [photos.length, userId]);

  const removePhoto = useCallback((id) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }, []);

  // ── Submit ─────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReason) throw new Error('Please select a reason for the return.');
      if (photos.some(p => p.uploading)) throw new Error('Please wait for photos to finish uploading.');
      if (photos.some(p => p.error)) throw new Error('Some photos failed to upload. Please remove them and try again.');

      const photoUrls = photos.filter(p => p.url).map(p => p.url);
      return requestReturn(subOrderId, { reason: selectedReason, description: description.trim() || undefined, photoUrls });
    },
    onSuccess: (data) => {
      navigation.replace('ReturnStatus', {
        returnId: data?.return?.id,
        orderNumber,
      });
    },
    onError: (err) => {
      Alert.alert('Could not submit return', err.message || 'Please try again.');
    },
  });

  const canSubmit = !!selectedReason && !photos.some(p => p.uploading) && !submitMutation.isPending;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ─────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Request a Return</Text>
          <Text style={styles.headerSub}>
            Order <Text style={styles.orderNum}>#{orderNumber}</Text>
            {shopName ? `  ·  ${shopName}` : ''}
          </Text>
        </View>

        {/* ── Reason picker ──────────────────────────────── */}
        <Text style={styles.sectionLabel}>What went wrong?</Text>
        <View style={styles.reasonCard}>
          {REASONS.map((r, i) => (
            <TouchableOpacity
              key={r.value}
              style={[
                styles.reasonRow,
                i < REASONS.length - 1 && styles.reasonRowBorder,
                selectedReason === r.value && styles.reasonRowSelected,
              ]}
              onPress={() => setSelectedReason(r.value)}
              activeOpacity={0.7}
            >
              <View style={[styles.radio, selectedReason === r.value && styles.radioSelected]}>
                {selectedReason === r.value && <View style={styles.radioInner} />}
              </View>
              <Text style={[styles.reasonLabel, selectedReason === r.value && styles.reasonLabelSelected]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Photo upload ────────────────────────────────── */}
        <Text style={styles.sectionLabel}>
          Add photos{' '}
          <Text style={styles.sectionLabelNote}>(required for damaged items)</Text>
        </Text>
        <View style={styles.photoRow}>
          {photos.map(photo => (
            <View key={photo.id} style={styles.photoThumbWrap}>
              <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
              {photo.uploading && (
                <View style={styles.photoOverlay}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              )}
              {photo.error && (
                <View style={[styles.photoOverlay, { backgroundColor: 'rgba(239,68,68,0.7)' }]}>
                  <Ionicons name="warning" size={16} color="#fff" />
                </View>
              )}
              <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(photo.id)}>
                <Ionicons name="close-circle" size={20} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {photos.length < 5 && (
            <>
              <TouchableOpacity style={styles.photoAdd} onPress={() => pickPhoto('camera')}>
                <Ionicons name="camera-outline" size={22} color={Colors.primary} />
                <Text style={styles.photoAddText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoAdd} onPress={() => pickPhoto('gallery')}>
                <Ionicons name="image-outline" size={22} color={Colors.primary} />
                <Text style={styles.photoAddText}>Gallery</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <Text style={styles.photoHint}>Up to 5 photos · Clear, well-lit photos speed up review</Text>

        {/* ── Description ─────────────────────────────────── */}
        <Text style={styles.sectionLabel}>
          Additional details{' '}
          <Text style={styles.sectionLabelNote}>(optional)</Text>
        </Text>
        <TextInput
          style={styles.descInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the issue in more detail…"
          placeholderTextColor={Colors.textTertiary}
          multiline
          numberOfLines={4}
          maxLength={1000}
          textAlignVertical="top"
        />

        {/* ── Window notice ────────────────────────────────── */}
        <View style={styles.windowNotice}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
          <Text style={styles.windowNoticeText}>
            Returns accepted within 24 hours of delivery only
          </Text>
        </View>

        {/* ── Submit ──────────────────────────────────────── */}
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => submitMutation.mutate()}
          loading={submitMutation.isPending}
          disabled={!canSubmit}
          style={styles.submitBtn}
          testID="submit-return-btn"
        >
          Submit Return Request
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[4], paddingBottom: Spacing[10] },

  header:      { marginBottom: Spacing[5] },
  headerTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.text },
  headerSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: Spacing[1] },
  orderNum:    { fontFamily: Typography.fontFamily.semiBold, color: Colors.primary },

  sectionLabel: {
    fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base,
    color: Colors.text, marginBottom: Spacing[2], marginTop: Spacing[4],
  },
  sectionLabelNote: {
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary,
  },

  // Reason picker
  reasonCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    ...Shadow.sm, overflow: 'hidden',
  },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4], gap: Spacing[3],
  },
  reasonRowBorder:   { borderBottomWidth: 1, borderBottomColor: Colors.border },
  reasonRowSelected: { backgroundColor: Colors.primary + '08' },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.primary },
  radioInner:    { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  reasonLabel:         { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.text, flex: 1 },
  reasonLabelSelected: { fontFamily: Typography.fontFamily.semiBold, color: Colors.primary },

  // Photos
  photoRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginBottom: Spacing[2] },
  photoThumbWrap: { width: 72, height: 72, position: 'relative' },
  photoThumb:    { width: 72, height: 72, borderRadius: BorderRadius.lg, backgroundColor: Colors.border },
  photoOverlay:  {
    ...StyleSheet.absoluteFillObject, borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  photoRemove:   { position: 'absolute', top: -6, right: -6 },
  photoAdd: {
    width: 72, height: 72, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.primary + '80',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: Colors.primary + '08',
  },
  photoAddText:  { fontFamily: Typography.fontFamily.regular, fontSize: 10, color: Colors.primary },
  photoHint:     { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: Spacing[2] },

  // Description
  descInput: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing[4], minHeight: 100,
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.text,
    ...Shadow.sm,
  },

  // Window notice
  windowNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2],
    backgroundColor: Colors.warning + '14', borderRadius: BorderRadius.lg,
    padding: Spacing[3], marginTop: Spacing[4],
    borderWidth: 1, borderColor: Colors.warning + '30',
  },
  windowNoticeText: {
    flex: 1, fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm, color: Colors.warning, lineHeight: 18,
  },

  submitBtn: { marginTop: Spacing[6] },
});
