/**
 * OtpScreen.jsx
 * ─────────────────────────────────────────────────────
 * Step 2 of the auth flow — user enters the 6-digit OTP
 * received via SMS to complete phone verification.
 *
 * Features:
 *   • Same amber-gradient hero as PhoneScreen
 *   • 6 individual TextInput boxes with auto-advance / backspace-back
 *   • 60-second resend countdown timer
 *   • Calls verifyOtp → setSession → RootNavigator auto-redirects
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  StatusBar,
  ActivityIndicator,
} from 'react-native';

import { verifyOtp, requestOtp } from '../../api/auth';
import useAuthStore              from '../../store/authStore';
import Button                   from '../../components/common/Button';
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  Shadow,
} from '../../theme';

// ─── Constants ────────────────────────────────────────
const OTP_LENGTH    = 6;
const RESEND_SECS   = 60;

// ─── Helpers ──────────────────────────────────────────
const emptyOtp = () => Array(OTP_LENGTH).fill('');

// ─── Component ────────────────────────────────────────
export default function OtpScreen({ route }) {
  const { phone } = route.params ?? {};
  const setSession = useAuthStore((s) => s.setSession);

  // OTP state — array of single chars
  const [digits,    setDigits]    = useState(emptyOtp());
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [resending, setResending] = useState(false);
  const [timer,     setTimer]     = useState(RESEND_SECS);
  const [canResend, setCanResend] = useState(false);

  // One ref per OTP box
  const inputRefs = useRef(Array.from({ length: OTP_LENGTH }, () => React.createRef()));

  // ── Countdown timer ──────────────────────────────────
  useEffect(() => {
    if (timer <= 0) {
      setCanResend(true);
      return;
    }
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  // Auto-focus first box on mount
  useEffect(() => {
    const t = setTimeout(() => inputRefs.current[0]?.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  // ── OTP input handlers ───────────────────────────────
  const handleDigitChange = useCallback((text, index) => {
    setError('');
    // Strip non-digits; take last char (handles paste of full OTP)
    const sanitised = text.replace(/\D/g, '');

    if (sanitised.length > 1) {
      // Handle paste: distribute digits across boxes
      const pasteDigits = sanitised.slice(0, OTP_LENGTH).split('');
      const next = [...emptyOtp()];
      pasteDigits.forEach((d, i) => { next[i] = d; });
      setDigits(next);
      // Focus last filled box (or the one after)
      const focusIdx = Math.min(pasteDigits.length, OTP_LENGTH - 1);
      inputRefs.current[focusIdx]?.current?.focus();
      return;
    }

    const next = [...digits];
    next[index] = sanitised;
    setDigits(next);

    if (sanitised && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.current?.focus();
    }
  }, [digits]);

  const handleKeyPress = useCallback(({ nativeEvent }, index) => {
    if (nativeEvent.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Clear previous box and move focus back
        const next = [...digits];
        next[index - 1] = '';
        setDigits(next);
        inputRefs.current[index - 1]?.current?.focus();
      }
    }
  }, [digits]);

  // ── Verify ───────────────────────────────────────────
  const handleVerify = async () => {
    Keyboard.dismiss();
    setError('');

    const otp = digits.join('');
    if (otp.length < OTP_LENGTH) {
      setError('Please enter the complete 6-digit OTP.');
      return;
    }

    setLoading(true);
    try {
      const data = await verifyOtp(phone, otp);
      // Persist session in Zustand → RootNavigator re-renders to TabNavigator
      setSession(data.user, data.token);
    } catch (err) {
      setError(err?.message ?? 'Invalid OTP. Please try again.');
      // Clear digits for a re-entry UX
      setDigits(emptyOtp());
      setTimeout(() => inputRefs.current[0]?.current?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  // ── Resend ───────────────────────────────────────────
  const handleResend = async () => {
    if (!canResend || resending) return;
    setResending(true);
    setError('');
    setDigits(emptyOtp());
    try {
      await requestOtp(phone);
      setTimer(RESEND_SECS);
      setCanResend(false);
      setTimeout(() => inputRefs.current[0]?.current?.focus(), 100);
    } catch (err) {
      setError('Could not resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  // ── Display helpers ──────────────────────────────────
  const maskedPhone = phone
    ? phone.slice(0, 3) + ' ' + phone.slice(3, 8).replace(/\d/g, '•') + ' ' + phone.slice(-2)
    : '';

  const timerLabel = `${String(Math.floor(timer / 60)).padStart(2, '0')}:${String(timer % 60).padStart(2, '0')}`;

  // ── Render ───────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* ── Gradient hero ── */}
      <View style={styles.heroTop} />
      <View style={styles.heroBottom} />

      {/* ── Hero content ── */}
      <SafeAreaView style={styles.heroContent} pointerEvents="box-none">
        <View style={styles.logoBlock}>
          <Text style={styles.appName}>Tezz</Text>
          <Text style={styles.appNameAccent}>Nirmaan</Text>
          <Text style={styles.tagline}>
            Construction materials, delivered fast
          </Text>
        </View>
      </SafeAreaView>

      {/* ── Bottom card ── */}
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
              {/* Pull bar */}
              <View style={styles.pullBar} />

              {/* Heading */}
              <Text style={styles.cardTitle}>Verify OTP</Text>
              <Text style={styles.cardSubtitle}>
                Enter the 6-digit code sent to{'\n'}
                <Text style={styles.phoneHighlight}>{maskedPhone || phone}</Text>
              </Text>

              {/* OTP boxes */}
              <View style={styles.otpRow}>
                {digits.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={inputRefs.current[index]}
                    style={[
                      styles.otpBox,
                      digit         && styles.otpBoxFilled,
                      error         && styles.otpBoxError,
                    ]}
                    value={digit}
                    onChangeText={(text) => handleDigitChange(text, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    keyboardType="number-pad"
                    maxLength={OTP_LENGTH}        // allows paste handling
                    textContentType="oneTimeCode" // iOS SMS autofill
                    autoComplete="sms-otp"        // Android SMS autofill
                    selectTextOnFocus
                    caretHidden
                    returnKeyType="done"
                    onSubmitEditing={handleVerify}
                  />
                ))}
              </View>

              {/* Error */}
              {!!error && (
                <View style={styles.errorRow}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Resend row */}
              <View style={styles.resendRow}>
                {canResend ? (
                  <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.resendBtn}>
                    {resending ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Text style={styles.resendActive}>Resend OTP</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.resendTimer}>
                    Resend OTP in{' '}
                    <Text style={styles.resendTimerCount}>{timerLabel}</Text>
                  </Text>
                )}
              </View>

              {/* Verify button */}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                onPress={handleVerify}
                style={styles.ctaButton}
              >
                Verify OTP
              </Button>

              {/* Security note */}
              <Text style={styles.secureNote}>
                🔒  Your number is safe with us and never shared
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

  // ── Gradient hero ────────────────────────────────
  heroTop: {
    ...StyleSheet.absoluteFillObject,
    bottom: '54%',
    backgroundColor: Colors.primary,
  },
  heroBottom: {
    ...StyleSheet.absoluteFillObject,
    top: '46%',
    backgroundColor: Colors.primaryDark,
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
  tagline: {
    marginTop: Spacing[3],
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.regular,
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: Typography.tracking.wide,
  },

  // ── KAV ──────────────────────────────────────────
  kavContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    zIndex: 2,
  },

  // ── White card ───────────────────────────────────
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
    lineHeight: Typography.size.base * 1.6,
  },
  phoneHighlight: {
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text,
  },

  // ── OTP boxes ─────────────────────────────────────
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
    gap: Spacing[2],
  },
  otpBox: {
    flex: 1,
    aspectRatio: 0.9,
    maxWidth: 52,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface2,
    textAlign: 'center',
    fontSize: Typography.size['2xl'],
    fontFamily: Typography.fontFamily.bold,
    color: Colors.text,
  },
  otpBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
    color: Colors.primaryDark,
  },
  otpBoxError: {
    borderColor: Colors.error,
    backgroundColor: Colors.errorLight,
  },

  // ── Error ─────────────────────────────────────────
  errorRow: {
    backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    marginBottom: Spacing[3],
  },
  errorText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.medium,
    color: Colors.error,
    textAlign: 'center',
  },

  // ── Resend ────────────────────────────────────────
  resendRow: {
    alignItems: 'center',
    marginBottom: Spacing[5],
    minHeight: 28,
    justifyContent: 'center',
  },
  resendBtn: {
    paddingVertical: Spacing[1],
    paddingHorizontal: Spacing[3],
  },
  resendActive: {
    fontSize: Typography.size.base,
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.primary,
  },
  resendTimer: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textSecondary,
  },
  resendTimerCount: {
    fontFamily: Typography.fontFamily.semiBold,
    color: Colors.text,
  },

  // ── CTA ───────────────────────────────────────────
  ctaButton: {
    borderRadius: BorderRadius.xl,
  },

  // ── Security note ─────────────────────────────────
  secureNote: {
    marginTop: Spacing[5],
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontFamily.regular,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: Typography.size.sm * 1.6,
  },
});
