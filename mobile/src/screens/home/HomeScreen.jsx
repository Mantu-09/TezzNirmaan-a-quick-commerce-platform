import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView }    from 'react-native-safe-area-context';
import { useQuery }        from '@tanstack/react-query';
import { Ionicons }        from '@expo/vector-icons';
import { Image }           from 'expo-image';
import { getNearbyShops, getCategories, getProducts, getRecommendations } from '../../api/products'; // P5-2
import ProductCard         from '../../components/product/ProductCard';
import { ProductCardSkeleton, CategoryGridSkeleton } from '../../components/common/SkeletonLoader';
import EmptyState          from '../../components/common/EmptyState';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useCartStore        from '../../store/cartStore';
import useCityStore        from '../../store/cityStore'; // P4-4A
import useAuthStore        from '../../store/authStore'; // P5-2

// Default Patna coordinates — used only if cityStore hasn't loaded yet (first render)
// P4-4A: actual coords come from useCityStore() so multi-city works automatically
const FALLBACK_LAT = 25.5941;
const FALLBACK_LNG = 85.1376;

// ── RecommendationsSection (P5-2) ────────────────────────────
// Horizontally scrollable list of AI-recommended products.
// Design: 180px wide cards with a left-border accent in --tn-orange.
// The section is invisible (null) when:
//   a) user is not logged in
//   b) ANTHROPIC_API_KEY not set on backend (returns empty [])
//   c) user has no order history yet
function RecommendedCard({ item, onPress }) {
  const priceRs = Math.round((item.price || 0) / 100);
  return (
    <TouchableOpacity style={styles.recCard} onPress={onPress} activeOpacity={0.88}>
      {/* Left accent border */}
      <View style={styles.recAccent} />
      {/* Product image */}
      <View style={styles.recImg}>
        {item.thumbnail
          ? <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <Text style={{ fontSize: 28 }}>🏗️</Text>}
      </View>
      {/* Info */}
      <View style={styles.recInfo}>
        <Text style={styles.recName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.recPrice}>₹{priceRs.toLocaleString('en-IN')}</Text>
        {item.deliveryTier === 'quick' && (
          <View style={styles.recTierBadge}>
            <Text style={styles.recTierText}>⚡ Quick</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function RecommendationsSection({ shopId, cartItems, navigation, shopObj }) {
  const isLoggedIn = useAuthStore(s => s.isAuthenticated);
  const { data, isLoading } = useQuery({
    queryKey:  ['ai-recommendations', shopId, cartItems?.map(i => i.inventoryId).join(',')],
    queryFn:   () => getRecommendations(shopId, cartItems || []),
    staleTime: 5 * 60 * 1000,  // 5 min — matches server-side cache TTL
    enabled:   !!shopId && isLoggedIn,
  });

  const recommendations = data?.recommendations || [];

  if (!isLoggedIn) return null;
  if (isLoading) {
    // Skeleton: 3 shimmer cards
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>✨ Recommended for you</Text>
        <Text style={styles.sectionSub}>Based on your orders</Text>
        <FlatList
          horizontal
          data={[1, 2, 3]}
          keyExtractor={i => String(i)}
          renderItem={() => <View style={[styles.recCard, styles.recCardSkeleton]} />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing[4], gap: Spacing[3] }}
        />
      </View>
    );
  }
  if (!recommendations.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>✨ Recommended for you</Text>
          <Text style={styles.sectionSub}>Based on your orders</Text>
        </View>
      </View>
      <FlatList
        horizontal
        data={recommendations}
        keyExtractor={item => item.inventoryId || item.productId}
        renderItem={({ item }) => (
          <RecommendedCard
            item={item}
            onPress={() => shopObj && navigation.navigate('ProductDetail', {
              shopId:    shopObj.id,
              productId: item.productId,
            })}
          />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing[4], gap: Spacing[3] }}
      />
    </View>
  );
}

const CATEGORIES = [
  { id: 'cement',    name: 'Cement & Blocks', emoji: '🧱', color: '#F3F0EA' },
  { id: 'paints',   name: 'Paints',          emoji: '🎨', color: '#FFF0F0' },
  { id: 'tiles',    name: 'Tiles & Flooring', emoji: '⬛', color: '#F0F4FF' },
  { id: 'electrical', name: 'Electrical',    emoji: '💡', color: '#FFFBF0' },
  { id: 'plumbing', name: 'Plumbing',        emoji: '🔧', color: '#F0FFF8' },
  { id: 'hardware', name: 'Hardware',        emoji: '🔩', color: '#FFF5F0' },
  { id: 'decor',    name: 'Decor & Fittings', emoji: '🪞', color: '#F8F0FF' },
  { id: 'safety',   name: 'Safety & PPE',    emoji: '🦺', color: '#F0FAFF' },
];

export default function HomeScreen({ navigation }) {
  const itemCount    = useCartStore(s => s.itemCount);
  const cartItems    = useCartStore(s => s.items || []); // P5-2 — for rec cache key
  const { selectedCity } = useCityStore(); // P4-4A

  // Use city store coordinates; fall back to Patna if store not hydrated yet
  const lat = selectedCity?.center_lat ?? FALLBACK_LAT;
  const lng = selectedCity?.center_lng ?? FALLBACK_LNG;
  const cityName = selectedCity?.name ?? 'Patna';

  // Fetch nearby shops
  const { data: shopsData, isLoading: shopsLoading, refetch: refetchShops } = useQuery({
    queryKey:  ['nearby-shops', selectedCity?.id ?? 'patna', lat, lng],
    queryFn:   () => getNearbyShops(lat, lng),
    staleTime: 5 * 60 * 1000,
  });
  const shop = shopsData?.shops?.[0];

  // Fetch featured quick products (first 8 quick-tier products)
  const { data: quickData, isLoading: quickLoading } = useQuery({
    queryKey:  ['featured-quick', shop?.id],
    queryFn:   () => getProducts(shop.id, { tier: 'quick', limit: 8 }),
    enabled:   !!shop?.id,
    staleTime: 2 * 60 * 1000,
  });

  const handleCategoryPress = (cat) => {
    if (!shop?.id) return;
    navigation.navigate('Category', {
      shopId:       shop.id,
      categoryId:   cat.id,
      categoryName: cat.name,
    });
  };

  const handleProductPress = (item) => {
    navigation.navigate('ProductDetail', {
      shopId:    shop.id,
      productId: item.products.id,
    });
  };

  const renderQuickItem = useCallback(({ item }) => (
    <ProductCard
      item={item}
      shopId={shop?.id}
      onPress={() => handleProductPress(item)}
    />
  ), [shop?.id]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.appName}>TezzNirmaan</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location" size={12} color={Colors.primary} />
            <Text style={styles.location} numberOfLines={1}>
              {shop ? `${shop.name}` : `${cityName}, Bihar`}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.cartBtn}
          onPress={() => navigation.navigate('Cart')}
        >
          <Ionicons name="cart-outline" size={24} color={Colors.text} />
          {itemCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{itemCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={shopsLoading} onRefresh={refetchShops} tintColor={Colors.primary} />}
      >
        {/* Search bar — taps open B3 SearchScreen */}
        <TouchableOpacity
          style={styles.searchBar}
          onPress={() => navigation.navigate('SearchTab', { screen: 'SearchMain' })}
          activeOpacity={0.8}
        >
          <Ionicons name="search" size={18} color={Colors.textTertiary} />
          <Text style={styles.searchPlaceholder}>Search cement, paint, tiles…</Text>
        </TouchableOpacity>

        {/* Delivery promise banner */}
        <View style={styles.promiseBanner}>
          <View style={styles.promiseItem}>
            <Text style={styles.promiseEmoji}>⚡</Text>
            <Text style={styles.promiseText}>Quick items in 60–90 min</Text>
          </View>
          <View style={styles.promiseDivider} />
          <View style={styles.promiseItem}>
            <Text style={styles.promiseEmoji}>📅</Text>
            <Text style={styles.promiseText}>Bulk orders, next-day slot</Text>
          </View>
        </View>

        {/* P5-2: AI Recommendations — sits between promise banner and categories */}
        <RecommendationsSection
          shopId={shop?.id}
          cartItems={cartItems}
          navigation={navigation}
          shopObj={shop}
        />

        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shop by Category</Text>
          {shopsLoading ? (
            <CategoryGridSkeleton count={8} />
          ) : (
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.categoryCard}
                  onPress={() => handleCategoryPress(cat)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.categoryIcon, { backgroundColor: cat.color }]}>
                    <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                  </View>
                  <Text style={styles.categoryName} numberOfLines={2}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Quick delivery featured products */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>⚡ Quick Delivery</Text>
            <TouchableOpacity onPress={() => shop && navigation.navigate('Category', { shopId: shop.id, tier: 'quick', categoryName: 'Quick Delivery' })}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {quickLoading ? (
            <View style={styles.productGrid}>
              {[1, 2, 3, 4].map(i => <ProductCardSkeleton key={i} />)}
            </View>
          ) : quickData?.products?.length > 0 ? (
            <View style={styles.productGrid}>
              {(quickData.products || []).map((item) => (
                <ProductCard
                  key={item.products?.id}
                  item={item}
                  shopId={shop?.id}
                  onPress={() => handleProductPress(item)}
                />
              ))}
            </View>
          ) : (
            <EmptyState variant="products" subtitle="Quick items will appear here once the shop is set up." />
          )}
        </View>

        {/* Bottom padding */}
        <View style={{ height: Spacing[8] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft:   { flex: 1 },
  appName:      { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.primary },
  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  location:     { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, flex: 1 },
  cartBtn:      { position: 'relative', padding: Spacing[2] },
  cartBadge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: Colors.primary, borderRadius: 10,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
  cartBadgeText: { color: '#fff', fontFamily: Typography.fontFamily.bold, fontSize: 10 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.xl, marginHorizontal: Spacing[4], marginVertical: Spacing[3],
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    ...Shadow.sm,
  },
  searchPlaceholder: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textTertiary, flex: 1 },

  promiseBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, marginHorizontal: Spacing[4], marginBottom: Spacing[4],
    borderRadius: BorderRadius.xl, padding: Spacing[4], borderWidth: 1, borderColor: Colors.border,
  },
  promiseItem:    { flex: 1, alignItems: 'center', gap: 4 },
  promiseEmoji:   { fontSize: 20 },
  promiseText:    { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, color: Colors.text, textAlign: 'center' },
  promiseDivider: { width: 1, height: 30, backgroundColor: Colors.border },

  section:       { marginBottom: Spacing[6] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing[4], marginBottom: Spacing[3] },
  sectionTitle:  { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  seeAll:        { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.primary },
  sectionSub:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, paddingHorizontal: Spacing[4], marginTop: -Spacing[1], marginBottom: Spacing[3] },

  categoryGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: Spacing[4], gap: Spacing[3],
  },
  categoryCard: { width: '22%', alignItems: 'center', gap: Spacing[2] },
  categoryIcon: { width: 56, height: 56, borderRadius: BorderRadius['2xl'], alignItems: 'center', justifyContent: 'center' },
  categoryEmoji: { fontSize: 26 },
  categoryName:  { fontFamily: Typography.fontFamily.medium, fontSize: 10, color: Colors.text, textAlign: 'center' },

  productGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    paddingHorizontal: Spacing[4], gap: Spacing[3],
  },

  // ── P5-2: Recommendation cards ──────────────────────────────
  recCard: {
    width: 180, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl, overflow: 'hidden',
    flexDirection: 'row', ...Shadow.sm,
  },
  recCardSkeleton: { backgroundColor: Colors.border, opacity: 0.5 },
  recAccent: {
    width: 4, backgroundColor: Colors.primary, // orange left border = AI curation signal
  },
  recImg: {
    width: 72, height: 80,
    backgroundColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  recInfo: {
    flex: 1, padding: Spacing[2], gap: 4, justifyContent: 'center',
  },
  recName: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.size.xs, color: Colors.text, lineHeight: 16,
  },
  recPrice: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.size.sm, color: Colors.primary,
  },
  recTierBadge: {
    backgroundColor: Colors.primary + '15',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start',
  },
  recTierText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 9, color: Colors.primary,
  },
});

