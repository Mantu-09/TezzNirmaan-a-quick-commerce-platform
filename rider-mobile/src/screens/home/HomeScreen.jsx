/**
 * HomeScreen.jsx — Blinkit-Style Quick Commerce Home
 * ─────────────────────────────────────────────────────
 * Layout (top → bottom):
 *   1. Header         — logo + GPS locality + cart badge
 *   2. Search bar     — tappable, opens SearchScreen
 *   3. Delivery banner— ⚡ Quick 60-90 min | 📅 Bulk next-day
 *   4. Hero carousel  — dynamic, admin-controlled promotional banners
 *   5. Flash Deals    — live countdown deal cards (hidden if no active deals)
 *   6. Category grid  — 4-col icon grid (8 construction categories)
 *   7. Category rows  — horizontal product lists per category ("see all")
 *   8. AI Recommendations (authenticated users only, moved to bottom)
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, RefreshControl, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView }    from 'react-native-safe-area-context';
import { useQuery }        from '@tanstack/react-query';
import { Ionicons }        from '@expo/vector-icons';
import { Image }           from 'expo-image';
import { getNearbyShops, getRecommendations, fetchBanners, fetchFlashSales } from '../../api/products';
import CategoryProductSection from '../../components/home/CategoryProductSection';
import { ProductCardSkeleton, CategoryGridSkeleton } from '../../components/common/SkeletonLoader';
import EmptyState          from '../../components/common/EmptyState';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import useCartStore        from '../../store/cartStore';
import useCityStore        from '../../store/cityStore';
import useAuthStore        from '../../store/authStore';
import useLocation         from '../../hooks/useLocation';

const { width: SCREEN_W } = Dimensions.get('window');
const FALLBACK_LAT = 25.5941;
const FALLBACK_LNG = 85.1376;

// ── Construction categories (Blinkit-style) ──────────────────
const CATEGORIES = [
  { id: 'cement',     name: 'Cement & Blocks', emoji: '🧱', color: '#F3F0EA' },
  { id: 'paints',    name: 'Paints',           emoji: '🎨', color: '#FFF0F0' },
  { id: 'tiles',     name: 'Tiles & Flooring', emoji: '⬛', color: '#F0F4FF' },
  { id: 'electrical',name: 'Electrical',       emoji: '💡', color: '#FFFBF0' },
  { id: 'plumbing',  name: 'Plumbing',         emoji: '🔧', color: '#F0FFF8' },
  { id: 'hardware',  name: 'Hardware',         emoji: '🔩', color: '#FFF5F0' },
  { id: 'decor',     name: 'Decor & Fittings', emoji: '🪞', color: '#F8F0FF' },
  { id: 'safety',    name: 'Safety & PPE',     emoji: '🦺', color: '#F0FAFF' },
];

// ── Hero Banners (default fallback when API returns nothing) ──
const DEFAULT_BANNERS = [
  {
    id: 'default-1',
    title: '60-90 Min Delivery',
    subtitle: 'Cement, bricks & more at your site',
    bg_color: Colors.primary,
  },
  {
    id: 'default-2',
    title: 'Bulk Orders Welcome',
    subtitle: 'Get next-day scheduled delivery on large orders',
    bg_color: '#1E3A5F',
  },
  {
    id: 'default-3',
    title: 'Quality Guaranteed',
    subtitle: 'ISI-certified materials from trusted brands',
    bg_color: '#1A5C2E',
  },
];

function HeroBanner({ item, onPress }) {
  const bgColor = item.bg_color || Colors.primary;
  return (
    <TouchableOpacity
      style={[styles.heroBanner, { backgroundColor: bgColor }]}
      activeOpacity={item.link_url ? 0.85 : 1}
      onPress={item.link_url && onPress ? () => onPress(item) : undefined}
    >
      {item.image_url ? (
        <Image
          source={{ uri: item.image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : null}
      <View style={styles.heroContent}>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle} numberOfLines={2}>{item.title}</Text>
          {item.subtitle ? (
            <Text style={styles.heroSubtitle} numberOfLines={2}>{item.subtitle}</Text>
          ) : null}
          {item.cta_text ? (
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>{item.cta_text}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Flash Deals Section ───────────────────────────────────────
// Formats seconds remaining into HH:MM:SS or MM:SS
function formatCountdown(secondsLeft) {
  if (secondsLeft <= 0) return '00:00';
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Category → emoji map for deal cards without product images
const CAT_EMOJI = {
  cement: '🧱', paints: '🎨', tiles: '⬛', electrical: '💡',
  plumbing: '🔧', hardware: '🔩', decor: '🪞', safety: '🦺',
};

function FlashDealCard({ deal, onPress }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.round((new Date(deal.ends_at) - Date.now()) / 1000))
  );

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.round((new Date(deal.ends_at) - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deal.ends_at]);

  if (secondsLeft <= 0) return null; // expired — hide card

  const emoji = CAT_EMOJI[deal.category?.toLowerCase()] || '🏗️';

  return (
    <TouchableOpacity style={styles.flashCard} onPress={onPress} activeOpacity={0.85}>
      {/* Discount badge */}
      <View style={styles.flashBadge}>
        <Text style={styles.flashBadgeText}>−{deal.discount_pct}%</Text>
      </View>

      {/* Emoji product placeholder */}
      <View style={styles.flashEmoji}>
        <Text style={{ fontSize: 28 }}>{emoji}</Text>
      </View>

      {/* Deal info */}
      <Text style={styles.flashTitle} numberOfLines={2}>{deal.title}</Text>

      {/* Countdown */}
      <View style={styles.flashTimer}>
        <Ionicons name="time-outline" size={10} color="#dc2626" />
        <Text style={styles.flashTimerText}>{formatCountdown(secondsLeft)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function FlashDealsSection({ flashSales, onPressDeal }) {
  const active = (flashSales || []).filter(
    s => s.ends_at && new Date(s.ends_at) > new Date()
  );
  if (!active.length) return null;

  return (
    <View style={styles.flashSection}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>⚡ Flash Deals</Text>
          <Text style={styles.flashSubtitle}>Limited-time discounts · grab fast!</Text>
        </View>
      </View>
      <FlatList
        horizontal
        data={active}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <FlashDealCard deal={item} onPress={() => onPressDeal && onPressDeal(item)} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.flashList}
      />
    </View>
  );
}

// ── AI Recommendations Section ───────────────────────────────
function RecommendedCard({ item, onPress }) {
  const priceRs = Math.round((item.price || 0) / 100);
  return (
    <TouchableOpacity style={styles.recCard} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.recAccent} />
      <View style={styles.recImg}>
        {item.thumbnail
          ? <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <Text style={{ fontSize: 28 }}>🏗️</Text>}
      </View>
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
    staleTime: 5 * 60 * 1000,
    enabled:   !!shopId && isLoggedIn,
  });

  const recommendations = data?.recommendations || [];
  if (!isLoggedIn || (!isLoading && !recommendations.length)) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>✨ Recommended for you</Text>
          <Text style={styles.sectionSub}>Based on your orders</Text>
        </View>
      </View>
      {isLoading ? (
        <FlatList
          horizontal
          data={[1, 2, 3]}
          keyExtractor={i => String(i)}
          renderItem={() => <View style={[styles.recCard, styles.recCardSkeleton]} />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing[4], gap: Spacing[3] }}
        />
      ) : (
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
      )}
    </View>
  );
}

// ── Main HomeScreen ─────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const itemCount  = useCartStore(s => s.itemCount);
  const cartItems  = useCartStore(s => s.items || []);
  const { selectedCity } = useCityStore();
  const { locality, serviceability } = useLocation();


  const lat = selectedCity?.center_lat ?? FALLBACK_LAT;
  const lng = selectedCity?.center_lng ?? FALLBACK_LNG;

  // Fetch nearby shops
  const { data: shopsData, isLoading: shopsLoading, refetch: refetchShops } = useQuery({
    queryKey:  ['nearby-shops', selectedCity?.id ?? 'patna', lat, lng],
    queryFn:   () => getNearbyShops(lat, lng),
    staleTime: 5 * 60 * 1000,
  });
  const shop = shopsData?.shops?.[0];

  // Fetch dynamic home screen banners (admin-controlled via dashboard)
  const citySlug = selectedCity?.name?.toLowerCase() || 'patna';
  const { data: bannersData } = useQuery({
    queryKey:  ['home-banners', citySlug],
    queryFn:   () => fetchBanners(citySlug),
    staleTime: 5 * 60 * 1000,  // cache 5 min — banners rarely change
    retry:     1,               // only retry once on failure
  });
  // Use API banners if available, else fall back to default slides
  const heroBanners = (bannersData && bannersData.length > 0) ? bannersData : DEFAULT_BANNERS;

  // Fetch active flash deals — refresh every 60s, hide section if empty
  const { data: flashData } = useQuery({
    queryKey:  ['flash-sales', citySlug],
    queryFn:   () => fetchFlashSales(citySlug),
    staleTime: 60 * 1000,   // flash sales change fast — cache only 1 min
    retry:     1,
  });
  const flashSales = flashData?.flash_sales || [];

  const handleCategoryPress = (cat) => {
    if (!shop?.id) return;
    navigation.navigate('Category', {
      shopId:       shop.id,
      categoryId:   cat.id,
      categoryName: cat.name,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.locationRow}>
            <Ionicons name="location" size={14} color={Colors.primary} />
            <Text style={styles.locationLabel} numberOfLines={1}>Delivering to</Text>
          </View>
          <Text style={styles.locality} numberOfLines={1}>{locality}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.appName}>TezzNirmaan</Text>
          <TouchableOpacity
            style={styles.cartBtn}
            onPress={() => navigation.navigate('Cart')}
          >
            <Ionicons name="cart-outline" size={26} color={Colors.text} />
            {itemCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={shopsLoading}
            onRefresh={refetchShops}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* ── Search bar ── */}
        <TouchableOpacity
          style={styles.searchBar}
          onPress={() => navigation.navigate('SearchTab', { screen: 'SearchMain' })}
          activeOpacity={0.8}
        >
          <Ionicons name="search" size={18} color={Colors.textTertiary} />
          <Text style={styles.searchPlaceholder}>Search cement, paint, tiles…</Text>
          <View style={styles.searchMic}>
            <Ionicons name="mic-outline" size={16} color={Colors.textTertiary} />
          </View>
        </TouchableOpacity>

        {/* ── Session K: Serviceability banner ── */}
        {serviceability && !serviceability.serviceable && (
          <View style={styles.notServiceableBanner}>
            <Ionicons name="location-outline" size={16} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.notServiceableTitle}>
                {serviceability.reason || 'We don\'t deliver here yet'}
              </Text>
              {serviceability.nearest_city && (
                <Text style={styles.notServiceableSub}>
                  Nearest: {serviceability.nearest_city.name}
                  {serviceability.nearest_city.is_active
                    ? ` (${serviceability.nearest_city.dist_km} km)`
                    : ' — Coming Soon'}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Delivery promise banner ── */}

        <View style={styles.promiseBanner}>
          <View style={styles.promiseItem}>
            <Text style={styles.promiseEmoji}>⚡</Text>
            <Text style={styles.promiseText}>Quick delivery{'\n'}in 60–90 min</Text>
          </View>
          <View style={styles.promiseDivider} />
          <View style={styles.promiseItem}>
            <Text style={styles.promiseEmoji}>📅</Text>
            <Text style={styles.promiseText}>Bulk orders{'\n'}next-day slot</Text>
          </View>
          <View style={styles.promiseDivider} />
          <View style={styles.promiseItem}>
            <Text style={styles.promiseEmoji}>🏆</Text>
            <Text style={styles.promiseText}>ISI-certified{'\n'}materials</Text>
          </View>
        </View>

        {/* ── Hero banner carousel — dynamic, admin-controlled ── */}
        <FlatList
          horizontal
          data={heroBanners}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <HeroBanner
              item={item}
              onPress={(banner) => {
                // Basic link_url routing: /category/cement → Category screen
                if (!banner.link_url) return;
                const match = banner.link_url.match(/\/category\/([^/?]+)/i);
                if (match && shop?.id) {
                  navigation.navigate('Category', {
                    shopId: shop.id,
                    categoryId: match[1],
                    categoryName: match[1].charAt(0).toUpperCase() + match[1].slice(1),
                  });
                }
              }}
            />
          )}
          showsHorizontalScrollIndicator={false}
          pagingEnabled
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={styles.heroList}
          style={styles.heroContainer}
        />

        {/* ── Flash Deals — hidden if no active sales ── */}
        <FlashDealsSection
          flashSales={flashSales}
          onPressDeal={(deal) => {
            // Navigate to category screen if category is known and shop is available
            if (deal.category && shop?.id) {
              navigation.navigate('Category', {
                shopId:       shop.id,
                categoryId:   deal.category.toLowerCase(),
                categoryName: deal.category.charAt(0).toUpperCase() + deal.category.slice(1),
              });
            }
          }}
        />

        {/* ── Shop unavailable notice ── */}
        {!shopsLoading && !shop && (
          <View style={styles.shopClosedBanner}>
            <Text style={styles.shopClosedEmoji}>📍</Text>
            <View style={styles.shopClosedText}>
              <Text style={styles.shopClosedTitle}>Not yet in your area</Text>
              <Text style={styles.shopClosedSub}>
                We're expanding fast — check back soon!
              </Text>
            </View>
          </View>
        )}

        {/* ── Category grid ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { paddingHorizontal: Spacing[4] }]}>
            Shop by Category
          </Text>
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

        {/* ── Horizontal product rows per category ── */}
        {shop?.id && CATEGORIES.map((cat) => (
          <CategoryProductSection
            key={cat.id}
            category={cat}
            shopId={shop.id}
            navigation={navigation}
          />
        ))}

        {/* ── AI Recommendations ── */}
        <RecommendationsSection
          shopId={shop?.id}
          cartItems={cartItems}
          navigation={navigation}
          shopObj={shop}
        />

        <View style={{ height: Spacing[8] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft:   { flex: 1 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  locationLabel:{ fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  locality:     { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.text, flex: 1 },
  appName:      { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.primary },
  cartBtn:      { position: 'relative', padding: Spacing[2] },
  cartBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: Colors.primary, borderRadius: 10,
    minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: { color: '#fff', fontFamily: Typography.fontFamily.bold, fontSize: 10 },

  // ── Search ──────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.xl,
    marginHorizontal: Spacing[4], marginVertical: Spacing[3],
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    ...Shadow.sm,
  },
  searchPlaceholder: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textTertiary, flex: 1 },
  searchMic:         { padding: 2 },

  // ── Promise banner ───────────────────────────────────────────
  // Session K: serviceability banner
  notServiceableBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1, borderColor: '#fecaca',
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing[4], marginBottom: Spacing[3],
    padding: Spacing[3],
  },
  notServiceableTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: 13, color: '#dc2626', lineHeight: 18,
  },
  notServiceableSub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: 12, color: '#ef4444', marginTop: 2,
  },

  promiseBanner: {

    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing[4], marginBottom: Spacing[4],
    borderRadius: BorderRadius.xl, padding: Spacing[3],
    borderWidth: 1, borderColor: Colors.border,
  },
  promiseItem:    { flex: 1, alignItems: 'center', gap: 3 },
  promiseEmoji:   { fontSize: 18 },
  promiseText:    { fontFamily: Typography.fontFamily.medium, fontSize: 10, color: Colors.text, textAlign: 'center', lineHeight: 14 },
  promiseDivider: { width: 1, height: 30, backgroundColor: Colors.border },

  // ── Hero carousel ────────────────────────────────────────────
  heroContainer: { marginBottom: Spacing[5] },
  heroList:      { paddingHorizontal: Spacing[4], gap: Spacing[3] },
  heroBanner: {
    width: SCREEN_W - Spacing[4] * 3,
    height: 110,
    borderRadius: BorderRadius['2xl'],
    padding: Spacing[4],
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroContent:   { flexDirection: 'row', alignItems: 'center', flex: 1 },
  heroText:      { flex: 1 },
  heroTitle:     { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: '#fff', marginBottom: 3 },
  heroSubtitle:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
  heroCta:       { marginTop: Spacing[2], alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: BorderRadius.full, paddingHorizontal: Spacing[3], paddingVertical: 4 },
  heroCtaText:   { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, color: '#fff' },

  // ── Shop closed notice ───────────────────────────────────────
  shopClosedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    backgroundColor: '#FFF7ED',
    marginHorizontal: Spacing[4], marginBottom: Spacing[4],
    borderRadius: BorderRadius.xl, padding: Spacing[4],
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  shopClosedEmoji: { fontSize: 24 },
  shopClosedText:  { flex: 1 },
  shopClosedTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.primary },
  shopClosedSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },

  // ── Sections ─────────────────────────────────────────────────
  section:       { marginBottom: Spacing[5] },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing[4], marginBottom: Spacing[3],
  },
  sectionTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text, marginBottom: Spacing[3] },
  sectionSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, paddingHorizontal: Spacing[4], marginTop: -Spacing[2], marginBottom: Spacing[3] },
  seeAll:       { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.primary },

  // ── Flash Deals ───────────────────────────────────────────────
  flashSection:    { marginBottom: Spacing[4] },
  flashSubtitle:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
  flashList:       { paddingHorizontal: Spacing[4], gap: Spacing[3] },
  flashCard: {
    width: 120,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing[3],
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  flashBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: '#dc2626',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  flashBadgeText:  { fontFamily: Typography.fontFamily.bold, fontSize: 10, color: '#fff' },
  flashEmoji:      { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing[2] },
  flashTitle:      { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xs, color: Colors.text, lineHeight: 16, marginBottom: Spacing[2] },
  flashTimer: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#fef2f2',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 5, paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  flashTimerText:  { fontFamily: Typography.fontFamily.bold, fontSize: 9, color: '#dc2626' },

  // ── Category grid ────────────────────────────────────────────
  categoryGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: Spacing[4], gap: Spacing[3],
  },
  categoryCard:  { width: '22%', alignItems: 'center', gap: Spacing[2] },
  categoryIcon:  { width: 60, height: 60, borderRadius: BorderRadius['2xl'], alignItems: 'center', justifyContent: 'center' },
  categoryEmoji: { fontSize: 28 },
  categoryName:  { fontFamily: Typography.fontFamily.medium, fontSize: 10, color: Colors.text, textAlign: 'center' },

  // ── AI Recommendations ───────────────────────────────────────
  recCard: {
    width: 180, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl, overflow: 'hidden',
    flexDirection: 'row', ...Shadow.sm,
  },
  recCardSkeleton: { backgroundColor: Colors.border, opacity: 0.5 },
  recAccent:  { width: 4, backgroundColor: Colors.primary },
  recImg: {
    width: 72, height: 80,
    backgroundColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  recInfo:    { flex: 1, padding: Spacing[2], gap: 4, justifyContent: 'center' },
  recName:    { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.xs, color: Colors.text, lineHeight: 16 },
  recPrice:   { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm, color: Colors.primary },
  recTierBadge: {
    backgroundColor: Colors.primary + '15',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start',
  },
  recTierText: { fontFamily: Typography.fontFamily.semiBold, fontSize: 9, color: Colors.primary },
});
