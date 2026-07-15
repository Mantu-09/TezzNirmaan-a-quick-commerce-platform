import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getProduct } from '../../api/products';
import { getShopRatingSummary } from '../../api/ratings';         // B4
import TierBadge from '../../components/product/TierBadge';
import Button from '../../components/common/Button';
import { RatingBadge } from '../../components/common/StarRating'; // B4
import { formatPaise, discountPercent, savingsAmount } from '../../utils/money';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useCartStore from '../../store/cartStore';

const { width: SCREEN_W } = Dimensions.get('window');

export default function ProductDetailScreen({ route, navigation }) {
  const { shopId, productId } = route.params;
  const [imageIdx, setImageIdx]   = useState(0);
  const [quantity, setQuantity]   = useState(1);

  const { items, addItem, updateQuantity: updateQty } = useCartStore();
  const cartItem = items.find(i => i.productId === productId);

  const { data, isLoading } = useQuery({
    queryKey: ['product', shopId, productId],
    queryFn:  () => getProduct(shopId, productId),
    staleTime: 5 * 60 * 1000,
  });

  // B4: shop rating summary (non-blocking, silent fail)
  const { data: ratingData } = useQuery({
    queryKey: ['shopRatingSummary', shopId],
    queryFn:  () => getShopRatingSummary(shopId),
    staleTime: 10 * 60 * 1000,
  });
  const shopRating = ratingData?.summary;

  if (isLoading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const product   = data?.product?.products;
  const inventory = data?.product;
  if (!product) return null;

  const images     = product.images?.length > 0 ? product.images : [null];
  const discount   = discountPercent(inventory.price, inventory.mrp);
  const savings    = savingsAmount(inventory.price, inventory.mrp);
  const inStock    = inventory.is_in_stock;

  const handleAddToCart = () => {
    if (!inStock) return;
    if (cartItem) {
      updateQty(productId, cartItem.quantity + quantity);
    } else {
      addItem({
        productId:      product.id,
        inventoryId:    inventory.id,
        shopId,
        name:           product.name,
        imageUrl:       images[0],
        unit:           product.unit,
        deliveryTier:   product.delivery_tier,
        unitPricePaise: inventory.price,
        quantity,
      });
    }
    navigation.navigate('Cart');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image carousel */}
        <View style={styles.imageCarousel}>
          <ScrollView
            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              setImageIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W));
            }}
          >
            {images.map((img, i) => (
              <Image
                key={i}
                source={img || require('../../../assets/placeholder.png')}
                style={[styles.carouselImage, { width: SCREEN_W }]}
                contentFit="contain"
                transition={150}
              />
            ))}
          </ScrollView>
          {images.length > 1 && (
            <View style={styles.dots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === imageIdx && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>

        {/* Details */}
        <View style={styles.content}>
          {/* Tier badge */}
          <TierBadge tier={product.delivery_tier} />

          <Text style={styles.name}>{product.name}</Text>
          {product.brands?.name && (
            <Text style={styles.brand}>{product.brands.name}</Text>
          )}
          {/* B4: Shop rating badge */}
          {shopRating?.total_ratings > 0 && (
            <RatingBadge
              rating={shopRating.avg_overall_rating}
              count={shopRating.total_ratings}
              style={{ marginBottom: Spacing[2] }}
            />
          )}
          <Text style={styles.unit}>Unit: {product.unit}</Text>

          {/* Price */}
          <View style={styles.priceSection}>
            <Text style={styles.price}>{formatPaise(inventory.price)}</Text>
            {inventory.mrp > inventory.price && (
              <Text style={styles.mrp}>{formatPaise(inventory.mrp)}</Text>
            )}
            {discount && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>{discount}</Text>
              </View>
            )}
          </View>
          {savings && <Text style={styles.savings}>{savings}</Text>}

          <Text style={styles.gstNote}>
            Price inclusive of {product.gst_percent}% GST
          </Text>

          {/* Stock status */}
          <View style={[styles.stockBadge, { backgroundColor: inStock ? Colors.successLight : Colors.errorLight }]}>
            <Ionicons
              name={inStock ? 'checkmark-circle' : 'close-circle'}
              size={14}
              color={inStock ? Colors.success : Colors.error}
            />
            <Text style={[styles.stockText, { color: inStock ? Colors.success : Colors.error }]}>
              {inStock ? 'In Stock' : 'Out of Stock'}
            </Text>
          </View>

          {/* Quantity selector */}
          {inStock && (
            <View style={styles.qtySection}>
              <Text style={styles.qtyLabel}>Quantity</Text>
              <View style={styles.qtyControl}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Ionicons name="remove" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={styles.qty}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQuantity(quantity + 1)}
                >
                  <Ionicons name="add" size={18} color={Colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.lineTotal}>= {formatPaise(inventory.price * quantity)}</Text>
            </View>
          )}

          {/* Description */}
          {product.description && (
            <View style={styles.descSection}>
              <Text style={styles.descTitle}>About this product</Text>
              <Text style={styles.desc}>{product.description}</Text>
            </View>
          )}

          {/* Weight / bulk */}
          {(product.weight_kg || product.is_bulk) && (
            <View style={styles.specBox}>
              {product.weight_kg && <Text style={styles.spec}>Weight: {product.weight_kg} kg</Text>}
              {product.is_bulk && <Text style={styles.spec}>🚚 Heavy/bulk item — Scheduled delivery</Text>}
              {product.hsn_code && <Text style={styles.spec}>HSN: {product.hsn_code}</Text>}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky add to cart button */}
      <View style={styles.stickyBar}>
        <View style={styles.stickyPrice}>
          <Text style={styles.stickyTotal}>{formatPaise(inventory.price * quantity)}</Text>
          <Text style={styles.stickyUnit}>for {quantity} {product.unit}</Text>
        </View>
        <Button
          variant={inStock ? 'primary' : 'ghost'}
          size="md"
          onPress={handleAddToCart}
          disabled={!inStock}
          style={{ flex: 1, marginLeft: Spacing[4] }}
        >
          {!inStock ? 'Out of Stock' : cartItem ? 'Update Cart' : 'Add to Cart'}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: Colors.background },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  imageCarousel:  { backgroundColor: Colors.surface, height: 280, position: 'relative' },
  carouselImage:  { height: 280 },
  dots: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotActive: { width: 18, backgroundColor: Colors.primary },

  content:  { padding: Spacing[4], gap: Spacing[3] },
  name:     { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['2xl'], color: Colors.text, marginTop: Spacing[2] },
  brand:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  unit:     { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textTertiary },

  priceSection:  { flexDirection: 'row', alignItems: 'baseline', gap: Spacing[3], flexWrap: 'wrap' },
  price:         { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.text },
  mrp:           { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.md, color: Colors.textTertiary, textDecorationLine: 'line-through' },
  discountBadge: { backgroundColor: Colors.success, borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  discountText:  { color: '#fff', fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm },
  savings:       { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.success },
  gstNote:       { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary },

  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: BorderRadius.full },
  stockText:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm },

  qtySection: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4] },
  qtyLabel:   { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base, color: Colors.text },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4], borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] },
  qtyBtn:     { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  qty:        { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text, minWidth: 28, textAlign: 'center' },
  lineTotal:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: Colors.primary },

  descSection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing[4] },
  descTitle:   { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: Colors.text, marginBottom: Spacing[2] },
  desc:        { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textSecondary, lineHeight: 22 },

  specBox: { backgroundColor: Colors.surface2, borderRadius: BorderRadius.lg, padding: Spacing[4], gap: Spacing[2] },
  spec:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },

  stickyBar: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing[4],
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border,
    ...Shadow.lg,
  },
  stickyPrice: { gap: 2 },
  stickyTotal: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text },
  stickyUnit:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary },
});
