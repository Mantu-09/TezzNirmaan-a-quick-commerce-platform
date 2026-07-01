import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from './Button';
import { Colors, Typography, Spacing } from '../../theme';

/**
 * Deliberately designed empty states — never show a blank screen.
 * Each variant has a specific icon, headline, and sub-text.
 */
export default function EmptyState({
  variant  = 'generic',
  title,
  subtitle,
  actionLabel,
  onAction,
}) {
  const config = CONFIGS[variant] || CONFIGS.generic;

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={config.icon} size={64} color={Colors.textTertiary} />
      </View>
      <Text style={styles.title}>{title || config.title}</Text>
      <Text style={styles.subtitle}>{subtitle || config.subtitle}</Text>
      {(actionLabel || config.actionLabel) && (
        <Button
          variant="outline"
          size="md"
          onPress={onAction}
          style={styles.action}
        >
          {actionLabel || config.actionLabel}
        </Button>
      )}
    </View>
  );
}

const CONFIGS = {
  cart: {
    icon:        'cart-outline',
    title:       'Your cart is empty',
    subtitle:    'Add materials from a shop to get started.',
    actionLabel: 'Browse Products',
  },
  orders: {
    icon:        'receipt-outline',
    title:       'No orders yet',
    subtitle:    "Once you place your first order, it'll show up here.",
    actionLabel: 'Start Shopping',
  },
  search: {
    icon:        'search-outline',
    title:       'No results found',
    subtitle:    'Try different keywords or browse categories.',
    actionLabel: null,
  },
  products: {
    icon:        'cube-outline',
    title:       'No products here',
    subtitle:    'This category is currently empty. Check back soon.',
    actionLabel: null,
  },
  addresses: {
    icon:        'location-outline',
    title:       'No saved addresses',
    subtitle:    'Add a delivery address to continue.',
    actionLabel: 'Add Address',
  },
  offline: {
    icon:        'cloud-offline-outline',
    title:       'You\'re offline',
    subtitle:    'Check your connection and try again.',
    actionLabel: 'Retry',
  },
  error: {
    icon:        'alert-circle-outline',
    title:       'Something went wrong',
    subtitle:    'We\'re looking into it. Please try again.',
    actionLabel: 'Retry',
  },
  generic: {
    icon:        'help-circle-outline',
    title:       'Nothing here yet',
    subtitle:    '',
    actionLabel: null,
  },
};

const styles = StyleSheet.create({
  container: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: Spacing[8],
    paddingVertical:   Spacing[10],
  },
  iconWrap: {
    width:           96,
    height:          96,
    borderRadius:    48,
    backgroundColor: Colors.surface2,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    Spacing[5],
  },
  title: {
    fontFamily:  Typography.fontFamily.semiBold,
    fontSize:    Typography.size.lg,
    color:       Colors.text,
    textAlign:   'center',
    marginBottom: Spacing[2],
  },
  subtitle: {
    fontFamily:  Typography.fontFamily.regular,
    fontSize:    Typography.size.base,
    color:       Colors.textSecondary,
    textAlign:   'center',
    lineHeight:  Typography.size.base * 1.5,
  },
  action: { marginTop: Spacing[6] },
});
