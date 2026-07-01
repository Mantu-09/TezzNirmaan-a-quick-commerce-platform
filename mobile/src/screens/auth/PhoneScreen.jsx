/**
 * PhoneScreen.jsx
 * ─────────────────────────────────────────────────────
 * Step 1 of the auth flow — user enters their 10-digit
 * mobile number to receive an OTP.
 *
 * Layout:
 *   • Full-screen amber gradient hero (top ~45%)
 *   • White rounded card slides up from the bottom
 *   • KeyboardAvoidingView keeps the card above the keyboard
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  StatusBar,
} from 'react-native';

import { requestOtp }  from '../../api/auth';
import Input           from '../../components/common/Input';
import Button          from '../../components/common/Button';
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  Shadow,
} from '../../theme';

// ─── Constants ────────────────────────────────────────
const COUNTRY_CODE = '+91';

// ─── Component ────────────────────────────────────────
export default function PhoneScreen({ navigation }) {
  const [phone,   setPhone]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // ── Validation ──────────────────────────────────────
  const isValidPhone = (num) => /^\d{10}$/.test(num.trim());

  // ── Submit ──────────────────────────────────────────
  const handleSendOtp = async () => {
    Keyboard.dismiss();
    setError('');

    const trimmed = phone.trim();

    if (!trimmed) {
      setError('Please enter your mobile number.');
      return;
    }
    if (!isValidPhone(trimmed)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    try {
      const fullPhone = `${COUNTRY_CODE}${trimmed}`;
      await requestOtp(fullPhone);
      navigation.navigate('Otp', { phone: fullPhone });
    } catch (err) {
      setError(err?.message ?? 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* ── Gradient hero: two stacked Views simulate a vertical gradient ── */}
      <View style={styles.heroTop} />
      <View style={styles.heroBottom} />

      {/* ── Hero content: logo + tagline ── */}
      <SafeAreaView style={styles.heroContent} pointerEvents="box-none">
        <View style={styles.logoBlock}>
          <Text style={styles.appName}>Tezz</Text>
          <Text style={styles.appNameAccent}>Nirmaan</Text>
          <View style={styles.taglineRow}>
            <Text style={styles.taglineIcon}>🏗️</Text>
            <Text style={styles.tagline}>
              Construction materials, delivered fast
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Bottom card (keyboard-aware) ── */}
      <KeyboardAvoidingView
        style={styles.kavContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.card}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cardInner}
            >
              {/* Pull indicator */}
              <View style={styles.pullBar} />

              {/* Card heading */}
              <Text style={styles.cardTitle}>Enter your mobile number</Text>
              <Text style={styles.cardSubtitle}>
                We'll send a 6-digit OTP to verify your number
              </Text>

              {/* Phone input */}
              <Input
                label="Mobile Number"
                value={phone}
                onChangeText={(text) => {
                  setError('');
                  setPhone(text.replace(/\D/g, '').slice(0, 10));
                }}
                placeholder="XXXXXXXXXX"
                keyboardType="phone-pad"
                prefix={`${COUNTRY_CODE}  `}
                maxLength={10}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSendOtp}
                error={error}
                style={styles.inputWrapper}
              />

              {/* Send OTP button */}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                onPress={handleSendOtp}
                style={styles.ctaButton}
              >
                Send OTP
              </Button>

              {/* Terms */}
              <Text style={styles.terms}>
                By continuing, you agree to our{' '}
                <Text style={styles.termsLink}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </Text>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.primaryDark,
  },

  // ── Hero gradient (two-layer simulation) ─────────
  heroTop: {
    ...StyleSheet.absoluteFillObject,
    bottom: '54%',
    backgroundColor: Colors.primary,       // #E8740C
  },
  heroBottom: {
    ...StyleSheet.absoluteFillObject,
    top: '46%',
    backgroundColor: Colors.primaryDark,   // #BF5A00
  },

  // ── Hero content ──────────────────────────────────
  heroContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: Spacing[8],
    zIndex: 1,
  },
  logoBlock: {
    alignItems: 'center',
  },
  appName: {
    fontSize: Typography.size['5xl'],
    fontFamily: Typography.fontFamily.bold,
    color: Colors.primaryText,
    lineHeight: Typography.size['5xl'] * 1.1,
    letterSpacing: Typography.tracking.tight,
  },
  appNameAccent: {
    fontSize: Typography.size['4xl'],
    fontFamily: Typography.fontFamily.bold,
    color: 'rgba(255,255,255,0.88)',
    lineHeight: Typography.size['4xl'] * 1.1,
    letterSpacing: Typography.tracking.tight,
    marginTop: -Spacing[1],
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing[3],
    gap: Spacing[2],
  },
  taglineIcon: {
    fontSize: Typography.size.base,
  },
  tagline: {
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.regular,
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: Typography.tracking.wide,
  },

  // ── KAV wrapper ───────────────────────────────────
  kavContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    zIndex: 2,
  },

  // ── White bottom card ─────────────────────────────
  card: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius['3xl'],
    borderTopRightRadius: BorderRadius['3xl'],
    ...Shadow.xl,
  },
  pullBar: {
    width: 40,
    height: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing[4],
  },
  cardInner: {
    paddingTop: Spacing[5],
    paddingHorizontal: Spacing[6],
    paddingBottom: Spacing[12],
  },
  cardTitle: {
    fontSize: Typography.size['2xl'],
    fontFamily: Typography.fontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing[1],
  },
  cardSubtitle: {
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
    marginBottom: Spacing[6],
    lineHeight: Typography.size.base * 1.5,
  },
  inputWrapper: {
    marginBottom: Spacing[2],
  },
  ctaButton: {
    marginTop: Spacing[4],
    borderRadius: BorderRadius.xl,
  },

  // ── Terms text ────────────────────────────────────
  terms: {
    marginTop: Spacing[5],
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: Typography.size.sm * 1.7,
  },
  termsLink: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.medium,
  },
});
