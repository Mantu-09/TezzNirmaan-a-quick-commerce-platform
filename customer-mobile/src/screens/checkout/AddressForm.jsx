// ────────────────────────────────────────────────────────────
// AddressForm — Full address form with GPS location capture
//
// Features:
//   • Full field validation (full_name, phone, address_line1, city, pincode)
//   • GPS location capture via expo-location → stores lat, lng
//   • Map pin preview with react-native-maps (optional render)
//   • POST to /customer/addresses on submit
//   • Inline field-level error messages
//   • Accessible label + error pairs
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ordersApi from '../../api/orders';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';

// ── Address type labels ───────────────────────────────────────
const ADDRESS_LABELS = [
  { key: 'home',  icon: 'home-outline',    label: 'Home'   },
  { key: 'work',  icon: 'briefcase-outline', label: 'Work'  },
  { key: 'other', icon: 'location-outline', label: 'Other'  },
];

// ── Validation ────────────────────────────────────────────────
function validate(form) {
  const errors = {};
  if (!form.full_name.trim())
    errors.full_name = 'Full name is required';
  if (!/^\d{10}$/.test(form.phone.trim()))
    errors.phone = 'Enter a valid 10-digit mobile number';
  if (!form.address_line1.trim())
    errors.address_line1 = 'Address line 1 is required';
  if (!form.city.trim())
    errors.city = 'City is required';
  if (!/^\d{6}$/.test(form.pincode.trim()))
    errors.pincode = 'Enter a valid 6-digit PIN code';
  return errors;
}

// ── Map Pin Preview — renders only if lat/lng are set ─────────
function MapPinPreview({ lat, lng, onRetry, loading }) {
  if (!lat || !lng) return null;

  // react-native-maps is an optional peer dep. Wrap in try/require so the
  // form still works on Expo Go without it.
  let MapView, Marker;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker  = maps.Marker;
  } catch {
    // Maps not available — show a text fallback instead
    return (
      <View style={styles.mapFallback}>
        <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
        <Text style={styles.mapFallbackText}>
          Location captured: {lat.toFixed(5)}, {lng.toFixed(5)}
        </Text>
        <TouchableOpacity onPress={onRetry} disabled={loading}>
          <Ionicons name="refresh-outline" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.mapContainer}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude:        lat,
          longitude:       lng,
          latitudeDelta:   0.005,
          longitudeDelta:  0.005,
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }} pinColor={Colors.primary} />
      </MapView>
      <TouchableOpacity style={styles.mapRetry} onPress={onRetry} disabled={loading}>
        <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
        <Text style={styles.mapRetryText}>Re-detect location</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function AddressForm({ navigation }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    full_name:     '',
    phone:         '',
    address_line1: '',
    address_line2: '',
    landmark:      '',
    city:          'Patna',
    state:         'Bihar',
    pincode:       '',
    label:         'home',
    is_default:    false,
    lat:           null,
    lng:           null,
  });
  const [errors,      setErrors]      = useState({});
  const [gpsLoading,  setGpsLoading]  = useState(false);

  const set = useCallback((key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }, []);

  // ── GPS capture ─────────────────────────────────────────────
  const captureLocation = useCallback(async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Location access was denied. You can still save your address without GPS, ' +
          'but delivery eligibility checks won\'t work until you re-add the address with location.',
          [{ text: 'OK' }]
        );
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setForm(f => ({
        ...f,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }));
    } catch (err) {
      Alert.alert('Location Error', `Could not get your location: ${err.message}`);
    } finally {
      setGpsLoading(false);
    }
  }, []);

  // ── Submit ──────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => ordersApi.createAddress({
      full_name:     form.full_name.trim(),
      phone:         `+91${form.phone.trim()}`,
      address_line1: form.address_line1.trim(),
      address_line2: form.address_line2.trim() || null,
      landmark:      form.landmark.trim()      || null,
      city:          form.city.trim(),
      state:         form.state.trim(),
      pincode:       form.pincode.trim(),
      label:         form.label,
      is_default:    form.is_default,
      lat:           form.lat   || null,
      lng:           form.lng   || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      navigation.goBack();
    },
    onError: (e) => Alert.alert('Save Failed', e.message || 'Could not save address. Please try again.'),
  });

  const handleSave = useCallback(() => {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length === 0) mutation.mutate();
  }, [form, mutation]);

  // ── Render ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Address type selector ─────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Address Type</Text>
            <View style={styles.labelRow}>
              {ADDRESS_LABELS.map(({ key, icon, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.labelChip, form.label === key && styles.labelChipActive]}
                  onPress={() => set('label', key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: form.label === key }}
                >
                  <Ionicons
                    name={icon}
                    size={16}
                    color={form.label === key ? Colors.primary : Colors.textSecondary}
                  />
                  <Text style={[styles.labelChipText, form.label === key && styles.labelChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Contact details ───────────────────────────── */}
          <Text style={styles.groupHeading}>Contact</Text>

          <Input
            label="Full Name *"
            value={form.full_name}
            onChangeText={v => set('full_name', v)}
            error={errors.full_name}
            placeholder="Ramesh Kumar"
            autoCapitalize="words"
            returnKeyType="next"
            accessibilityLabel="Full name"
          />
          <Input
            label="Mobile Number *"
            value={form.phone}
            onChangeText={v => set('phone', v.replace(/\D/g, ''))}
            keyboardType="phone-pad"
            maxLength={10}
            prefix="+91"
            error={errors.phone}
            placeholder="XXXXXXXXXX"
            returnKeyType="next"
            accessibilityLabel="Mobile number"
          />

          {/* ── Address fields ────────────────────────────── */}
          <Text style={styles.groupHeading}>Address</Text>

          <Input
            label="Address Line 1 *"
            value={form.address_line1}
            onChangeText={v => set('address_line1', v)}
            error={errors.address_line1}
            placeholder="House / Flat no., Street name"
            returnKeyType="next"
            accessibilityLabel="Address line 1"
          />
          <Input
            label="Address Line 2"
            value={form.address_line2}
            onChangeText={v => set('address_line2', v)}
            placeholder="Colony / Locality (optional)"
            returnKeyType="next"
            accessibilityLabel="Address line 2"
          />
          <Input
            label="Landmark"
            value={form.landmark}
            onChangeText={v => set('landmark', v)}
            placeholder="Near school, hospital etc."
            returnKeyType="next"
            accessibilityLabel="Landmark"
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: Spacing[3] }}>
              <Input
                label="City"
                value={form.city}
                onChangeText={v => set('city', v)}
                error={errors.city}
                returnKeyType="next"
                accessibilityLabel="City"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="State"
                value={form.state}
                onChangeText={v => set('state', v)}
                returnKeyType="next"
                accessibilityLabel="State"
              />
            </View>
          </View>

          <Input
            label="PIN Code *"
            value={form.pincode}
            onChangeText={v => set('pincode', v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={6}
            error={errors.pincode}
            placeholder="800001"
            returnKeyType="done"
            accessibilityLabel="PIN code"
          />

          {/* ── GPS Location ──────────────────────────────── */}
          <Text style={styles.groupHeading}>Location Pin</Text>
          <Text style={styles.gpsSubtitle}>
            Tap to auto-detect your location. This helps us verify delivery eligibility
            and show your address on a map.
          </Text>

          <TouchableOpacity
            style={[styles.gpsBtn, gpsLoading && styles.gpsBtnLoading]}
            onPress={captureLocation}
            disabled={gpsLoading}
            accessibilityRole="button"
            accessibilityLabel="Detect my location"
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons
                name={form.lat ? 'checkmark-circle-outline' : 'navigate-outline'}
                size={20}
                color={form.lat ? Colors.success : Colors.primary}
              />
            )}
            <Text style={[styles.gpsBtnText, form.lat && styles.gpsBtnTextSuccess]}>
              {gpsLoading
                ? 'Detecting location…'
                : form.lat
                ? 'Location captured ✓'
                : 'Detect my location'}
            </Text>
          </TouchableOpacity>

          {/* Map pin preview — only renders when GPS coords are set */}
          <MapPinPreview
            lat={form.lat}
            lng={form.lng}
            onRetry={captureLocation}
            loading={gpsLoading}
          />

          {/* ── Default address toggle ────────────────────── */}
          <View style={styles.defaultRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.defaultTitle}>Set as default address</Text>
              <Text style={styles.defaultSub}>Used automatically at checkout</Text>
            </View>
            <Switch
              value={form.is_default}
              onValueChange={v => set('is_default', v)}
              trackColor={{ true: Colors.primary, false: Colors.border }}
              thumbColor="#fff"
              accessibilityLabel="Set as default address"
            />
          </View>

          {/* ── Submit ────────────────────────────────────── */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={mutation.isPending}
            onPress={handleSave}
            style={{ marginTop: Spacing[4] }}
          >
            Save Address
          </Button>

          {!form.lat && (
            <Text style={styles.noGpsNote}>
              ⚠ Without a location pin, delivery eligibility check will be skipped.
            </Text>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[4], paddingBottom: Spacing[12] },

  // ── Section headings
  section:      { marginBottom: Spacing[4] },
  sectionLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.text,
    marginBottom: Spacing[2],
  },
  groupHeading: {
    fontFamily:   Typography.fontFamily.semiBold,
    fontSize:     Typography.size.sm,
    color:        Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom:  Spacing[2],
    marginTop:     Spacing[4],
  },

  // ── Address type chips
  labelRow:      { flexDirection: 'row', gap: Spacing[3] },
  labelChip:     {
    flex: 1,
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent: 'center',
    gap:            Spacing[1],
    paddingVertical: Spacing[2],
    borderRadius:   BorderRadius.lg,
    borderWidth:    1.5,
    borderColor:    Colors.border,
    backgroundColor: Colors.surface,
  },
  labelChipActive:       { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  labelChipText:         { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  labelChipTextActive:   { color: Colors.primary },

  // ── Row layout
  row: { flexDirection: 'row' },

  // ── GPS
  gpsSubtitle: {
    fontFamily:   Typography.fontFamily.regular,
    fontSize:     Typography.size.xs,
    color:        Colors.textSecondary,
    lineHeight:   18,
    marginBottom: Spacing[3],
  },
  gpsBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing[2],
    backgroundColor: Colors.primaryLight,
    borderRadius:   BorderRadius.xl,
    borderWidth:    1.5,
    borderColor:    Colors.primary,
    paddingVertical: Spacing[3],
    marginBottom:   Spacing[4],
  },
  gpsBtnLoading: { borderColor: Colors.border, backgroundColor: Colors.surface },
  gpsBtnText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.base,
    color:      Colors.primary,
  },
  gpsBtnTextSuccess: { color: Colors.success },

  // ── Map
  mapContainer: {
    borderRadius:  BorderRadius.xl,
    overflow:      'hidden',
    marginBottom:  Spacing[4],
    ...Shadow.sm,
  },
  map: { height: 160, width: '100%' },
  mapRetry: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing[1],
    paddingVertical: Spacing[2],
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  mapRetryText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.primary,
  },
  mapFallback: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing[2],
    backgroundColor: Colors.successLight,
    borderRadius:    BorderRadius.xl,
    padding:         Spacing[3],
    marginBottom:    Spacing[4],
  },
  mapFallbackText: {
    flex:       1,
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.success,
  },

  // ── Default toggle
  defaultRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    backgroundColor: Colors.surface,
    borderRadius:   BorderRadius.xl,
    padding:        Spacing[4],
    marginTop:      Spacing[4],
    marginBottom:   Spacing[2],
  },
  defaultTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base, color: Colors.text },
  defaultSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },

  // ── Footer note
  noGpsNote: {
    fontFamily:  Typography.fontFamily.regular,
    fontSize:    Typography.size.xs,
    color:       Colors.textSecondary,
    textAlign:   'center',
    marginTop:   Spacing[3],
    lineHeight:  18,
  },
});
