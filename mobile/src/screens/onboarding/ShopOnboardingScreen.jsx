/**
 * ShopOnboardingScreen — B2
 * 4-step first-login wizard for shop owners.
 *
 * Step 1: Verify Shop Details
 * Step 2: Operating Hours
 * Step 3: Shop Photos (simplified — no upload in B2)
 * Step 4: Add First Product
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadow } from '../../theme';
import { client } from '../../api/client';
import useAuthStore from '../../store/authStore';

// ─── Constants ─────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const UNIT_OPTIONS = ['piece', 'kg', 'bag', 'litre', 'meter'];

const DEFAULT_HOURS = DAYS.reduce((acc, d) => {
  acc[d.key] = { open: d.key !== 'sun', openTime: '08:00', closeTime: '20:00' };
  return acc;
}, {});

// ─── Progress Bar ───────────────────────────────────────────────────────────

function ProgressBar({ currentStep }) {
  return (
    <View style={styles.progressContainer}>
      {DAYS.slice(0, TOTAL_STEPS).map((_, idx) => {
        const step = idx + 1;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;
        return (
          <React.Fragment key={step}>
            <View
              style={[
                styles.progressDot,
                isCompleted && styles.progressDotCompleted,
                isActive && styles.progressDotActive,
              ]}
            >
              {isCompleted ? (
                <Ionicons name="checkmark" size={12} color={Colors.primaryText} />
              ) : (
                <Text style={[styles.progressDotText, isActive && { color: Colors.primaryText }]}>
                  {step}
                </Text>
              )}
            </View>
            {step < TOTAL_STEPS && (
              <View style={[styles.progressLine, isCompleted && styles.progressLineCompleted]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Step Header ─────────────────────────────────────────────────────────────

function StepHeader({ icon, title, subtitle, currentStep }) {
  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepIconContainer}>
        <Ionicons name={icon} size={28} color={Colors.primary} />
      </View>
      <Text style={styles.stepIndicator}>Step {currentStep} of {TOTAL_STEPS}</Text>
      <Text style={styles.stepTitle}>{title}</Text>
      {subtitle ? <Text style={styles.stepSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

// ─── Step 1: Verify Shop Details ─────────────────────────────────────────────

function Step1VerifyShop({ shopDetails, setShopDetails }) {
  return (
    <View>
      <StepHeader
        icon="storefront-outline"
        title="Verify Shop Details"
        subtitle="Review and update your shop information. This is what customers will see."
        currentStep={1}
      />

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Shop Name</Text>
        <TextInput
          style={styles.input}
          value={shopDetails.name}
          onChangeText={(t) => setShopDetails((p) => ({ ...p, name: t }))}
          placeholder="e.g. Sharma General Store"
          placeholderTextColor={Colors.textTertiary}
          autoCapitalize="words"
        />

        <Text style={[styles.fieldLabel, { marginTop: Spacing[4] }]}>Phone Number</Text>
        <TextInput
          style={styles.input}
          value={shopDetails.phone}
          onChangeText={(t) => setShopDetails((p) => ({ ...p, phone: t }))}
          placeholder="e.g. 9876543210"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="phone-pad"
          maxLength={10}
        />

        <Text style={[styles.fieldLabel, { marginTop: Spacing[4] }]}>Shop Description</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={shopDetails.description}
          onChangeText={(t) => setShopDetails((p) => ({ ...p, description: t }))}
          placeholder="Tell customers what you sell…"
          placeholderTextColor={Colors.textTertiary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {shopDetails.address ? (
          <View style={styles.addressBadge}>
            <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.addressBadgeText} numberOfLines={2}>
              {shopDetails.address}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Step 2: Operating Hours ─────────────────────────────────────────────────

function Step2Hours({ hours, setHours }) {
  const toggle = (dayKey) => {
    setHours((prev) => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], open: !prev[dayKey].open },
    }));
  };

  const setTime = (dayKey, field, value) => {
    // Allow only HH:MM format — basic input sanitization
    const cleaned = value.replace(/[^0-9:]/g, '').slice(0, 5);
    setHours((prev) => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], [field]: cleaned },
    }));
  };

  return (
    <View>
      <StepHeader
        icon="time-outline"
        title="Operating Hours"
        subtitle="Set when your shop is open. Customers can only place orders during these hours."
        currentStep={2}
      />

      <View style={styles.card}>
        {DAYS.map((day, idx) => {
          const dayData = hours[day.key];
          return (
            <View
              key={day.key}
              style={[styles.dayRow, idx < DAYS.length - 1 && styles.dayRowBorder]}
            >
              <View style={styles.dayLeft}>
                <Pressable
                  onPress={() => toggle(day.key)}
                  style={[styles.toggle, dayData.open && styles.toggleActive]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: dayData.open }}
                >
                  <View style={[styles.toggleKnob, dayData.open && styles.toggleKnobActive]} />
                </Pressable>
                <Text
                  style={[
                    styles.dayLabel,
                    !dayData.open && { color: Colors.textTertiary },
                  ]}
                >
                  {day.label}
                </Text>
              </View>

              {dayData.open ? (
                <View style={styles.timeRow}>
                  <TextInput
                    style={styles.timeInput}
                    value={dayData.openTime}
                    onChangeText={(v) => setTime(day.key, 'openTime', v)}
                    placeholder="08:00"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    accessibilityLabel={`${day.label} open time`}
                  />
                  <Text style={styles.timeSeparator}>–</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={dayData.closeTime}
                    onChangeText={(v) => setTime(day.key, 'closeTime', v)}
                    placeholder="20:00"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    accessibilityLabel={`${day.label} close time`}
                  />
                </View>
              ) : (
                <Text style={styles.closedLabel}>Closed</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Step 3: Shop Photos ──────────────────────────────────────────────────────

function Step3Photos() {
  return (
    <View>
      <StepHeader
        icon="images-outline"
        title="Shop Photos"
        subtitle="Great photos help you attract more customers and build trust."
        currentStep={3}
      />

      <View style={styles.card}>
        <View style={styles.photoGrid}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.photoSlot}>
              <Ionicons name="add" size={32} color={Colors.textTertiary} />
              <Text style={styles.photoSlotText}>
                {i === 0 ? 'Cover Photo' : `Photo ${i + 1}`}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.photoNotice}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
          <Text style={styles.photoNoticeText}>
            Photo upload will be enabled once your shop is verified by our team. We'll notify you within 24 hours.
          </Text>
        </View>
      </View>

      <View style={styles.tipCard}>
        <Text style={styles.tipTitle}>💡 Tips for great shop photos</Text>
        <Text style={styles.tipItem}>• Show your shop front clearly</Text>
        <Text style={styles.tipItem}>• Add photos of your product shelves</Text>
        <Text style={styles.tipItem}>• Use good lighting — natural light works best</Text>
      </View>
    </View>
  );
}

// ─── Step 4: Add First Product ────────────────────────────────────────────────

function Step4Product({ product, setProduct }) {
  return (
    <View>
      <StepHeader
        icon="cube-outline"
        title="Add Your First Product"
        subtitle="List a product to start receiving orders. You can add more from your dashboard."
        currentStep={4}
      />

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Product Name</Text>
        <TextInput
          style={styles.input}
          value={product.name}
          onChangeText={(t) => setProduct((p) => ({ ...p, name: t }))}
          placeholder="e.g. Basmati Rice"
          placeholderTextColor={Colors.textTertiary}
          autoCapitalize="words"
        />

        <Text style={[styles.fieldLabel, { marginTop: Spacing[4] }]}>Unit</Text>
        <View style={styles.unitPicker}>
          {UNIT_OPTIONS.map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.unitChip, product.unit === u && styles.unitChipActive]}
              onPress={() => setProduct((p) => ({ ...p, unit: u }))}
              accessibilityRole="radio"
              accessibilityState={{ selected: product.unit === u }}
            >
              <Text style={[styles.unitChipText, product.unit === u && styles.unitChipTextActive]}>
                {u}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Price (₹)</Text>
            <TextInput
              style={styles.input}
              value={product.price}
              onChangeText={(t) => setProduct((p) => ({ ...p, price: t }))}
              placeholder="0.00"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={[styles.halfField, { marginLeft: Spacing[3] }]}>
            <Text style={styles.fieldLabel}>Stock Qty</Text>
            <TextInput
              style={styles.input}
              value={product.stock}
              onChangeText={(t) => setProduct((p) => ({ ...p, stock: t }))}
              placeholder="0"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="number-pad"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Success Screen ────────────────────────────────────────────────────────────

function SuccessScreen() {
  const circles = Array.from({ length: 12 }, (_, i) => {
    const anim = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 120),
          Animated.spring(anim, {
            toValue: 1,
            friction: 4,
            tension: 80,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }, []);

    const angle = (i / 12) * 2 * Math.PI;
    const radius = 90;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const colors = [
      Colors.primary, '#FFB347', '#FF6B6B', Colors.secondary,
      '#A8E6CF', '#FFD93D', '#6BCB77', '#4D96FF',
      Colors.primary, '#FF6B6B', '#FFB347', Colors.secondary,
    ];

    return (
      <Animated.View
        key={i}
        style={[
          styles.confettiCircle,
          {
            backgroundColor: colors[i % colors.length],
            transform: [
              { translateX: x },
              { translateY: y },
              { scale: anim },
            ],
            opacity: anim,
          },
        ]}
      />
    );
  });

  return (
    <View style={styles.successContainer}>
      <View style={styles.confettiContainer}>
        {circles}
        <View style={styles.successIconCircle}>
          <Ionicons name="checkmark" size={52} color={Colors.primaryText} />
        </View>
      </View>

      <Text style={styles.successTitle}>You're all set! 🎉</Text>
      <Text style={styles.successSubtitle}>
        Your shop is now live on TezzNirmaan. Customers in your area can start finding and ordering from you.
      </Text>

      <View style={styles.successBadge}>
        <Ionicons name="storefront" size={16} color={Colors.primary} />
        <Text style={styles.successBadgeText}>Shop Onboarding Complete</Text>
      </View>

      <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing[8] }} />
      <Text style={styles.redirectText}>Taking you to your dashboard…</Text>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function ShopOnboardingScreen({ navigation }) {
  const { user, updateUser } = useAuthStore();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Step 1 state
  const [shopDetails, setShopDetails] = useState({
    name: user?.shop_name || '',
    phone: user?.phone || '',
    description: user?.shop_description || '',
    address: user?.shop_address || '',
  });

  // Step 2 state
  const [hours, setHours] = useState(DEFAULT_HOURS);

  // Step 4 state
  const [product, setProduct] = useState({
    name: '',
    unit: 'piece',
    price: '',
    stock: '',
  });

  // Slide animation
  const slideAnim = useRef(new Animated.Value(0)).current;

  const animateTransition = (direction, callback) => {
    const toValue = direction === 'forward' ? -40 : 40;
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      callback();
      slideAnim.setValue(-toValue);
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }).start();
    });
  };

  const goToStep = useCallback(
    (nextStep, direction = 'forward') => {
      animateTransition(direction, () => setCurrentStep(nextStep));
    },
    [slideAnim]
  );

  // ── Step 1: validate + save shop details
  const handleStep1Continue = async () => {
    if (!shopDetails.name.trim()) {
      Alert.alert('Required', 'Please enter your shop name.');
      return;
    }
    setLoading(true);
    try {
      await client.patch('/shop/profile', {
        shop_name: shopDetails.name.trim(),
        phone: shopDetails.phone.trim(),
        description: shopDetails.description.trim(),
      });
    } catch (e) {
      // Non-critical — shop details can be updated later
      console.warn('[Onboarding] Step 1 patch failed (non-critical):', e.message);
    } finally {
      setLoading(false);
    }
    goToStep(2);
  };

  // ── Step 2: save operating hours
  const handleStep2Continue = async () => {
    setLoading(true);
    try {
      await client.patch('/shop/hours', { hours });
    } catch (e) {
      console.warn('[Onboarding] Step 2 hours patch failed (non-critical):', e.message);
    } finally {
      setLoading(false);
    }
    goToStep(3);
  };

  // ── Step 3: skip / continue
  const handleStep3Continue = () => {
    goToStep(4);
  };

  // ── Complete setup — mark profile as done
  const completeSetup = async () => {
    try {
      await client.patch('/customer/profile', { setup_complete: true });
      // Update auth store so the root navigator re-routes to the main app
      updateUser({ setup_complete: true });
    } catch (e) {
      console.warn('[Onboarding] completeSetup patch failed:', e.message);
    }
  };

  // ── Step 4: add product then complete, or skip
  const handleStep4AddProduct = async () => {
    if (!product.name.trim()) {
      Alert.alert('Required', 'Please enter a product name.');
      return;
    }
    const price = parseFloat(product.price);
    if (!product.price || isNaN(price) || price <= 0) {
      Alert.alert('Required', 'Please enter a valid price.');
      return;
    }
    const stock = parseInt(product.stock, 10);
    if (!product.stock || isNaN(stock) || stock < 0) {
      Alert.alert('Required', 'Please enter a valid stock quantity.');
      return;
    }

    setLoading(true);
    try {
      await client.post('/shop/inventory', {
        product_name: product.name.trim(),
        price_paise: Math.round(price * 100),
        stock_quantity: stock,
        unit: product.unit,
      });
    } catch (e) {
      Alert.alert(
        'Could not add product',
        e.message || 'Something went wrong. You can add products from your dashboard.',
        [
          {
            text: 'Retry',
            onPress: () => {
              setLoading(false);
            },
          },
          {
            text: 'Skip for now',
            onPress: async () => {
              await completeSetup();
              finishOnboarding();
            },
          },
        ]
      );
      setLoading(false);
      return;
    }

    await completeSetup();
    setLoading(false);
    finishOnboarding();
  };

  const handleSkipProduct = async () => {
    setLoading(true);
    await completeSetup();
    setLoading(false);
    finishOnboarding();
  };

  const finishOnboarding = () => {
    setShowSuccess(true);
    // Navigate to main app after short delay
    setTimeout(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    }, 2500);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (showSuccess) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <SuccessScreen />
      </SafeAreaView>
    );
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1VerifyShop shopDetails={shopDetails} setShopDetails={setShopDetails} />;
      case 2:
        return <Step2Hours hours={hours} setHours={setHours} />;
      case 3:
        return <Step3Photos />;
      case 4:
        return <Step4Product product={product} setProduct={setProduct} />;
      default:
        return null;
    }
  };

  const handleContinue = () => {
    if (currentStep === 1) return handleStep1Continue();
    if (currentStep === 2) return handleStep2Continue();
    if (currentStep === 3) return handleStep3Continue();
    if (currentStep === 4) return handleStep4AddProduct();
  };

  const handleBack = () => {
    if (currentStep > 1) goToStep(currentStep - 1, 'back');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.logoRow}>
              <Ionicons name="storefront" size={20} color={Colors.primary} />
              <Text style={styles.logoText}>TezzNirmaan</Text>
            </View>
            <Text style={styles.headerTagline}>Shop Setup</Text>
          </View>
          <ProgressBar currentStep={currentStep} />
        </View>

        {/* ── Content ── */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={[
              styles.flex,
              { transform: [{ translateX: slideAnim }] },
            ]}
          >
            {renderStep()}
          </Animated.View>
        </ScrollView>

        {/* ── Footer Buttons ── */}
        <View style={styles.footer}>
          {currentStep === 4 && (
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkipProduct}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Skip adding product for now"
            >
              <Text style={styles.skipButtonText}>Skip — I'll add products later</Text>
            </TouchableOpacity>
          )}

          <View style={styles.footerButtons}>
            {currentStep > 1 ? (
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="arrow-back" size={18} color={Colors.textSecondary} />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.backButtonPlaceholder} />
            )}

            <TouchableOpacity
              style={[styles.continueButton, loading && styles.continueButtonDisabled]}
              onPress={handleContinue}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={currentStep === 4 ? 'Add product and finish setup' : 'Continue to next step'}
            >
              {loading ? (
                <ActivityIndicator color={Colors.primaryText} size="small" />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>
                    {currentStep === 1
                      ? 'Looks Good, Continue'
                      : currentStep === 4
                      ? 'Add Product & Finish'
                      : 'Save & Continue'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.primaryText} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Header
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[5],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadow.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[4],
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  logoText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.md,
    color: Colors.text,
  },
  headerTagline: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing[3],
    paddingVertical: 4,
    borderRadius: 100,
  },

  // ── Progress bar
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface2,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDotActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  progressDotCompleted: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  progressDotText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  progressLine: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
    borderRadius: 2,
  },
  progressLineCompleted: {
    backgroundColor: Colors.primary,
  },

  // ── Scroll content
  scrollContent: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[6],
  },

  // ── Step header
  stepHeader: {
    paddingTop: Spacing[6],
    paddingBottom: Spacing[4],
  },
  stepIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  stepIndicator: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing[2],
  },
  stepTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['2xl'],
    color: Colors.text,
    marginBottom: Spacing[2],
  },
  stepSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: Typography.size.base * 1.5,
  },

  // ── Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing[6],
    ...Shadow.md,
  },

  // ── Form fields
  fieldLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.sm,
    color: Colors.text,
    marginBottom: Spacing[2],
  },
  input: {
    backgroundColor: Colors.surface2,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: Spacing[3],
  },
  addressBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    marginTop: Spacing[4],
    padding: Spacing[3],
    backgroundColor: Colors.secondaryLight,
    borderRadius: 8,
  },
  addressBadgeText: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: Typography.size.sm * 1.5,
  },

  // ── Hours
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[3],
  },
  dayRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    flex: 1,
  },
  toggle: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: Colors.primary,
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.surface,
    alignSelf: 'flex-start',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  dayLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  timeInput: {
    width: 60,
    backgroundColor: Colors.surface2,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[2],
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    color: Colors.text,
    textAlign: 'center',
  },
  timeSeparator: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
  closedLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    paddingRight: Spacing[2],
  },

  // ── Photos
  photoGrid: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  photoSlot: {
    flex: 1,
    aspectRatio: 0.85,
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[2],
  },
  photoSlotText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  photoNotice: {
    flexDirection: 'row',
    gap: Spacing[2],
    padding: Spacing[3],
    backgroundColor: Colors.infoLight,
    borderRadius: 8,
    alignItems: 'flex-start',
  },
  photoNoticeText: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.info,
    lineHeight: Typography.size.sm * 1.5,
  },
  tipCard: {
    marginTop: Spacing[4],
    padding: Spacing[4],
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    ...Shadow.sm,
  },
  tipTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.sm,
    color: Colors.text,
    marginBottom: Spacing[2],
  },
  tipItem: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: Typography.size.sm * 1.6,
  },

  // ── Product form
  row: {
    flexDirection: 'row',
    marginTop: Spacing[4],
  },
  halfField: {
    flex: 1,
  },
  unitPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  unitChip: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  unitChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  unitChipText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  unitChipTextActive: {
    color: Colors.primary,
  },

  // ── Footer
  footer: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[4],
    ...Shadow.md,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: Spacing[2],
    marginBottom: Spacing[3],
  },
  skipButtonText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  backButtonText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
  backButtonPlaceholder: {
    width: 80,
  },
  continueButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[4],
    borderRadius: 12,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  continueButtonDisabled: {
    opacity: 0.7,
  },
  continueButtonText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.base,
    color: Colors.primaryText,
  },

  // ── Success
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing[8],
    backgroundColor: Colors.background,
  },
  confettiContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing[8],
  },
  confettiCircle: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.lg,
  },
  successTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size['3xl'],
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing[3],
  },
  successSubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: Typography.size.base * 1.6,
    marginBottom: Spacing[6],
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.primaryLight,
    borderRadius: 100,
  },
  successBadgeText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.size.sm,
    color: Colors.primary,
  },
  redirectText: {
    marginTop: Spacing[3],
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
});
