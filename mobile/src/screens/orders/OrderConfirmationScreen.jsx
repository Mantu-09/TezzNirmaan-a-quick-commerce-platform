import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Animated, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ordersApi from '../../api/orders';
import SubOrderCard from '../../components/order/SubOrderCard';
import Button from '../../components/common/Button';
import { formatOrderTime } from '../../utils/date';
import { formatPaise } from '../../utils/money';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme';

function SuccessCheckmark() {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      tension: 80,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.checkmarkOuter, { transform: [{ scale }] }]}>
      <View style={styles.checkmarkInner}>
        <Ionicons name="checkmark" size={44} color="#fff" />
      </View>
    </Animated.View>
  );
}

export default function OrderConfirmationScreen({ route, navigation }) {
  const { orderId } = route.params;

  const { data, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn:  () => ordersApi.getOrder(orderId),
    staleTime: 0,
  });

  const order     = data?.order;
  const subOrders = order?.sub_orders || [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Success animation */}
        <View style={styles.heroSection}>
          <SuccessCheckmark />
          <Text style={styles.heroTitle}>Order Placed!</Text>
          <Text style={styles.heroSub}>
            {order?.order_number
              ? `Order #${order.order_number}`
              : 'Your order has been received'}
          </Text>
          {order?.created_at && (
            <Text style={styles.heroTime}>{formatOrderTime(order.created_at)}</Text>
          )}
        </View>

        {/* Mixed-tier info banner */}
        {subOrders.length > 1 && (
          <View style={styles.splitBanner}>
            <Text style={styles.splitTitle}>You have {subOrders.length} deliveries on the way</Text>
            <Text style={styles.splitSub}>
              Track each delivery separately using the cards below.
            </Text>
          </View>
        )}

        {/* Sub-order cards */}
        {isLoading ? (
          <View style={styles.loadingBox}>
            <Ionicons name="hourglass-outline" size={32} color={Colors.textTertiary} />
            <Text style={styles.loadingText}>Loading order details…</Text>
          </View>
        ) : (
          subOrders.map(sub => (
            <SubOrderCard key={sub.id} subOrder={sub} />
          ))
        )}

        {/* Total */}
        {order && (
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total Paid</Text>
            <Text style={styles.totalValue}>{formatPaise(order.total_amount)}</Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => navigation.navigate('OrderTracking', { orderId })}
          >
            Track Order{subOrders.length > 1 ? 's' : ''}
          </Button>
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => navigation.navigate('HomeTab')}
          >
            <Text style={styles.continueBtnText}>Continue Shopping</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[4], paddingBottom: Spacing[8] },

  heroSection: { alignItems: 'center', paddingVertical: Spacing[8] },
  checkmarkOuter: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.successLight, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing[5],
  },
  checkmarkInner: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size['3xl'], color: Colors.text },
  heroSub:   { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.md, color: Colors.textSecondary, marginTop: Spacing[2] },
  heroTime:  { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: Spacing[1] },

  splitBanner: {
    backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[4],
    borderWidth: 1, borderColor: Colors.primary,
  },
  splitTitle: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.primary, marginBottom: 4 },
  splitSub:   { fontFamily: Typography.fontFamily.regular,  fontSize: Typography.size.sm,   color: Colors.textSecondary },

  loadingBox:  { alignItems: 'center', padding: Spacing[8], gap: Spacing[3] },
  loadingText: { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.base, color: Colors.textTertiary },

  totalBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing[5], marginBottom: Spacing[5],
  },
  totalLabel: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: Colors.text },
  totalValue: { fontFamily: Typography.fontFamily.bold,    fontSize: Typography.size.xl,  color: Colors.text },

  actions:        { gap: Spacing[3] },
  continueBtn:    { alignItems: 'center', padding: Spacing[4] },
  continueBtnText: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.base, color: Colors.primary },
});
