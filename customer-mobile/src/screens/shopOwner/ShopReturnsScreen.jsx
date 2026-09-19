// ────────────────────────────────────────────────────────────
// ShopReturnsScreen.jsx — Phase C
//
// Lets shop owners view and action customer return requests.
//
// Returns flow:
//   Customer raises return → shop sees it → Approve / Reject
//   On approve → triggers refund + restocks inventory
//
// API:
//   GET   /shop/returns?status=pending&page=1
//   PATCH /shop/returns/:id/approve
//   PATCH /shop/returns/:id/reject  { reason }
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, TextInput, Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView }  from 'react-native-safe-area-context';
import { Ionicons }      from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { client }        from '../../api/client';

const TABS = ['Pending', 'Approved', 'Rejected'];

function fmt(paise) {
  return `₹${Math.floor((paise || 0) / 100).toLocaleString('en-IN')}`;
}

function ReturnCard({ item, onApprove, onReject }) {
  const isPending = item.status === 'pending';
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.orderId}>Order #{item.order_number || item.id?.slice(0, 8)}</Text>
          <Text style={styles.date}>{item.created_at ? new Date(item.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : ''}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'approved' ? '#f0fdf4' : item.status === 'rejected' ? '#fef2f2' : '#fefce8' }]}>
          <Text style={[styles.statusText, { color: item.status === 'approved' ? '#16a34a' : item.status === 'rejected' ? '#dc2626' : '#ca8a04' }]}>
            {item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}
          </Text>
        </View>
      </View>

      {/* Items */}
      {(item.items || []).map((line, i) => (
        <View key={i} style={styles.lineItem}>
          <Text style={styles.productName}>{line.product_name}</Text>
          <Text style={styles.lineQty}>×{line.qty}  {fmt(line.refund_paise)}</Text>
        </View>
      ))}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total Refund</Text>
        <Text style={styles.totalValue}>{fmt(item.total_refund_paise)}</Text>
      </View>

      {/* Reason */}
      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>Customer Reason:</Text>
        <Text style={styles.reasonText}>{item.reason || 'Not specified'}</Text>
      </View>

      {/* Actions (only for pending) */}
      {isPending && (
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => onReject(item)}
            style={[styles.actionBtn, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}
          >
            <Ionicons name="close-circle-outline" size={18} color="#dc2626" />
            <Text style={[styles.actionText, { color: '#dc2626' }]}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onApprove(item)}
            style={[styles.actionBtn, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#16a34a" />
            <Text style={[styles.actionText, { color: '#16a34a' }]}>Approve</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ShopReturnsScreen({ navigation }) {
  const [activeTab,  setActiveTab]  = useState('Pending');
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Reject modal
  const [rejectModal, setRejectModal]   = useState(false);
  const [rejectItem,  setRejectItem]    = useState(null);
  const [rejectReason,setRejectReason]  = useState('');
  const [actioning,   setActioning]     = useState(false);

  const load = useCallback(async (tab = activeTab, refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const status = tab.toLowerCase();
      const { data } = await client.get(`/shop/returns?status=${status}&limit=30`);
      setItems(data?.returns || []);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  React.useEffect(() => { load(activeTab); }, [activeTab]);

  const handleApprove = useCallback((item) => {
    Alert.alert(
      'Approve Return?',
      `This will approve a refund of ${fmt(item.total_refund_paise)} to the customer.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setActioning(true);
            try {
              await client.patch(`/shop/returns/${item.id}/approve`);
              setItems(prev => prev.filter(r => r.id !== item.id));
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not approve return.');
            } finally {
              setActioning(false);
            }
          },
        },
      ]
    );
  }, []);

  const handleRejectOpen = useCallback((item) => {
    setRejectItem(item);
    setRejectReason('');
    setRejectModal(true);
  }, []);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectReason.trim()) { Alert.alert('Error', 'Please enter a reason for rejection.'); return; }
    setActioning(true);
    try {
      await client.patch(`/shop/returns/${rejectItem.id}/reject`, { reason: rejectReason.trim() });
      setItems(prev => prev.filter(r => r.id !== rejectItem.id));
      setRejectModal(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not reject return.');
    } finally {
      setActioning(false);
    }
  }, [rejectItem, rejectReason]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Returns</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ReturnCard item={item} onApprove={handleApprove} onReject={handleRejectOpen} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(activeTab, true)} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>No {activeTab.toLowerCase()} returns</Text>
            </View>
          }
        />
      )}

      {/* Reject Modal */}
      <Modal visible={rejectModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRejectModal(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Reject Return</Text>
            <TouchableOpacity onPress={() => setRejectModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSub}>Enter a reason that will be shared with the customer.</Text>
          <TextInput
            style={styles.rejectInput}
            value={rejectReason}
            onChangeText={setRejectReason}
            placeholder="e.g. Item is not eligible for return after 24 hours"
            placeholderTextColor={Colors.textSecondary}
            multiline
            numberOfLines={4}
            autoFocus
          />
          <TouchableOpacity
            onPress={handleRejectConfirm}
            disabled={actioning || !rejectReason.trim()}
            style={[styles.rejectBtn, actioning && { opacity: 0.5 }]}
          >
            {actioning ? <ActivityIndicator color="#fff" /> : <Text style={styles.rejectBtnText}>Confirm Rejection</Text>}
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Colors.background },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  headerTitle:   { fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.text },
  tabBar:        { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab:           { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText:       { fontFamily: Typography.fontFamily.semibold, fontSize: 13, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },
  list:          { padding: Spacing.md, gap: 12, paddingBottom: 32 },
  card:          { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, overflow: 'hidden', ...Shadow.sm },
  cardHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, paddingBottom: 10 },
  orderId:       { fontFamily: Typography.fontFamily.bold, fontSize: 14, color: Colors.text },
  date:          { fontFamily: Typography.fontFamily.regular, fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:    { fontFamily: Typography.fontFamily.bold, fontSize: 11 },
  lineItem:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 4 },
  productName:   { fontFamily: Typography.fontFamily.regular, fontSize: 13, color: Colors.text, flex: 1 },
  lineQty:       { fontFamily: Typography.fontFamily.semibold, fontSize: 13, color: Colors.textSecondary },
  totalRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.background },
  totalLabel:    { fontFamily: Typography.fontFamily.bold, fontSize: 13, color: Colors.text },
  totalValue:    { fontFamily: Typography.fontFamily.bold, fontSize: 15, color: Colors.primary },
  reasonBox:     { paddingHorizontal: 14, paddingBottom: 12 },
  reasonLabel:   { fontFamily: Typography.fontFamily.semibold, fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  reasonText:    { fontFamily: Typography.fontFamily.regular, fontSize: 13, color: Colors.text, lineHeight: 18 },
  actions:       { flexDirection: 'row', gap: 10, padding: 14, paddingTop: 4 },
  actionBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5 },
  actionText:    { fontFamily: Typography.fontFamily.bold, fontSize: 13 },
  empty:         { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.text },
  modal:         { flex: 1, padding: Spacing.md },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:    { fontFamily: Typography.fontFamily.bold, fontSize: 20, color: Colors.text },
  modalSub:      { fontFamily: Typography.fontFamily.regular, fontSize: 13, color: Colors.textSecondary, marginBottom: 16 },
  rejectInput:   { borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: 12, fontSize: 14, fontFamily: Typography.fontFamily.regular, color: Colors.text, textAlignVertical: 'top', minHeight: 120, marginBottom: 20 },
  rejectBtn:     { backgroundColor: '#dc2626', borderRadius: BorderRadius.lg, paddingVertical: 16, alignItems: 'center' },
  rejectBtnText: { fontFamily: Typography.fontFamily.bold, fontSize: 16, color: '#fff' },
});
