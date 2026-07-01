import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, BorderRadius, Spacing } from '../../theme';

/**
 * variants: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
 * sizes:    'sm' | 'md' | 'lg'
 */
export default function Button({
  children,
  onPress,
  variant  = 'primary',
  size     = 'md',
  disabled = false,
  loading  = false,
  fullWidth = false,
  icon,
  style,
  textStyle,
}) {
  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  const containerStyle = [
    styles.base,
    styles[variant],
    styles[`size_${size}`],
    fullWidth && styles.fullWidth,
    (disabled || loading) && styles.disabled,
    style,
  ];

  const labelStyle = [
    styles.label,
    styles[`label_${variant}`],
    styles[`labelSize_${size}`],
    textStyle,
  ];

  return (
    <TouchableOpacity style={containerStyle} onPress={handlePress} activeOpacity={0.8} disabled={disabled || loading}>
      {loading ? (
        <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? Colors.primary : Colors.primaryText} size="small" />
      ) : (
        <View style={styles.row}>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          <Text style={labelStyle}>{children}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius:   BorderRadius.lg,
    alignItems:     'center',
    justifyContent: 'center',
    flexDirection:  'row',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { marginRight: Spacing[2] },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },

  // Variants
  primary:   { backgroundColor: Colors.primary },
  secondary: { backgroundColor: Colors.secondary },
  outline:   { backgroundColor: Colors.transparent, borderWidth: 1.5, borderColor: Colors.primary },
  ghost:     { backgroundColor: Colors.transparent },
  danger:    { backgroundColor: Colors.error },

  // Labels
  label:          { fontFamily: Typography.fontFamily.semiBold, letterSpacing: 0.2 },
  label_primary:  { color: Colors.primaryText },
  label_secondary:{ color: Colors.secondaryText },
  label_outline:  { color: Colors.primary },
  label_ghost:    { color: Colors.primary },
  label_danger:   { color: '#fff' },

  // Sizes
  size_sm:      { paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],   minHeight: 36 },
  size_md:      { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3],   minHeight: 48 },
  size_lg:      { paddingHorizontal: Spacing[6], paddingVertical: Spacing[4],   minHeight: 56 },
  labelSize_sm: { fontSize: Typography.size.sm },
  labelSize_md: { fontSize: Typography.size.base },
  labelSize_lg: { fontSize: Typography.size.md },
});
