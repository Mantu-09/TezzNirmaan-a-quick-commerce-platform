/**
 * SearchScreen — B3
 * Full-featured product search with autocomplete, filters, sort, recent searches.
 */
import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Keyboard, Animated,
  Dimensions, Modal, Switch, ScrollView, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Colors, Typography, Spacing, BorderRadius, Shadow,
} from '../../theme';
import { searchProducts, getSearchSuggestions, getCategories } from '../../api/products';
import useCartStore from '../../store/cartStore';

const { width: W, height: H } = Dimensions.get('window');
const CARD_W = (W - Spacing[4] * 2 - Spacing[3]) / 2;
const RECENT_KEY = 'tn_recent_searches';
const MAX_RECENT  = 10;

// ── Static fallback categories for empty state ─────────────
const STATIC_CATS = [
  { id: 'cement',      name: 'Cement',       emoji: '🧱', color: '#F3F0EA' },
  { id: 'paints',      name: 'Paints',       emoji: '🎨', color: '#FFF0F0' },
  { id: 'tiles',       name: 'Tiles',        emoji: '⬛', color: '#F0F4FF' },
  { id: 'electrical',  name: 'Electrical',   emoji: '💡', color: '#FFFBF0' },
  { id: 'plumbing',    name: 'Plumbing',     emoji: '🔧', color: '#F0FFF8' },
  { id: 'hardware',    name: 'Hardware',     emoji: '🔩', color: '#FFF5F0' },
  { id: 'safety',      name: 'Safety & PPE', emoji: '🦺', color: '#F0FAFF' },
  { id: 'decor',       name: 'Decor',        emoji: '🪞', color: '#F8F0FF' },
];

const SORT_OPTIONS = [
  { value: 'relevance',   label: 'Relevance' },
  { value: 'price_asc',   label: 'Price ↑' },
  { value: 'price_desc',  label: 'Price ↓' },
  { value: 'newest',      label: 'Newest' },
];

const DEFAULT_FILTERS = {
  category: null,
  tier:     null,
  minPrice: '',
  maxPrice: '',
  inStock:  false,
};

// ── Helpers ────────────────────────────────────────────────
const rupees = (paise) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
const discountPct = (price, mrp) => mrp > price ? Math.round((1 - price / mrp) * 100) : 0;

// ── Sub-components ─────────────────────────────────────────

function TierBadge({ tier }) {
  const isQuick = tier === 'quick';
  return (
    <View style={[styles.tierBadge, { backgroundColor: isQuick ? Colors.primary : Colors.secondary }]}>
      <Text style={styles.tierBadgeText}>{isQuick ? '⚡' : '📅'} {isQuick ? 'Quick' : 'Scheduled'}</Text>
    </View>
  );
}

function ProductCard({ item, onPress, onAdd, qty, onInc, onDec }) {
  const disc = discountPct(item.price, item.mrp);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.92}>
      {/* Image */}
      <View style={styles.cardImg}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.cardImgFill} contentFit="cover" />
        ) : (
          <View style={styles.cardImgFallback}>
            <Text style={{ fontSize: 32 }}>🏗️</Text>
          </View>
        )}
        <TierBadge tier={item.deliveryTier} />
        <View style={[styles.stockDot, { backgroundColor: item.isInStock ? Colors.success : Colors.textTertiary }]} />
        {disc > 0 && (
          <View style={styles.discBadge}>
            <Text style={styles.discText}>{disc}% OFF</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
        {item.brandName && (
          <Text style={styles.cardBrand} numberOfLines={1}>{item.brandName}</Text>
        )}

        <View style={styles.cardPriceRow}>
          <Text style={styles.cardPrice}>{rupees(item.price)}</Text>
          <Text style={styles.cardUnit}>/{item.unit}</Text>
        </View>
        {item.mrp && item.mrp > item.price && (
          <Text style={styles.cardMrp}>{rupees(item.mrp)}</Text>
        )}

        {/* Cart control */}
        {qty > 0 ? (
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={onDec}><Text style={styles.qtyBtnText}>−</Text></TouchableOpacity>
            <Text style={styles.qtyCount}>{qty}</Text>
            <TouchableOpacity style={styles.qtyBtn} onPress={onInc}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={[styles.cardImg, { backgroundColor: Colors.border }]} />
      <View style={styles.cardBody}>
        <View style={{ height: 12, width: '80%', backgroundColor: Colors.border, borderRadius: 4, marginBottom: 6 }} />
        <View style={{ height: 10, width: '50%', backgroundColor: Colors.border, borderRadius: 4, marginBottom: 8 }} />
        <View style={{ height: 16, width: '60%', backgroundColor: Colors.border, borderRadius: 4 }} />
      </View>
    </Animated.View>
  );
}

// ── Filter Drawer ──────────────────────────────────────────
function FilterDrawer({ visible, onClose, filters, onApply, categories }) {
  const [local, setLocal] = useState(filters);
  useEffect(() => { setLocal(filters); }, [filters, visible]);

  const set = (field, val) => setLocal(p => ({ ...p, [field]: val }));
  const activeCount = [local.category, local.tier, local.minPrice, local.maxPrice, local.inStock ? '1' : null].filter(Boolean).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.drawerOverlay} onPress={onClose} />
      <View style={styles.drawer}>
        {/* Handle */}
        <View style={styles.drawerHandle} />

        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Filters</Text>
          <TouchableOpacity onPress={() => { setLocal(DEFAULT_FILTERS); }}>
            <Text style={styles.drawerReset}>Reset all</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {/* Delivery Tier */}
          <Text style={styles.filterLabel}>Delivery Type</Text>
          <View style={styles.chipRow}>
            {[{ v: null, l: 'All' }, { v: 'quick', l: '⚡ Quick' }, { v: 'scheduled', l: '📅 Scheduled' }].map(o => (
              <TouchableOpacity
                key={String(o.v)}
                style={[styles.chip, local.tier === o.v && styles.chipActive]}
                onPress={() => set('tier', o.v)}
              >
                <Text style={[styles.chipText, local.tier === o.v && styles.chipTextActive]}>{o.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Category */}
          <Text style={styles.filterLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2, paddingBottom: 4 }}>
            {[{ id: null, name: 'All' }, ...categories].map(cat => (
              <TouchableOpacity
                key={String(cat.id)}
                style={[styles.chip, local.category === cat.id && styles.chipActive]}
                onPress={() => set('category', cat.id)}
              >
                <Text style={[styles.chipText, local.category === cat.id && styles.chipTextActive]}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Price Range */}
          <Text style={styles.filterLabel}>Price Range (₹)</Text>
          <View style={styles.priceRow}>
            <TextInput
              style={styles.priceInput}
              placeholder="Min"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="numeric"
              value={local.minPrice}
              onChangeText={v => set('minPrice', v)}
            />
            <Text style={{ color: Colors.textSecondary, alignSelf: 'center' }}>—</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="Max"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="numeric"
              value={local.maxPrice}
              onChangeText={v => set('maxPrice', v)}
            />
          </View>

          {/* In Stock */}
          <View style={styles.stockRow}>
            <Text style={styles.filterLabel}>In Stock Only</Text>
            <Switch
              value={local.inStock}
              onValueChange={v => set('inStock', v)}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </ScrollView>

        <TouchableOpacity style={styles.applyBtn} onPress={() => { onApply(local); onClose(); }}>
          <Text style={styles.applyBtnText}>
            Apply Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────
export default function SearchScreen({ navigation, route }) {
  const initialQuery = route?.params?.query || '';

  const [query,       setQuery]       = useState(initialQuery);
  const [results,     setResults]     = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [recent,      setRecent]      = useState([]);
  const [categories,  setCategories]  = useState(STATIC_CATS);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters,     setFilters]     = useState(DEFAULT_FILTERS);
  const [sort,        setSort]        = useState('relevance');
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(false);
  const [focused,     setFocused]     = useState(false);
  const [filterOpen,  setFilterOpen]  = useState(false);

  const inputRef     = useRef(null);
  const debounceRef  = useRef(null);
  const addItem      = useCartStore(s => s.addItem);
  const cartItems    = useCartStore(s => s.items || []);   // array of cart items
  const updateQty    = useCartStore(s => s.updateQuantity);

  const activeFilterCount = [
    filters.category, filters.tier,
    filters.minPrice, filters.maxPrice,
    filters.inStock ? '1' : null,
  ].filter(Boolean).length;

  // ── Load recent + categories on mount ───────────────────
  useEffect(() => {
    loadRecent();
    loadCategories();
    if (initialQuery) runSearch(initialQuery, DEFAULT_FILTERS, 'relevance', 1, false);
  }, []);

  async function loadRecent() {
    try {
      const raw = await AsyncStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {}
  }

  async function saveRecent(term) {
    try {
      const trimmed = term.trim();
      if (!trimmed) return;
      setRecent(prev => {
        const next = [trimmed, ...prev.filter(s => s !== trimmed)].slice(0, MAX_RECENT);
        AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
        return next;
      });
    } catch {}
  }

  async function removeRecent(term) {
    setRecent(prev => {
      const next = prev.filter(s => s !== term);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function clearRecent() {
    setRecent([]);
    AsyncStorage.removeItem(RECENT_KEY);
  }

  async function loadCategories() {
    try {
      const data = await getCategories();
      if (data?.categories?.length) setCategories(data.categories);
    } catch {}
  }

  // ── Autocomplete (debounced 300ms) ───────────────────────
  useEffect(() => {
    if (!focused || !query.trim()) { setSuggestions([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await getSearchSuggestions(query.trim());
        setSuggestions(data?.suggestions || []);
      } catch { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, focused]);

  // ── Full search ──────────────────────────────────────────
  async function runSearch(q, activeFilters, activeSort, pg, append = false) {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = {
        q: q.trim(),
        sort: activeSort,
        page: pg,
        limit: 20,
      };
      if (activeFilters.category) params.category = activeFilters.category;
      if (activeFilters.tier)     params.tier      = activeFilters.tier;
      if (activeFilters.minPrice) params.min_price = activeFilters.minPrice;
      if (activeFilters.maxPrice) params.max_price = activeFilters.maxPrice;
      if (activeFilters.inStock)  params.in_stock  = 'true';

      const data = await searchProducts(params);
      const res  = data?.results || [];
      setResults(prev => append ? [...prev, ...res] : res);
      setTotal(data?.total || 0);
      setHasMore(data?.hasMore || false);
      setPage(pg);
    } catch (err) {
      console.warn('Search error:', err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function handleSubmit() {
    if (!query.trim()) return;
    Keyboard.dismiss();
    setSuggestions([]);
    setFocused(false);
    saveRecent(query.trim());
    setResults([]);
    runSearch(query, filters, sort, 1, false);
  }

  function handleSuggestionTap(name) {
    setQuery(name);
    setSuggestions([]);
    setFocused(false);
    Keyboard.dismiss();
    saveRecent(name);
    setResults([]);
    runSearch(name, filters, sort, 1, false);
  }

  function handleSortChange(newSort) {
    setSort(newSort);
    setResults([]);
    runSearch(query, filters, newSort, 1, false);
  }

  function handleApplyFilters(newFilters) {
    setFilters(newFilters);
    setResults([]);
    runSearch(query, newFilters, sort, 1, false);
  }

  function handleLoadMore() {
    if (hasMore && !loadingMore) runSearch(query, filters, sort, page + 1, true);
  }

  function handleCategoryPress(cat) {
    const newFilters = { ...DEFAULT_FILTERS, category: cat.id || null };
    setFilters(newFilters);
    const catQuery = cat.name;
    setQuery(catQuery);
    setResults([]);
    runSearch(catQuery, newFilters, sort, 1, false);
  }

  // ── Cart helpers ─────────────────────────────────────────
  function getQty(productId) {
    // items is an array — find by productId
    return cartItems.find(i => i.productId === productId)?.quantity || 0;
  }
  function handleAdd(item) {
    addItem({
      inventoryId:    item.inventoryId,
      shopId:         item.shopId,
      productId:      item.productId,
      name:           item.name,
      imageUrl:       item.thumbnail,
      unit:           item.unit,
      deliveryTier:   item.deliveryTier,
      unitPricePaise: item.price,   // paise — matches cartStore shape
    });
  }
  function handleInc(item) {
    updateQty(item.productId, getQty(item.productId) + 1);
  }
  function handleDec(item) {
    const cur = getQty(item.productId);
    updateQty(item.productId, cur - 1); // updateQuantity handles 0 → removeItem
  }

  // ── Render: suggestions dropdown ────────────────────────
  const showSuggestions = focused && (suggestions.length > 0 || (query === '' && recent.length > 0));

  const renderSuggestionArea = () => {
    if (!showSuggestions) return null;
    return (
      <View style={styles.suggestionBox}>
        {query === '' && recent.length > 0 ? (
          <>
            <View style={styles.suggestionHeader}>
              <Text style={styles.suggestionTitle}>Recent Searches</Text>
              <TouchableOpacity onPress={clearRecent}>
                <Text style={styles.clearAll}>Clear all</Text>
              </TouchableOpacity>
            </View>
            {recent.map(term => (
              <TouchableOpacity key={term} style={styles.suggestionRow} onPress={() => handleSuggestionTap(term)}>
                <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.suggestionName} numberOfLines={1}>{term}</Text>
                <TouchableOpacity onPress={() => removeRecent(term)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={14} color={Colors.textTertiary} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          suggestions.map((s, i) => (
            <TouchableOpacity key={s.id || i} style={styles.suggestionRow} onPress={() => handleSuggestionTap(s.name)}>
              <Ionicons name="search-outline" size={16} color={Colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionName} numberOfLines={1}>{s.name}</Text>
                {s.brand && <Text style={styles.suggestionBrand}>{s.brand}</Text>}
              </View>
              <View style={[styles.tierPill, { backgroundColor: s.deliveryTier === 'quick' ? '#FFF3E6' : '#E6EEF8' }]}>
                <Text style={[styles.tierPillText, { color: s.deliveryTier === 'quick' ? Colors.primary : Colors.secondary }]}>
                  {s.deliveryTier === 'quick' ? '⚡' : '📅'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    );
  };

  // ── Render: empty / initial state ───────────────────────
  const renderEmptyState = () => {
    if (loading) return null;

    if (query.trim() && results.length === 0) {
      // No results
      return (
        <View style={styles.emptyBox}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🔍</Text>
          <Text style={styles.emptyTitle}>No results for "{query}"</Text>
          <Text style={styles.emptySubtitle}>Try searching for:</Text>
          <View style={styles.chipRow}>
            {['cement', 'tiles', 'paint', 'fittings', 'rebar', 'sand'].map(s => (
              <TouchableOpacity key={s} style={styles.suggestChip} onPress={() => { setQuery(s); runSearch(s, filters, sort, 1, false); }}>
                <Text style={styles.suggestChipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    if (!query.trim() && results.length === 0) {
      // Initial / empty query state
      return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.emptyScrollContent}>
          {recent.length > 0 && (
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Recent Searches</Text>
                <TouchableOpacity onPress={clearRecent}><Text style={styles.clearAll}>Clear</Text></TouchableOpacity>
              </View>
              {recent.slice(0, 5).map(term => (
                <TouchableOpacity key={term} style={styles.recentRow} onPress={() => { setQuery(term); runSearch(term, filters, sort, 1, false); }}>
                  <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.recentTerm}>{term}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Browse Categories</Text>
            <View style={styles.catGrid}>
              {STATIC_CATS.map(cat => (
                <TouchableOpacity key={cat.id} style={styles.catCard} onPress={() => handleCategoryPress(cat)}>
                  <View style={[styles.catIcon, { backgroundColor: cat.color }]}>
                    <Text style={{ fontSize: 28 }}>{cat.emoji}</Text>
                  </View>
                  <Text style={styles.catName} numberOfLines={2}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      );
    }

    return null;
  };

  // ── Render: result grid ──────────────────────────────────
  const renderItem = useCallback(({ item }) => {
    const qty = getQty(item.productId);   // key by productId (matches cartStore)
    return (
      <ProductCard
        item={item}
        qty={qty}
        onPress={() => navigation.navigate('ProductDetail', { shopId: item.shopId, productId: item.productId })}
        onAdd={() => handleAdd(item)}
        onInc={() => handleInc(item)}
        onDec={() => handleDec(item)}
      />
    );
  }, [cartItems]);

  const renderSkeletons = () => (
    <View style={styles.grid}>
      {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return <View style={{ height: 80 }} />;
    return <ActivityIndicator style={{ marginVertical: 20 }} color={Colors.primary} />;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onSubmitEditing={handleSubmit}
          returnKeyType="search"
          placeholder="Search cement, paint, tiles…"
          placeholderTextColor={Colors.textTertiary}
          autoFocus={!initialQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSuggestions([]); }} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Suggestions overlay */}
      {renderSuggestionArea()}

      {/* Sort bar */}
      {results.length > 0 && !loading && (
        <>
          <View style={styles.resultHeader}>
            <Text style={styles.resultCount}>{total.toLocaleString()} result{total !== 1 ? 's' : ''}</Text>
            <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterOpen(true)}>
              <Ionicons name="options-outline" size={16} color={activeFilterCount > 0 ? Colors.primary : Colors.text} />
              <Text style={[styles.filterBtnText, activeFilterCount > 0 && { color: Colors.primary }]}>
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortBar} contentContainerStyle={{ gap: 8, paddingHorizontal: Spacing[4] }}>
            {SORT_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.value}
                style={[styles.sortChip, sort === o.value && styles.sortChipActive]}
                onPress={() => handleSortChange(o.value)}
              >
                <Text style={[styles.sortChipText, sort === o.value && styles.sortChipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Filter button when no results but query exists */}
      {!loading && query.trim() && results.length === 0 && (
        <TouchableOpacity style={styles.floatFilter} onPress={() => setFilterOpen(true)}>
          <Ionicons name="options-outline" size={16} color={Colors.primary} />
          <Text style={{ color: Colors.primary, fontSize: 13, fontFamily: Typography.fontFamily.semiBold }}>Filters</Text>
        </TouchableOpacity>
      )}

      {/* Content */}
      {loading ? renderSkeletons() : results.length > 0 ? (
        <FlatList
          data={results}
          keyExtractor={item => item.inventoryId}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
        />
      ) : renderEmptyState()}

      {/* Filter Drawer */}
      <FilterDrawer
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={handleApplyFilters}
        categories={categories}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
    gap: Spacing[2],
  },
  backBtn:     { padding: Spacing[1] },
  searchInput: {
    flex: 1, height: 40,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.base, color: Colors.text,
    backgroundColor: Colors.surface2,
    borderRadius: BorderRadius.xl, paddingHorizontal: Spacing[3],
  },
  clearBtn: { padding: Spacing[1] },

  // Suggestions
  suggestionBox: {
    position: 'absolute', top: 60, left: 0, right: 0, zIndex: 100,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    maxHeight: H * 0.45,
    ...Shadow.md,
  },
  suggestionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingTop: Spacing[3], paddingBottom: Spacing[2],
  },
  suggestionTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  clearAll:        { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.primary },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[3],
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  suggestionName:  { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base, color: Colors.text, flex: 1 },
  suggestionBrand: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
  tierPill:        { borderRadius: BorderRadius.full, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  tierPillText:    { fontSize: 13 },

  // Result header
  resultHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing[4], paddingVertical: Spacing[2],
  },
  resultCount:  { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  filterBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, padding: Spacing[1] },
  filterBtnText:{ fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.text },

  // Sort bar
  sortBar: { maxHeight: 44, flexGrow: 0 },
  sortChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  sortChipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sortChipText:      { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  sortChipTextActive:{ color: '#fff' },

  // Product grid
  listContent: { padding: Spacing[4], gap: Spacing[3] },
  row:         { gap: Spacing[3], justifyContent: 'space-between' },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing[4], gap: Spacing[3] },

  card: {
    width: CARD_W, backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl, overflow: 'hidden',
    ...Shadow.sm,
  },
  cardImg:       { width: '100%', height: CARD_W * 0.8, position: 'relative', backgroundColor: Colors.surface2 },
  cardImgFill:   { width: '100%', height: '100%' },
  cardImgFallback:{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5' },
  tierBadge: {
    position: 'absolute', top: 6, left: 6, borderRadius: BorderRadius.full,
    paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center',
  },
  tierBadgeText: { color: '#fff', fontSize: 9, fontFamily: Typography.fontFamily.bold },
  stockDot:      { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },
  discBadge: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: Colors.error, borderRadius: BorderRadius.sm,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  discText: { color: '#fff', fontSize: 9, fontFamily: Typography.fontFamily.bold },

  cardBody: { padding: Spacing[3] },
  cardName:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.text, marginBottom: 2 },
  cardBrand: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, marginBottom: 6 },
  cardPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  cardPrice: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.primary },
  cardUnit:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary },
  cardMrp:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, textDecorationLine: 'line-through', marginTop: 1 },

  addBtn: {
    marginTop: Spacing[2], backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md, paddingVertical: 6, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.sm },
  qtyRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing[2] },
  qtyBtn:   { backgroundColor: Colors.primary, width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { color: '#fff', fontSize: 18, fontFamily: Typography.fontFamily.bold, lineHeight: 22 },
  qtyCount:   { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.text },

  // Empty states
  emptyScrollContent: { padding: Spacing[4], paddingBottom: 80 },
  emptyBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing[6] },
  emptyTitle:   { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text, textAlign: 'center', marginBottom: 8 },
  emptySubtitle:{ fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textSecondary, marginBottom: 16 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  suggestChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border,
  },
  suggestChipText: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text },

  sectionBlock: { marginBottom: Spacing[6] },
  sectionHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[3] },
  sectionTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.text },
  recentRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], paddingVertical: Spacing[3], borderBottomWidth: 1, borderBottomColor: Colors.border },
  recentTerm:   { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base, color: Colors.text, flex: 1 },

  catGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3] },
  catCard:  { width: (W - Spacing[4] * 2 - Spacing[3] * 3) / 4, alignItems: 'center', gap: 6 },
  catIcon:  { width: 56, height: 56, borderRadius: BorderRadius['2xl'], alignItems: 'center', justifyContent: 'center' },
  catName:  { fontFamily: Typography.fontFamily.medium, fontSize: 10, color: Colors.text, textAlign: 'center' },

  floatFilter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8,
    marginVertical: 12, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.primary, backgroundColor: '#FFF3E6',
  },

  // Filter drawer
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  drawer: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: H * 0.75, padding: Spacing[5],
  },
  drawerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing[4] },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[4] },
  drawerTitle:  { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  drawerReset:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.error },
  filterLabel:  { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing[2], marginTop: Spacing[3] },

  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  chipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:      { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  chipTextActive:{ color: '#fff' },

  priceRow:  { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: Spacing[2] },
  priceInput:{
    flex: 1, height: 44, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing[3],
    fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.text,
    backgroundColor: Colors.surface2,
  },
  stockRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: Spacing[3] },

  applyBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.xl,
    paddingVertical: 16, alignItems: 'center', marginTop: Spacing[4],
  },
  applyBtnText: { color: '#fff', fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base },
});
