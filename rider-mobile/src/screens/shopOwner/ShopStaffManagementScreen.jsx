// ────────────────────────────────────────────────────────────
// ShopStaffManagementScreen.jsx — Phase C
//
// Allows shop_owner to view their staff members and
// deactivate/reactivate them.
// Staff can be added via the admin (platform_admin only).
//
// API:
//   GET  /shop/staff             — list staff members
//   PATCH /shop/staff/:id/toggle — activate/deactivate
// ────────────────────────────────────────────────────────────
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView }  from 'react-native-safe-area-context';
import { Ionicons }      from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { client }        from '../../api/client';

function StaffCard({ item, onToggle }) {
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(item.full_name || 'S').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.name}>{item.full_name || 'Staff Member'}</Text>
        <Text style={styles.phone}>{item.phone}</Text>
        <Text style={[styles.status, { color: item.is_active ? Colors.success : Colors.error }]}>
          {item.is_active ? '● Active' : '○ Inactive'}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onToggle(item)}
        style={[styles.toggleBtn, { backgroundColor: item.is_active ? '#fef2f2' : '#f0fdf4' }]}
      >
        <Ionicons
          name={item.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
          size={22}
          color={item.is_active ? Colors.error : Colors.success}
        />
      </TouchableOpacity>
    </View>
  );
}

export default function ShopStaffManagementScreen({ navigation }) {
  const [staff,     setStaff]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data } = await client.get('/shop/staff');
      setStaff(data?.staff || []);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, []);

  const handleToggle = useCallback((item) => {
    const nextState = !item.is_active;
    Alert.alert(
      nextState ? 'Activate Staff?' : 'Deactivate Staff?',
      `${nextState ? 'Allow' : 'Prevent'} ${item.full_name} from accessing the shop dashboard?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextState ? 'Activate' : 'Deactivate',
          style: nextState ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await client.patch(`/shop/staff/${item.id}/toggle`, { is_active: nextState });
              setStaff(prev => prev.map(s => s.id === item.id ? { ...s, is_active: nextState } : s));
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to update staff.');
            }
          },
        },
      ]
    );
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation?.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Staff</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Management</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
        <Text style={styles.infoText}>
          To add new staff members, contact your TezzNirmaan account manager.
        </Text>
      </View>

      <FlatList
        data={staff}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <StaffCard item={item} onToggle={handleToggle} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No staff added yet</Text>
            <Text style={styles.emptySub}>Staff accounts are created by the admin</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: Colors.background },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  headerTitle:  { fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.text },
  infoBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.primary + '10', margin: Spacing.md, padding: 12, borderRadius: BorderRadius.md },
  infoText:     { fontFamily: Typography.fontFamily.regular, fontSize: 12, color: Colors.primary, flex: 1, lineHeight: 18 },
  list:         { padding: Spacing.md, gap: 10, paddingBottom: 32 },
  card:         { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, padding: 14, borderRadius: BorderRadius.lg, ...Shadow.sm },
  avatar:       { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary + '20', justifyContent: 'center', alignItems: 'center' },
  avatarText:   { fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.primary },
  name:         { fontFamily: Typography.fontFamily.semibold, fontSize: 14, color: Colors.text },
  phone:        { fontFamily: Typography.fontFamily.regular, fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  status:       { fontFamily: Typography.fontFamily.semibold, fontSize: 11, marginTop: 4 },
  toggleBtn:    { padding: 8, borderRadius: BorderRadius.md },
  empty:        { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:    { fontSize: 48, marginBottom: 12 },
  emptyTitle:   { fontFamily: Typography.fontFamily.bold, fontSize: 18, color: Colors.text },
  emptySub:     { fontFamily: Typography.fontFamily.regular, fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
});
