/**
 * CitySelectScreen — P4-4A
 *
 * Shown on first app open (before OTP login) and from Profile → Change City.
 *
 * Features:
 *   • Fetches live city list from GET /public/cities
 *   • Radio-style city list with "Available" / "Coming Soon" badges
 *   • 📍 "Use my location" — GPS auto-select nearest active city
 *   • If GPS resolves to a coming-soon city → inline waitlist form
 *   • Stores selection in cityStore (AsyncStorage persistent)
 *   • Navigates appropriately (pre-auth: to Phone screen; post-auth: goBack)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchCities, joinWaitlist } from '../../api/cities';
import useCityStore from '../../store/cityStore';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';

// Haversine distance in km between two lat/lng points
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── City Row ────────────────────────────────────────────────
function CityRow({ city, selected, onPress }) {
  const active = city.is_active;
  return (
    <TouchableOpacity
      style={[styles.cityRow, selected && styles.cityRowSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Radio button */}
      <View style={[styles.radio, selected && styles.radioSelected, !active && styles.radioDisabled]}>
        {selected && <View style={styles.radioInner} />}
      </View>

      {/* City info */}
      <View style={styles.cityInfo}>
        <Text style={[styles.cityName, !active && styles.cityNameDim]}>{city.name}</Text>
        <Text style={styles.cityState}>{city.state}</Text>
      </View>

      {/* Badge */}
      <View style={[styles.badge, active ? styles.badgeActive : styles.badgeComingSoon]}>
        <Text style={[styles.badgeText, active ? styles.badgeTextActive : styles.badgeTextComingSoon]}>
          {active ? 'Available' : 'Coming Soon'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Waitlist Form ───────────────────────────────────────────
function WaitlistForm({ city, onSuccess }) {
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');

  const mutation = useMutation({
    mutationFn: () => joinWaitlist({ city_id: city.id, name: name.trim(), phone: phone.trim() }),
    onSuccess:  () => onSuccess(),
    onError:    (e) => Alert.alert('Error', e.message || 'Could not join waitlist. Please try again.'),
  });

  const valid = name.trim().length >= 2 && /^[6-9]\d{9}$/.test(phone.trim());

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.waitlistCard}>
        <View style={styles.waitlistIcon}>
          <Text style={{ fontSize: 28 }}>📬</Text>
        </View>
        <Text style={styles.waitlistTitle}>
          Be the first to know when TezzNirmaan launches in {city.name}!
        </Text>
        <Text style={styles.waitlistSub}>
          We'll notify you as soon as we're live.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={Colors.textTertiary}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          placeholder="Mobile number (10 digits)"
          placeholderTextColor={Colors.textTertiary}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={10}
        />

        <TouchableOpacity
          style={[styles.waitlistBtn, (!valid || mutation.isPending) && styles.waitlistBtnDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!valid || mutation.isPending}
          activeOpacity={0.85}
        >
          {mutation.isPending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.waitlistBtnText}>Join Waitlist</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.waitlistSkip} onPress={onSuccess}>
          <Text style={styles.waitlistSkipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Main Screen ─────────────────────────────────────────────
export default function CitySelectScreen({ navigation, route }) {
  const { setCity }       = useCityStore();
  const isPostAuth        = route?.params?.postAuth === true;

  const [selected, setSelected]           = useState(null); // city object
  const [locLoading, setLocLoading]       = useState(false);
  const [waitlistCity, setWaitlistCity]   = useState(null); // coming-soon city for waitlist
  const [waitlistDone, setWaitlistDone]   = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['public-cities'],
    queryFn:  fetchCities,
    staleTime: 10 * 60 * 1000,
    retry: 2,
  });

  const cities = data?.cities || [];

  const handleConfirm = useCallback(() => {
    if (!selected) return;
    setCity(selected);
    if (isPostAuth) {
      navigation.goBack();
    } else {
      navigation.replace('Phone'); // pre-auth: continue to OTP flow
    }
  }, [selected, isPostAuth, setCity, navigation]);

  const handleCityPress = useCallback((city) => {
    if (!city.is_active) {
      setWaitlistCity(city);
      return;
    }
    setSelected(city);
  }, []);

  const handleUseLocation = useCallback(async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Permission', 'Please enable location access to auto-detect your city.');
        setLocLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;

      // Find nearest city
      let nearest = null;
      let minDist = Infinity;
      for (const city of cities) {
        const d = haversineKm(latitude, longitude, city.center_lat, city.center_lng);
        if (d < minDist) { minDist = d; nearest = city; }
      }

      if (nearest) {
        if (nearest.is_active) {
          setSelected(nearest);
        } else {
          // Detected in a coming-soon city → show waitlist
          setWaitlistCity(nearest);
        }
      }
    } catch (e) {
      Alert.alert('Location Error', 'Could not determine your location. Please select manually.');
    } finally {
      setLocLoading(false);
    }
  }, [cities]);

  // Waitlist done → show success then let user pick manually
  const handleWaitlistSuccess = useCallback(() => {
    setWaitlistDone(true);
    setWaitlistCity(null);
    setTimeout(() => setWaitlistDone(false), 3000);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        {isPostAuth && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
        )}
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Select your city</Text>
          <Text style={styles.headerSub}>We'll show shops and delivery options near you</Text>
        </View>
      </View>

      {/* Waitlist success toast */}
      {waitlistDone && (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text style={styles.toastText}>You're on the waitlist! We'll notify you when we launch.</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Waitlist Form (inline) */}
        {waitlistCity && !waitlistDone && (
          <WaitlistForm city={waitlistCity} onSuccess={handleWaitlistSuccess} />
        )}

        {/* City List */}
        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading cities...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>Could not load cities. Check your connection.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={refetch}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cityList}>
            {cities.map((city) => (
              <CityRow
                key={city.id}
                city={city}
                selected={selected?.id === city.id}
                onPress={() => handleCityPress(city)}
              />
            ))}
          </View>
        )}

        {/* Use My Location */}
        <TouchableOpacity
          style={styles.locationBtn}
          onPress={handleUseLocation}
          disabled={locLoading || isLoading}
          activeOpacity={0.8}
        >
          {locLoading
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Ionicons name="location" size={18} color={Colors.primary} />
          }
          <Text style={styles.locationBtnText}>
            {locLoading ? 'Detecting location...' : '📍 Use my location'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Confirm CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!selected}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmBtnText}>
            {selected ? `Continue with ${selected.name}` : 'Select a city to continue'}
          </Text>
          {selected && <Ionicons name="arrow-forward" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing[5], paddingTop: Spacing[4], paddingBottom: Spacing[3],
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  headerContent: { flex: 1 },
  headerTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'],
    color: Colors.text, marginBottom: 3,
  },
  headerSub: {
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing[5], paddingTop: Spacing[5], paddingBottom: Spacing[4] },

  cityList: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    overflow: 'hidden', marginBottom: Spacing[4], ...Shadow.sm,
  },

  cityRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[4],
    gap: Spacing[3],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cityRowSelected: {
    backgroundColor: Colors.primaryLight,
  },

  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.primary },
  radioDisabled: { borderColor: Colors.border, opacity: 0.5 },
  radioInner:    { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },

  cityInfo:    { flex: 1 },
  cityName:    { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text },
  cityNameDim: { color: Colors.textSecondary },
  cityState:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },

  badge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
    borderWidth: 1,
  },
  badgeActive:        { backgroundColor: 'rgba(22,163,74,0.1)', borderColor: 'rgba(22,163,74,0.3)' },
  badgeComingSoon:    { backgroundColor: 'rgba(100,116,139,0.1)', borderColor: 'rgba(100,116,139,0.3)' },
  badgeText:          { fontFamily: Typography.fontFamily.semiBold, fontSize: 10, letterSpacing: 0.3 },
  badgeTextActive:    { color: '#16a34a' },
  badgeTextComingSoon:{ color: '#64748b' },

  locationBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing[2], paddingVertical: Spacing[4],
    borderRadius: BorderRadius.xl, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing[4],
    ...Shadow.sm,
  },
  locationBtnText: {
    fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base,
    color: Colors.primary,
  },

  footer: {
    padding: Spacing[5], paddingBottom: Spacing[6],
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  confirmBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.xl,
    padding: Spacing[4], flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: Spacing[2], ...Shadow.md,
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmBtnText: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: '#fff',
  },

  // Waitlist card
  waitlistCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing[5], marginBottom: Spacing[4], alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  waitlistIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[3],
  },
  waitlistTitle: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base,
    color: Colors.text, textAlign: 'center', marginBottom: Spacing[2],
  },
  waitlistSub: {
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm,
    color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing[4],
  },
  input: {
    width: '100%', backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.lg, padding: Spacing[4],
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base,
    color: Colors.text, marginBottom: Spacing[3],
  },
  waitlistBtn: {
    width: '100%', backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg, padding: Spacing[4],
    alignItems: 'center', marginBottom: Spacing[3],
  },
  waitlistBtnDisabled: { opacity: 0.45 },
  waitlistBtnText: {
    fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: '#fff',
  },
  waitlistSkip: { paddingVertical: Spacing[2] },
  waitlistSkipText: {
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm,
    color: Colors.textSecondary, textDecorationLine: 'underline',
  },

  centerBox: { padding: Spacing[8], alignItems: 'center' },
  loadingText: {
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm,
    color: Colors.textSecondary, marginTop: Spacing[3],
  },
  errorText: {
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm,
    color: Colors.error, textAlign: 'center', marginBottom: Spacing[4],
  },
  retryBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[6], paddingVertical: Spacing[3],
  },
  retryText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: '#fff' },

  toast: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: 'rgba(22,163,74,0.1)', borderWidth: 1, borderColor: 'rgba(22,163,74,0.3)',
    borderRadius: BorderRadius.lg, padding: Spacing[3], marginHorizontal: Spacing[5],
    marginTop: Spacing[3],
  },
  toastText: {
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs,
    color: '#16a34a', flex: 1,
  },
});
