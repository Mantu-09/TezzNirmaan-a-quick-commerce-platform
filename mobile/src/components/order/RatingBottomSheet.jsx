/**
 * RatingBottomSheet — B4
 *
 * Non-blocking rating prompt shown in OrderTrackingScreen after delivery.
 * Features:
 *   - Separate delivery + product star ratings
 *   - Optional text review (max 1000 chars)
 *   - Animated slide-up from bottom
 *   - Dismissible (just closes, doesn't block navigation)
 *   - Shows success confirmation before auto-dismissing
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Animated,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  StyleSheet, Dimensions, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import StarRating from '../common/StarRating';
import { rateOrder } from '../../api/ratings';

const { height: H } = Dimensions.get('window');

export default function RatingBottomSheet({ visible, orderId, onDismiss }) {
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [productRating,  setProductRating]  = useState(0);
  const [reviewText,     setReviewText]     = useState('');
  const [loading,        setLoading]        = useState(false);
  const [submitted,      setSubmitted]      = useState(false);
  const [error,          setError]          = useState('');

  const slideAnim = useRef(new Animated.Value(H)).current;

  useEffect(() => {
    if (visible) {
      setDeliveryRating(0);
      setProductRating(0);
      setReviewText('');
      setSubmitted(false);
      setError('');
      Animated.spring(slideAnim, {
        toValue:        0,
        useNativeDriver: true,
        damping:         20,
        stiffness:       200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue:         H,
        duration:        250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  function dismiss() {
    Animated.timing(slideAnim, {
      toValue:         H,
      duration:        250,
      useNativeDriver: true,
    }).start(() => onDismiss?.());
  }

  async function handleSubmit() {
    if (deliveryRating === 0 && productRating === 0) {
      setError('Please rate at least delivery speed or product quality.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await rateOrder(orderId, {
        deliveryRating: deliveryRating || null,
        productRating:  productRating  || null,
        reviewText:     reviewText.trim() || null,
      });
      setSubmitted(true);
      setTimeout(() => dismiss(), 2000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save rating. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = deliveryRating > 0 || productRating > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      {/* Scrim */}
      <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={dismiss} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kavContainer}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Dismiss button */}
          <TouchableOpacity style={styles.closeBtn} onPress={dismiss}>
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          {submitted ? (
            /* ── Success state ── */
            <View style={styles.successBox}>
              <View style={styles.successCircle}>
                <Ionicons name="checkmark" size={36} color="#fff" />
              </View>
              <Text style={styles.successTitle}>Thank you! 🎉</Text>
              <Text style={styles.successSub}>Your feedback helps us improve.</Text>
            </View>
          ) : (
            /* ── Rating form ── */
            <>
              <Text style={styles.sheetTitle}>Rate Your Order</Text>
              <Text style={styles.sheetSub}>
                How was your experience? Your feedback helps the shop and future customers.
              </Text>

              {/* Delivery Rating */}
              <View style={styles.ratingRow}>
                <View style={styles.ratingMeta}>
                  <Ionicons name="bicycle-outline" size={22} color={Colors.primary} />
                  <Text style={styles.ratingLabel}>Delivery Speed</Text>
                </View>
                <StarRating
                  value={deliveryRating}
                  onChange={setDeliveryRating}
                  size={30}
                  color="#F59E0B"
                />
                {deliveryRating > 0 && (
                  <Text style={styles.ratingHint}>
                    {['', 'Very slow', 'Slow', 'Okay', 'Fast', 'Lightning fast! ⚡'][deliveryRating]}
                  </Text>
                )}
              </View>

              {/* Product Rating */}
              <View style={[styles.ratingRow, { borderBottomWidth: 0 }]}>
                <View style={styles.ratingMeta}>
                  <Ionicons name="cube-outline" size={22} color={Colors.primary} />
                  <Text style={styles.ratingLabel}>Product Quality</Text>
                </View>
                <StarRating
                  value={productRating}
                  onChange={setProductRating}
                  size={30}
                  color="#F59E0B"
                />
                {productRating > 0 && (
                  <Text style={styles.ratingHint}>
                    {['', 'Very poor', 'Below average', 'Good', 'Great', 'Excellent! 👌'][productRating]}
                  </Text>
                )}
              </View>

              {/* Review text */}
              <TextInput
                style={styles.reviewInput}
                placeholder="Write a review (optional)…"
                placeholderTextColor={Colors.textTertiary}
                multiline
                numberOfLines={3}
                maxLength={1000}
                value={reviewText}
                onChangeText={setReviewText}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{reviewText.length}/1000</Text>

              {/* Error */}
              {!!error && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={15} color={Colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.skipBtn} onPress={dismiss}>
                  <Text style={styles.skipText}>Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit || loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.submitText}>Submit Rating</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  kavContainer: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor:  Colors.surface,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    padding:          Spacing[5],
    paddingTop:       Spacing[4],
    paddingBottom:    Spacing[8],
    ...Shadow.md,
  },
  handle: {
    alignSelf:       'center',
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: Colors.border,
    marginBottom:    Spacing[4],
  },
  closeBtn: {
    position:  'absolute',
    top:       Spacing[4],
    right:     Spacing[5],
    padding:   Spacing[1],
  },
  sheetTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.xl,
    color:      Colors.text,
    marginBottom: Spacing[1],
  },
  sheetSub: {
    fontFamily:   Typography.fontFamily.regular,
    fontSize:     Typography.size.sm,
    color:        Colors.textSecondary,
    marginBottom: Spacing[5],
    lineHeight:   20,
  },
  ratingRow: {
    alignItems:    'center',
    paddingBottom: Spacing[4],
    marginBottom:  Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap:           Spacing[2],
  },
  ratingMeta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[2],
  },
  ratingLabel: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.md,
    color:      Colors.text,
  },
  ratingHint: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
    marginTop:  Spacing[1],
  },
  reviewInput: {
    borderWidth:   1,
    borderColor:   Colors.border,
    borderRadius:  BorderRadius.md,
    padding:       Spacing[3],
    fontFamily:    Typography.fontFamily.regular,
    fontSize:      Typography.size.sm,
    color:         Colors.text,
    height:        88,
    marginTop:     Spacing[2],
    backgroundColor: Colors.background,
  },
  charCount: {
    textAlign:    'right',
    fontSize:     Typography.size.xs,
    color:        Colors.textTertiary,
    fontFamily:   Typography.fontFamily.regular,
    marginTop:    4,
    marginBottom: Spacing[3],
  },
  errorBox: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing[1],
    marginBottom:  Spacing[3],
  },
  errorText: {
    flex:       1,
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.error,
  },
  actions: {
    flexDirection: 'row',
    gap:           Spacing[3],
    marginTop:     Spacing[2],
  },
  skipBtn: {
    flex:             1,
    paddingVertical:  Spacing[3],
    alignItems:       'center',
    borderWidth:      1,
    borderColor:      Colors.border,
    borderRadius:     BorderRadius.md,
  },
  skipText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.md,
    color:      Colors.textSecondary,
  },
  submitBtn: {
    flex:             2,
    paddingVertical:  Spacing[3],
    alignItems:       'center',
    borderRadius:     BorderRadius.md,
    backgroundColor:  Colors.primary,
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitText: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.md,
    color:      '#fff',
  },
  // Success
  successBox: {
    alignItems:    'center',
    paddingVertical: Spacing[8],
    gap:           Spacing[3],
  },
  successCircle: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: '#16A34A',
    alignItems:      'center',
    justifyContent:  'center',
  },
  successTitle: {
    fontFamily: Typography.fontFamily.bold,
    fontSize:   Typography.size.xl,
    color:      Colors.text,
  },
  successSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.md,
    color:      Colors.textSecondary,
  },
});
