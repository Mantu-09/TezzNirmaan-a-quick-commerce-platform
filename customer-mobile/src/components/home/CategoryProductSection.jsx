/**
 * CategoryProductSection.jsx
 * A self-contained Blinkit-style horizontal product row for a given category.
 *
 * Props:
 *   category   { id, name, emoji, color }
 *   shopId     string
 *   navigation React Navigation navigation object
 *
 * Fetches up to 8 products in the given category, renders them in a
 * horizontal FlatList with inline ADD / qty stepper. Hidden if no products.
 */

import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
} from 'react-native';
import { useQuery }    from '@tanstack/react-query';
import { Ionicons }    from '@expo/vector-icons';
import { getProducts } from '../../api/products';
import ProductCard     from '../product/ProductCard';
import { ProductCardSkeleton } from '../common/SkeletonLoader';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme';

export default function CategoryProductSection({ category, shopId, navigation }) {
  const { data, isLoading } = useQuery({
    queryKey:  ['home-cat-products', shopId, category.id],
    queryFn:   () => getProducts(shopId, { category: category.id, limit: 8 }),
    enabled:   !!shopId,
    staleTime: 5 * 60 * 1000,
  });

  const products = data?.products || [];

  // Hide section if loading finished but no products
  if (!isLoading && products.length === 0) return null;

  const handleSeeAll = () => {
    navigation.navigate('Category', {
      shopId,
      categoryId:   category.id,
      categoryName: category.name,
    });
  };

  const handleProductPress = (item) => {
    navigation.navigate('ProductDetail', {
      shopId,
      productId: item.products?.id || item.id,
    });
  };

  return (
    <View style={styles.section}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <View style={styles.headerLeft}>
          <View style={[styles.emojiDot, { backgroundColor: category.color }]}>
            <Text style={styles.emoji}>{category.emoji}</Text>
          </View>
          <Text style={styles.sectionTitle}>{category.name}</Text>
        </View>
        <TouchableOpacity style={styles.seeAllBtn} onPress={handleSeeAll}>
          <Text style={styles.seeAllText}>see all</Text>
          <Ionicons name="chevron-forward" size={13} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Horizontal product list */}
      {isLoading ? (
        <FlatList
          horizontal
          data={[1, 2, 3, 4]}
          keyExtractor={(i) => String(i)}
          renderItem={() => <ProductCardSkeleton style={styles.skeletonCard} />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listPadding}
        />
      ) : (
        <FlatList
          horizontal
          data={products}
          keyExtractor={(item) => item.products?.id || item.id || Math.random().toString()}
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              shopId={shopId}
              onPress={() => handleProductPress(item)}
              variant="horizontal"
            />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listPadding}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing[5] },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[3],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  emojiDot: {
    width: 32, height: 32,
    borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji:        { fontSize: 16 },
  sectionTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },

  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.primary },

  listPadding: { paddingHorizontal: Spacing[4], gap: Spacing[3], paddingRight: Spacing[4] },
  skeletonCard: { width: 150, marginRight: 0 },
});
