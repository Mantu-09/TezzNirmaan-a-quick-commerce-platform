/**
 * ProductCard.jsx
 * Supports two display variants:
 *   "grid"       (default) — 2-column grid layout, 48% wide. Used in CategoryScreen, HomeScreen grid.
 *   "horizontal" — Compact 150px wide portrait card. Used in horizontal category rows on HomeScreen.
 *
 * Both variants share the same ADD / qty stepper logic via cartStore.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TierBadge from './TierBadge';
import ProductImage from './ProductImage';
import { formatPaise, discountPercent } from '../../utils/money';
import { Colors, Typography, BorderRadius, Spacing, Shadow } from '../../theme';
import useCartStore from '../../store/cartStore';

export default function ProductCard({ item, shopId, onPress, variant = 'grid' }) {
  const { items, addItem, updateQuantity } = useCartStore();
  const product   = item.products;
  const inventory = item;

  const cartItem = items.find(i => i.productId === product.id);
  const quantity = cartItem?.quantity || 0;
  const discount = discountPercent(inventory.price, inventory.mrp);

  const handleAdd = () => addItem({
    productId:      product.id,
    inventoryId:    inventory.id,
    shopId,
    name:           product.name,
    imageUrl:       product.images?.[0] || null,
    unit:           product.unit,
    deliveryTier:   product.delivery_tier,
    unitPricePaise: inventory.price,
    quantity:       1,
  });

  const isHorizontal = variant === 'horizontal';

  return (
    <TouchableOpacity
      style={isHorizontal ? styles.cardH : styles.card}
      onPress={onPress}
      activeOpacity={0.92}
    >
      {/* Product image */}
      <View style={isHorizontal ? styles.imageWrapH : styles.imageWrap}>
        <ProductImage
          uri={product.images?.[0]}
          style={isHorizontal ? styles.imageH : styles.image}
          contentFit="cover"
          transition={200}
        />
        {/* Tier badge */}
        <View style={styles.badgePosition}>
          <TierBadge tier={product.delivery_tier} compact />
        </View>
        {/* Out of stock overlay */}
        {!inventory.is_in_stock && (
          <View style={styles.outOfStock}>
            <Text style={styles.outOfStockText}>Out of{'\n'}Stock</Text>
          </View>
        )}
        {/* Discount pill */}
        {discount && (
          <View style={styles.discountPill}>
            <Text style={styles.discountText}>{discount}</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={isHorizontal ? styles.infoH : styles.info}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.unit}>{product.unit}</Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPaise(inventory.price)}</Text>
          {inventory.mrp > inventory.price && (
            <Text style={styles.mrp}>{formatPaise(inventory.mrp)}</Text>
          )}
        </View>

        {/* ADD / Quantity control */}
        {inventory.is_in_stock ? (
          quantity === 0 ? (
            <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
              <Text style={styles.addBtnText}>ADD</Text>
              <Ionicons name="add" size={14} color={Colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.qtyControl}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQuantity(product.id, quantity - 1)}
              >
                <Ionicons name="remove" size={14} color={Colors.primary} />
              </TouchableOpacity>
              <Text style={styles.qty}>{quantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQuantity(product.id, quantity + 1)}
              >
                <Ionicons name="add" size={14} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          )
        ) : (
          <View style={styles.addBtn}>
            <Text style={[styles.addBtnText, { color: Colors.textTertiary }]}>Unavailable</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // ── Grid variant (48% width, 2-column) ──────────────────────
  card: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginBottom: Spacing[3],
    ...Shadow.md,
  },
  imageWrap: { position: 'relative', height: 130, backgroundColor: Colors.surface2 },
  image:     { width: '100%', height: '100%' },

  // ── Horizontal variant (150px wide, portrait) ────────────────
  cardH: {
    width: 150,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadow.md,
  },
  imageWrapH: { position: 'relative', height: 120, backgroundColor: Colors.surface2 },
  imageH:     { width: '100%', height: '100%' },

  // ── Shared ───────────────────────────────────────────────────
  badgePosition: { position: 'absolute', top: 6, left: 6 },
  outOfStock: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  outOfStockText: { color: '#fff', fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, textAlign: 'center' },
  discountPill: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  discountText: { color: '#fff', fontFamily: Typography.fontFamily.bold, fontSize: 9 },

  info:  { padding: Spacing[3] },
  infoH: { padding: Spacing[2] },     // slightly tighter for horizontal cards

  name: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text, marginBottom: 2 },
  unit: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: Spacing[1] },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: Spacing[2] },
  price:    { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.text },
  mrp:      { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, textDecorationLine: 'line-through' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: 6, gap: 2,
  },
  addBtnText: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.primary },

  qtyControl: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: 4, paddingHorizontal: 8,
  },
  qtyBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  qty:    { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.text, minWidth: 24, textAlign: 'center' },
});
