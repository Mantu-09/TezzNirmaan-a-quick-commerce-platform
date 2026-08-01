// ────────────────────────────────────────────────────────────
// ShopInventoryScreen — P8-4B
//
// Mobile inventory management for shop owners.
// Designed for speed: a shop owner receiving a delivery should
// be able to update 5 stock counts in under 30 seconds.
//
// Features:
//   • Filter tabs: 🔴 Low Stock | All | Out of Stock
//   • Stock count + price per item
//   • "Quick Update" → modal dial-pad (current count → type new)
//   • Full edit sheet: price, stock, availability toggle, threshold
//   • Pull-to-refresh
//   • Search filter
// ────────────────────────────────────────────────────────────
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Switch, Alert, RefreshControl,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons }     from '@expo/vector-icons';
import * as Haptics     from 'expo-haptics';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { getShopInventory, updateInventoryItem } from '../../api/shopOwner';

// ── Helpers ────────────────────────────────────────────────────
const fmtPaise = (p) =>
  `₹${((p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// ── Stock Status ──────────────────────────────────────────────
function stockStatus(item) {
  if (!item.is_available || item.stock_count === 0) return 'out';
  if (item.stock_count <= (item.low_stock_threshold || 10)) return 'low';
  return 'ok';
}

const STOCK_STYLES = {
  ok:  { icon: 'checkmark-circle', iconColor: Colors.success, textColor: Colors.success, bg: Colors.successLight },
  low: { icon: 'warning',          iconColor: Colors.warning, textColor: Colors.warning, bg: Colors.warningLight },
  out: { icon: 'close-circle',     iconColor: Colors.error,   textColor: Colors.error,   bg: Colors.errorLight   },
};

// ── Quick Update Modal ────────────────────────────────────────
function QuickUpdateModal({ item, visible, onClose, onSave }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue(String(item?.stock_count || 0));
  }, [visible, item]);

  const handleSave = () => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 0) {
      Alert.alert('Invalid', 'Enter a valid stock count (0 or more)');
      return;
    }
    onSave(item.id, n);
    onClose();
  };

  if (!item) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.quickModal}>
          {/* Item name */}
          <Text style={styles.quickModalTitle}>{item.product_name}</Text>
          <Text style={styles.quickModalSub}>
            Current stock: <Text style={{ color: Colors.text, fontFamily: Typography.fontFamily.bold }}>
              {item.stock_count} {item.unit || 'units'}
            </Text>
          </Text>

          {/* Input */}
          <View style={styles.quickInputWrap}>
            <Text style={styles.quickInputLabel}>New stock count</Text>
            <TextInput
              style={styles.quickInput}
              value={value}
              onChangeText={setValue}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
              placeholder="0"
              placeholderTextColor={Colors.textTertiary}
            />
          </View>

          {/* Quick-set buttons */}
          <View style={styles.quickPresets}>
            {[0, 5, 10, 25, 50, 100].map(n => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.preset,
                  parseInt(value, 10) === n && styles.presetActive,
                ]}
                onPress={() => { Haptics.selectionAsync(); setValue(String(n)); }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.presetText,
                  parseInt(value, 10) === n && styles.presetTextActive,
                ]}>
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Buttons */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>Update Stock</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Full Edit Sheet ───────────────────────────────────────────
function FullEditSheet({ item, visible, onClose, onSave }) {
  const [form, setForm] = useState({
    stock_count:        0,
    price_paise:        0,
    is_available:       true,
    low_stock_threshold: 10,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && item) {
      setForm({
        stock_count:        item.stock_count ?? 0,
        price_paise:        item.price_paise ?? 0,
        is_available:       item.is_available ?? true,
        low_stock_threshold: item.low_stock_threshold ?? 10,
      });
    }
  }, [visible, item]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(item.id, form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.editSheet}>
          <View style={styles.editHeader}>
            <Text style={styles.editTitle} numberOfLines={1}>{item.product_name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Price */}
          <View style={styles.editField}>
            <Text style={styles.fieldLabel}>Price per unit</Text>
            <View style={styles.priceInput}>
              <Text style={styles.pricePrefix}>₹</Text>
              <TextInput
                style={styles.fieldInput}
                value={String(Math.round(form.price_paise / 100))}
                onChangeText={v => setForm(f => ({ ...f, price_paise: (parseInt(v, 10) || 0) * 100 }))}
                keyboardType="number-pad"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
          </View>

          {/* Stock count */}
          <View style={styles.editField}>
            <Text style={styles.fieldLabel}>Stock count</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputStandalone]}
              value={String(form.stock_count)}
              onChangeText={v => setForm(f => ({ ...f, stock_count: parseInt(v, 10) || 0 }))}
              keyboardType="number-pad"
              placeholderTextColor={Colors.textTertiary}
            />
          </View>

          {/* Low stock threshold */}
          <View style={styles.editField}>
            <Text style={styles.fieldLabel}>Low stock alert at</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputStandalone]}
              value={String(form.low_stock_threshold)}
              onChangeText={v => setForm(f => ({ ...f, low_stock_threshold: parseInt(v, 10) || 5 }))}
              keyboardType="number-pad"
              placeholderTextColor={Colors.textTertiary}
            />
          </View>

          {/* Available toggle */}
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.fieldLabel}>Available for orders</Text>
              <Text style={styles.toggleSub}>
                {form.is_available ? 'Customers can order this item' : 'Hidden from customers'}
              </Text>
            </View>
            <Switch
              value={form.is_available}
              onValueChange={v => setForm(f => ({ ...f, is_available: v }))}
              trackColor={{ false: Colors.border, true: Colors.success }}
              thumbColor="#fff"
            />
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveBtn, { marginTop: 20 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Inventory Item Card ───────────────────────────────────────
function InventoryCard({ item, onQuickUpdate, onFullEdit }) {
  const status = stockStatus(item);
  const style  = STOCK_STYLES[status];

  return (
    <View style={[styles.invCard, !item.is_available && styles.invCardDisabled]}>
      <View style={styles.invCardLeft}>
        {/* Product name + status */}
        <View style={styles.invNameRow}>
          <Text style={styles.invName} numberOfLines={1}>{item.product_name}</Text>
          <View style={[styles.invStatusDot, { backgroundColor: style.bg }]}>
            <Ionicons name={style.icon} size={12} color={style.iconColor} />
          </View>
        </View>

        {/* Price */}
        <Text style={styles.invPrice}>{fmtPaise(item.price_paise)} / {item.unit || 'unit'}</Text>

        {/* Stock count */}
        <Text style={[styles.invStock, { color: style.textColor }]}>
          {!item.is_available
            ? '🚫 Hidden from customers'
            : item.stock_count === 0
            ? '❌ Out of stock'
            : `${style.icon === 'warning' ? '🔴 ' : '✓ '}${item.stock_count} ${item.unit || 'units'} in stock`}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.invCardActions}>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => onQuickUpdate(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={14} color={Colors.primary} />
          <Text style={styles.quickBtnText}>Update</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => onFullEdit(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil-outline" size={14} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function ShopInventoryScreen() {
  const [items,         setItems]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [search,        setSearch]        = useState('');
  const [filter,        setFilter]        = useState('all'); // all | low | out
  const [quickItem,     setQuickItem]     = useState(null);
  const [editItem,      setEditItem]      = useState(null);

  // ── Load ────────────────────────────────────────────────
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getShopInventory({ limit: 200 });
      setItems(Array.isArray(data) ? data : (data?.items || []));
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filter + search ─────────────────────────────────────
  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'low') list = list.filter(i => stockStatus(i) === 'low');
    if (filter === 'out') list = list.filter(i => stockStatus(i) === 'out');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i => i.product_name?.toLowerCase().includes(q));
    }
    return list;
  }, [items, filter, search]);

  const lowCount = useMemo(() => items.filter(i => stockStatus(i) === 'low').length, [items]);
  const outCount = useMemo(() => items.filter(i => stockStatus(i) === 'out').length, [items]);

  // ── Quick stock update ───────────────────────────────────
  const handleQuickSave = useCallback(async (itemId, stockCount) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await updateInventoryItem(itemId, { stock_count: stockCount });
      setItems(prev =>
        prev.map(i => i.id === itemId ? { ...i, stock_count: stockCount } : i)
      );
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, []);

  // ── Full edit ────────────────────────────────────────────
  const handleFullSave = useCallback(async (itemId, data) => {
    try {
      await updateInventoryItem(itemId, data);
      setItems(prev =>
        prev.map(i => i.id === itemId ? { ...i, ...data } : i)
      );
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }, []);

  // ── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading inventory…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.invHeader}>
        <Text style={styles.invTitle}>Inventory</Text>
        <Text style={styles.invSub}>{items.length} products</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={Colors.textTertiary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search products…"
          placeholderTextColor={Colors.textTertiary}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {[
          { key: 'low',  label: `🔴 Low (${lowCount})` },
          { key: 'all',  label: `All (${items.length})` },
          { key: 'out',  label: `Out (${outCount})` },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setFilter(tab.key)}
            style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabText, filter === tab.key && styles.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <InventoryCard
            item={item}
            onQuickUpdate={setQuickItem}
            onFullEdit={setEditItem}
          />
        )}
        contentContainerStyle={styles.invList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No items found</Text>
            <Text style={styles.emptySub}>
              {search ? 'Try a different search term' : 'Add products from the web dashboard first'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Quick Update Modal */}
      <QuickUpdateModal
        item={quickItem}
        visible={!!quickItem}
        onClose={() => setQuickItem(null)}
        onSave={handleQuickSave}
      />

      {/* Full Edit Sheet */}
      <FullEditSheet
        item={editItem}
        visible={!!editItem}
        onClose={() => setEditItem(null)}
        onSave={handleFullSave}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  loadingText: { marginTop: 12, fontFamily: Typography.fontFamily.medium, color: Colors.textSecondary },

  invHeader: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 4 },
  invTitle:  { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.text },
  invSub:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.md, marginVertical: Spacing.xs,
    backgroundColor: Colors.surface2, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.size.md,
    color: Colors.text,
  },

  filterTabs:         { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: 8, marginBottom: 8 },
  filterTab:          {
    flex: 1, paddingVertical: 8, borderRadius: BorderRadius.md, alignItems: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterTabActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterTabText:      { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  filterTabTextActive:{ color: '#fff' },

  invList: { paddingHorizontal: Spacing.md, paddingBottom: 100, gap: 8 },

  invCard: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.md,
    padding:         Spacing.md,
    flexDirection:   'row', alignItems: 'center',
    ...Shadow.sm,
  },
  invCardDisabled: { opacity: 0.6 },
  invCardLeft:     { flex: 1, gap: 3 },
  invNameRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invName:         { flex: 1, fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: Colors.text },
  invStatusDot:    { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  invPrice:        { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary },
  invStock:        { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm },

  invCardActions:  { alignItems: 'center', gap: 8, marginLeft: 12 },
  quickBtn:        {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primary + '30',
  },
  quickBtnText:    { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xs, color: Colors.primary },
  editBtn:         {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
  },

  empty:      { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:  { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontFamily: Typography.fontFamily.bold,   fontSize: Typography.size.lg,  color: Colors.text, marginBottom: 6 },
  emptySub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', maxWidth: 250 },

  // Modal overlay
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },

  // Quick Update Modal
  quickModal: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40, gap: 16,
  },
  quickModalTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text },
  quickModalSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.md, color: Colors.textSecondary, marginTop: -8 },
  quickInputWrap:  { gap: 6 },
  quickInputLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  quickInput:      {
    fontSize: 42, fontFamily: Typography.fontFamily.bold, color: Colors.text,
    textAlign: 'center', paddingVertical: 12,
    backgroundColor: Colors.surface2, borderRadius: BorderRadius.md,
    borderWidth: 2, borderColor: Colors.primary,
  },
  quickPresets:    { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  preset:          {
    flex: 1, paddingVertical: 10, borderRadius: BorderRadius.sm, alignItems: 'center',
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
  },
  presetActive:    { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  presetText:      { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.textSecondary },
  presetTextActive:{ color: Colors.primary },
  quickActions:    { flexDirection: 'row', gap: 12 },

  // Full Edit Sheet
  editSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40, gap: 16,
    maxHeight: '90%',
  },
  editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editTitle:  { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.lg, color: Colors.text, flex: 1, marginRight: 12 },
  editField:  { gap: 6 },
  fieldLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.textSecondary },
  priceInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface2, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  pricePrefix: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.xl, color: Colors.textSecondary, marginRight: 6 },
  fieldInput: {
    flex: 1, fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xl, color: Colors.text,
    paddingVertical: 12,
  },
  fieldInputStandalone: {
    backgroundColor: Colors.surface2, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
    fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.xl, color: Colors.text,
    paddingVertical: 12,
  },
  toggleRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleSub:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },

  // Shared buttons
  cancelBtn:      {
    flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md, alignItems: 'center',
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
  },
  cancelBtnText:  { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: Colors.textSecondary },
  saveBtn:        {
    flex: 1, paddingVertical: 14, borderRadius: BorderRadius.md, alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  saveBtnText:    { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.md, color: '#fff' },
});
