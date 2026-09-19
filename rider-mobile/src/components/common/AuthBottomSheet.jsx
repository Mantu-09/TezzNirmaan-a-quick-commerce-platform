/**
 * AuthBottomSheet.jsx
 * Slide-up modal that handles the full mobile+OTP login flow.
 * Used from CartScreen when a guest taps "Login to Proceed ->".
 *
 * Props:
 *   visible    {boolean}  -- controls sheet visibility
 *   onClose    {function} -- called when user dismisses without logging in
 *   onSuccess  {function} -- called after successful OTP verification
 */

import React, {
  useState, useRef, useEffect, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Modal, Animated, Keyboard, KeyboardAvoidingView, Platform,
  ActivityIndicator, Dimensions, TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { Ionicons }    from '@expo/vector-icons';
import { requestOtp, verifyOtp } from '../../api/auth';
import useAuthStore              from '../../store/authStore';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';

const { height: SCREEN_H } = Dimensions.get('window');
const COUNTRY_CODE = '+91';
const OTP_LENGTH   = 6;
const RESEND_SECS  = 60;

// Step 1: Phone entry
function PhoneStep({ onNext }) {
  const [phone,   setPhone]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const isValid = (n) => /^\d{10}$/.test(n.trim());

  const handleSend = async () => {
    Keyboard.dismiss();
    setError('');
    const trimmed = phone.trim();
    if (!trimmed) { setError('Please enter your mobile number.'); return; }
    if (!isValid(trimmed)) { setError('Enter a valid 10-digit mobile number.'); return; }
    setLoading(true);
    try {
      const fullPhone = `${COUNTRY_CODE}${trimmed}`;
      await requestOtp(fullPhone);
      onNext(fullPhone);
    } catch (err) {
      setError(err?.message ?? 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Enter your mobile number</Text>
      <Text style={styles.stepSubtitle}>
        We will send a 6-digit OTP to verify your number
      </Text>
      <View style={[styles.phoneInputRow, error ? styles.inputError : null]}>
        <Text style={styles.countryCode}>{COUNTRY_CODE}</Text>
        <View style={styles.inputDivider} />
        <TextInput
          style={styles.phoneInput}
          value={phone}
          onChangeText={(t) => { setError(''); setPhone(t.replace(/\D/g, '').slice(0, 10)); }}
          placeholder="XXXXXXXXXX"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="phone-pad"
          maxLength={10}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSend}
        />
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      <TouchableOpacity
        style={[styles.ctaButton, loading && styles.ctaDisabled]}
        onPress={handleSend}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.ctaText}>Send OTP</Text>}
      </TouchableOpacity>
      <Text style={styles.terms}>
        By continuing, you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );
}

// Step 2: OTP entry
function OtpStep({ phone, onBack }) {
  const { setSession } = useAuthStore();
  const [otp,       setOtp]       = useState(Array(OTP_LENGTH).fill(''));
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [timer,     setTimer]     = useState(RESEND_SECS);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setTimeout(() => setTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const handleChange = useCallback((text, idx) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    const next  = [...otp];
    next[idx]   = digit;
    setOtp(next);
    setError('');
    if (digit && idx < OTP_LENGTH - 1) inputRefs.current[idx + 1]?.focus();
    if (next.every(d => d) && next.join('').length === OTP_LENGTH) handleVerify(next.join(''));
  }, [otp]);

  const handleKeyPress = useCallback(({ nativeEvent }, idx) => {
    if (nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }, [otp]);

  const handleVerify = async (code = otp.join('')) => {
    if (code.length < OTP_LENGTH) { setError('Enter the 6-digit OTP.'); return; }
    Keyboard.dismiss();
    setLoading(true);
    setError('');
    try {
      const res = await verifyOtp(phone, code);
      setSession(res.user, res.token);
    } catch (err) {
      setError(err?.message ?? 'Invalid OTP. Please try again.');
      setOtp(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0) return;
    setResending(true);
    setError('');
    try {
      await requestOtp(phone);
      setTimer(RESEND_SECS);
      setOtp(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err?.message ?? 'Could not resend OTP.');
    } finally {
      setResending(false);
    }
  };

  const maskedPhone = `${phone.slice(0, 3)}XXXXXXX${phone.slice(-2)}`;

  return (
    <View style={styles.stepContainer}>
      <TouchableOpacity style={styles.backRow} onPress={onBack}>
        <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
        <Text style={styles.backText}>Change number</Text>
      </TouchableOpacity>
      <Text style={styles.stepTitle}>Enter OTP</Text>
      <Text style={styles.stepSubtitle}>Sent to {maskedPhone}</Text>
      <View style={styles.otpRow}>
        {otp.map((digit, idx) => (
          <TextInput
            key={idx}
            ref={el => (inputRefs.current[idx] = el)}
            style={[styles.otpBox, digit ? styles.otpBoxFilled : null, error ? styles.otpBoxError : null]}
            value={digit}
            onChangeText={(t) => handleChange(t, idx)}
            onKeyPress={(e) => handleKeyPress(e, idx)}
            keyboardType="number-pad"
            maxLength={1}
            textAlign="center"
            selectTextOnFocus
            autoFocus={idx === 0}
          />
        ))}
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      <TouchableOpacity
        style={[styles.ctaButton, (loading || otp.join('').length < OTP_LENGTH) && styles.ctaDisabled]}
        onPress={() => handleVerify()}
        disabled={loading || otp.join('').length < OTP_LENGTH}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.ctaText}>Verify OTP</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.resendRow} onPress={handleResend} disabled={timer > 0 || resending}>
        {resending
          ? <ActivityIndicator size="small" color={Colors.primary} />
          : <Text style={[styles.resendText, timer > 0 && styles.resendDisabled]}>
              {timer > 0 ? `Resend OTP in ${timer}s` : 'Resend OTP'}
            </Text>}
      </TouchableOpacity>
    </View>
  );
}

// Main AuthBottomSheet
export default function AuthBottomSheet({ visible, onClose, onSuccess }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const [step, setStep]   = useState('phone');
  const [phone, setPhone] = useState('');
  const isAuthenticated   = useAuthStore(s => s.isAuthenticated);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue:         visible ? 0 : SCREEN_H,
      duration:        300,
      useNativeDriver: true,
    }).start();
    if (!visible) {
      setTimeout(() => { setStep('phone'); setPhone(''); }, 300);
    }
  }, [visible]);

  // When auth completes (OTP verified), call onSuccess
  useEffect(() => {
    if (isAuthenticated && visible) {
      onSuccess?.();
    }
  }, [isAuthenticated]);

  const handlePhoneNext = (fullPhone) => {
    setPhone(fullPhone);
    setStep('otp');
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        style={styles.kavWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.pullBar} />
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.brandRow}>
            <Text style={styles.brandName}>Tezz</Text>
            <Text style={styles.brandAccent}>Nirmaan</Text>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {step === 'phone'
              ? <PhoneStep onNext={handlePhoneNext} />
              : <OtpStep phone={phone} onBack={() => setStep('phone')} />}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  kavWrapper: { flex: 1, justifyContent: 'flex-end', pointerEvents: 'box-none' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius:  BorderRadius['3xl'],
    borderTopRightRadius: BorderRadius['3xl'],
    paddingBottom: 40,
    minHeight: 420,
    ...Shadow.xl,
  },
  pullBar: {
    width: 40, height: 4,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
    alignSelf: 'center',
    marginTop: Spacing[3], marginBottom: Spacing[2],
  },
  closeBtn: { position: 'absolute', top: Spacing[4], right: Spacing[4], zIndex: 10 },
  brandRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', marginBottom: Spacing[2], paddingHorizontal: Spacing[6] },
  brandName:   { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.primary },
  brandAccent: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text, marginLeft: 2 },
  stepContainer: { paddingHorizontal: Spacing[6], paddingTop: Spacing[3], paddingBottom: Spacing[4] },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing[4] },
  backText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  stepTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.text, marginBottom: Spacing[1] },
  stepSubtitle: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textSecondary, marginBottom: Spacing[5], lineHeight: Typography.size.base * 1.5 },
  phoneInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.xl, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], marginBottom: Spacing[2], backgroundColor: Colors.surface },
  inputError: { borderColor: Colors.error || '#EF4444' },
  countryCode: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.text, marginRight: Spacing[2] },
  inputDivider: { width: 1, height: 20, backgroundColor: Colors.border, marginRight: Spacing[3] },
  phoneInput: { flex: 1, fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.lg, color: Colors.text, padding: 0 },
  errorText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.error || '#EF4444', marginBottom: Spacing[3] },
  ctaButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.xl, paddingVertical: Spacing[4], alignItems: 'center', marginTop: Spacing[2], marginBottom: Spacing[4] },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: '#fff' },
  terms: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textTertiary, textAlign: 'center', lineHeight: Typography.size.sm * 1.7 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing[2], marginBottom: Spacing[3] },
  otpBox: { flex: 1, aspectRatio: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.lg, fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text, backgroundColor: Colors.surface },
  otpBoxFilled: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  otpBoxError:  { borderColor: Colors.error || '#EF4444' },
  resendRow: { alignItems: 'center', paddingVertical: Spacing[2] },
  resendText:     { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base, color: Colors.primary },
  resendDisabled: { color: Colors.textTertiary },
});
