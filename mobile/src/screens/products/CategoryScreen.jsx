import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { getProducts } from '../../api/products';
import ProductCard from '../../components/product/ProductCard';
import { ProductCardSkeleton } from '../../components/common/SkeletonLoader';
import EmptyState from '../../components/common/EmptyState';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme';

const TIER_FILTERS = [
  { label: 'All',          value: null      },
  { label: '⚡ Quick',     value: 'quick'   },
  { label: '📅 Scheduled', value: 'scheduled' },
];

const SORT_OPTIONS = [
  { label: 'Default',    value: null       },
  { label: 'Price: Low', value: 'price_asc' },
  { label: 'Price: High', value: 'price_desc' },
];

export default function CategoryScreen({ route, navigation }) {
  const { shopId, categoryId, categoryName, tier: initialTier } = route.params || {};

  const [search, setSearch]       = useState('');
  const [tierFilter, setTierFilter] = useState(initialTier || null);
  const [sort, setSort]           = useState(null);
  const [page] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey:  ['products', shopId, { category: categoryId, search, tier: tierFilter, sort, page }],
    queryFn:   () => getProducts(shopId, {
      category: categoryId,
      search:   search.trim() || undefined,
      tier:     tierFilter || undefined,
      sort:     sort || undefined,
      page,
      limit: 20,
    }),
    enabled:   !!shopId,
    staleTime: 2 * 60 * 1000,
  });

  const products = data?.products || [];

  const renderItem = ({ item, index }) => (
    <View style={index % 2 === 0 ? styles.leftCol : styles.rightCol}>
      <ProductCard
        item={item}
        shopId={shopId}
        onPress={() => navigation.navigate('ProductDetail', { shopId, productId: item.products?.id })}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={`Search in ${categoryName || 'products'}…`}
            placeholderTextColor={Colors.textTertiary}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tier filter chips */}
      <View style={styles.filterRow}>
        {TIER_FILTERS.map((f) => (
          <TouchableOpacity
            key={String(f.value)}
            style={[styles.chip, tierFilter === f.value && styles.chipActive]}
            onPress={() => setTierFilter(f.value)}
          >
            <Text style={[styles.chipText, tierFilter === f.value && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        {/* Sort */}
        {SORT_OPTIONS.slice(1).map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.chip, sort === s.value && styles.chipActive]}
            onPress={() => setSort(sort === s.value ? null : s.value)}
          >
            <Text style={[styles.chipText, sort === s.value && styles.chipTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Product grid */}
      {isLoading ? (
        <View style={styles.grid}>
          {[1, 2, 3, 4, 5, 6].map(i => <ProductCardSkeleton key={i} />)}
        </View>
      ) : isError ? (
        <EmptyState variant="error" onAction={refetch} actionLabel="Retry" />
      ) : products.length === 0 ? (
        <EmptyState
          variant={search ? 'search' : 'products'}
          subtitle={search ? `No results for "${search}"` : undefined}
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.products?.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  searchRow:   { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.surface },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
    backgroundColor: Colors.surface2, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
  },
  searchInput: { flex: 1, fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.text },

  filterRow:  { flexDirection: 'row', gap: Spacing[2], paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], backgroundColor: Colors.surface, flexWrap: 'wrap' },
  chip:       { paddingHorizontal: Spacing[3], paddingVertical: Spacing[1], borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:   { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text },
  chipTextActive: { color: '#fff' },

  grid:        { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: Spacing[4], gap: Spacing[3] },
  listContent: { padding: Spacing[4] },
  row:         { justifyContent: 'space-between' },
  leftCol:     { width: '48%' },
  rightCol:    { width: '48%' },
});
