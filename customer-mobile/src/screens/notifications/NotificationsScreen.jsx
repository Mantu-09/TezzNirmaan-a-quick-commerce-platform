import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator,
  Animated, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors, Typography, Spacing } from '../../theme';
import { client } from '../../api/client';
import { subscribeToNotifications } from '../../utils/supabase';
import useAuthStore from '../../store/authStore';

// ── Notification type config ──────────────────────────────────
// Maps notification type → { icon, color, navigateTo }
const TYPE_CONFIG = {
  order_placed:     { icon: 'receipt',          color: '#6366F1', screen: 'OrderTracking' },
  order_confirmed:  { icon: 'checkmark-circle', color: '#10B981', screen: 'OrderTracking' },
  order_preparing:  { icon: 'cube',             color: '#F59E0B', screen: 'OrderTracking' },
  out_for_delivery: { icon: 'bicycle',          color: '#3B82F6', screen: 'OrderTracking' },
  delivered:        { icon: 'gift',             color: '#10B981', screen: 'OrderTracking' },
  order_rejected:   { icon: 'close-circle',     color: '#EF4444', screen: 'OrderTracking' },
  order_cancelled:  { icon: 'ban',              color: '#6B7280', screen: 'OrderTracking' },
  new_order:        { icon: 'bag',              color: '#6366F1', screen: null },
  new_assignment:   { icon: 'navigate',         color: '#3B82F6', screen: null },
  low_stock:        { icon: 'warning',          color: '#F59E0B', screen: null },
};

const DEFAULT_CONFIG = { icon: 'notifications', color: Colors.primary, screen: null };

function getRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── Individual notification row ───────────────────────────────
function NotificationItem({ item, onPress }) {
  const config     = TYPE_CONFIG[item.type] || DEFAULT_CONFIG;
  const fadeAnim   = useRef(new Animated.Value(item.is_read ? 1 : 0)).current;

  useEffect(() => {
    if (!item.is_read) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [item.is_read]);

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.item,
        !item.is_read && styles.itemUnread,
        pressed && styles.itemPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      {/* Icon bubble */}
      <View style={[styles.iconBubble, { backgroundColor: config.color + '20' }]}>
        <Ionicons name={config.icon} size={22} color={config.color} />
      </View>

      {/* Content */}
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={[styles.itemTitle, !item.is_read && styles.itemTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.itemTime}>{getRelativeTime(item.created_at)}</Text>
        </View>
        <Text style={styles.itemMessage} numberOfLines={2}>
          {item.message}
        </Text>
      </View>

      {/* Unread dot */}
      {!item.is_read && (
        <Animated.View style={[styles.unreadDot, { opacity: fadeAnim }]} />
      )}
    </Pressable>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="notifications-off-outline" size={48} color={Colors.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptySubtitle}>
        Order updates, delivery alerts and low-stock warnings will appear here.
      </Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function NotificationsScreen() {
  const navigation              = useNavigation();
  const { user }                = useAuthStore();
  const [notifications, setNotifications] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage]         = useState(1);
  const [hasMore, setHasMore]   = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // ── Fetch notifications from backend ─────────────────────────
  const fetchNotifications = useCallback(async (pg = 1, append = false) => {
    try {
      const res = await client.get('/customer/notifications', { params: { page: pg, limit: 20 } });
      const { notifications: items, pagination } = res;

      setNotifications(prev => append ? [...prev, ...items] : items);
      setHasMore(pagination.total > pg * pagination.limit);
      setUnreadCount(items.filter(n => !n.is_read).length); // approximate
    } catch (err) {
      console.error('[Notifications] fetch failed:', err.message);
    }
  }, []);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchNotifications(1).finally(() => setLoading(false));
  }, [fetchNotifications]);

  // ── Supabase Realtime — new notification arrives ──────────────
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = subscribeToNotifications(user.id, (newNotif) => {
      setNotifications(prev => [newNotif, ...prev]);
      setUnreadCount(c => c + 1);
    });

    return unsubscribe;
  }, [user?.id]);

  // ── Pull-to-refresh ────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchNotifications(1);
    setRefreshing(false);
  };

  // ── Infinite scroll ───────────────────────────────────────────
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchNotifications(nextPage, true);
    setLoadingMore(false);
  };

  // ── Mark all read ─────────────────────────────────────────────
  const handleMarkAllRead = async () => {
    try {
      await client.post('/customer/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('[Notifications] mark-all-read failed:', err.message);
    }
  };

  // ── Tap notification → navigate ───────────────────────────────
  const handlePress = async (item) => {
    // Mark as read
    if (!item.is_read) {
      try {
        await client.post('/customer/notifications/mark-read', { ids: [item.id] });
        setNotifications(prev =>
          prev.map(n => n.id === item.id ? { ...n, is_read: true } : n)
        );
        setUnreadCount(c => Math.max(0, c - 1));
      } catch (_) {}
    }

    // Navigate to relevant screen
    const config = TYPE_CONFIG[item.type];
    const orderId = item.metadata?.order_id;

    if (config?.screen === 'OrderTracking' && orderId) {
      navigation.navigate('OrdersTab', {
        screen:  'OrderTracking',
        params:  { orderId },
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header action bar */}
      {unreadCount > 0 && (
        <View style={styles.actionBar}>
          <Text style={styles.unreadLabel}>
            {unreadCount} unread
          </Text>
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
            <Ionicons name="checkmark-done" size={16} color={Colors.primary} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <NotificationItem item={item} onPress={handlePress} />
        )}
        ListEmptyComponent={<EmptyState />}
        ListFooterComponent={
          loadingMore
            ? <ActivityIndicator style={{ marginVertical: 16 }} color={Colors.primary} />
            : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loader: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.background,
  },
  list: {
    paddingBottom: 24,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  actionBar: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical:   10,
    backgroundColor:   Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  unreadLabel: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  markAllText: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.primary,
  },
  item: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical:   14,
    backgroundColor:   Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap:               12,
  },
  itemUnread: {
    backgroundColor: Colors.primary + '08',
  },
  itemPressed: {
    opacity: 0.75,
  },
  iconBubble: {
    width: 44, height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems:     'center',
    flexShrink: 0,
  },
  itemContent: {
    flex: 1,
    gap:  4,
  },
  itemHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    gap:            8,
  },
  itemTitle: {
    flex:       1,
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
  },
  itemTitleUnread: {
    fontFamily: Typography.fontFamily.semiBold,
    color:      Colors.text,
  },
  itemTime: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textTertiary,
    flexShrink: 0,
  },
  itemMessage: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    lineHeight: 20,
  },
  unreadDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop:       6,
    flexShrink:      0,
  },
  empty: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    paddingHorizontal: 40,
    paddingTop:        80,
    gap:               12,
  },
  emptyIcon: {
    width:  80, height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    justifyContent:  'center',
    alignItems:      'center',
    marginBottom:     8,
  },
  emptyTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.lg,
    color:      Colors.text,
    textAlign:  'center',
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 20,
  },
});
