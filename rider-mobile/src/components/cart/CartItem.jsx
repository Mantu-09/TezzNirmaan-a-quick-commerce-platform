import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { formatPaise } from '../../utils/money';
import { Colors, Typography, BorderRadius, Spacing } from '../../theme';
import useCartStore from '../../store/cartStore';

export default function CartItem({ item }) {
  const { updateQuantity, removeItem } = useCartStore();
  const lineTotalPaise = item.unitPricePaise * item.quantity;

  return (
    <View style={styles.row}>
      {/* Product image */}
      <Image
        source={item.imageUrl || require('../../../assets/placeholder.png')}
        style={styles.image}
        contentFit="cover"
        transition={150}
      />

      {/* Details */}
      <View style={styles.details}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.unit}>{item.unit} · {formatPaise(item.unitPricePaise)} each</Text>

        <View style={styles.bottomRow}>
          {/* Quantity control */}
          <View style={styles.qtyControl}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => updateQuantity(item.productId, item.quantity - 1)}
            >
              {item.quantity === 1
                ? <Ionicons name="trash-outline" size={14} color={Colors.error} />
                : <Ionicons name="remove" size={14} color={Colors.primary} />
              }
            </TouchableOpacity>
            <Text style={styles.qty}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => updateQuantity(item.productId, item.quantity + 1)}
            >
              <Ionicons name="add" size={14} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Line total */}
          <Text style={styles.lineTotal}>{formatPaise(lineTotalPaise)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:   'row',
    paddingVertical: Spacing[3],
    gap:             Spacing[3],
    alignItems:      'flex-start',
  },
  image: {
    width:        70,
    height:       70,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surface2,
  },
  details: { flex: 1 },
  name:    { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base, color: Colors.text, marginBottom: 2 },
  unit:    { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, marginBottom: Spacing[2] },

  bottomRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyControl: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.lg,
    paddingHorizontal: 6, paddingVertical: 4, gap: 8,
  },
  qtyBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  qty:    { fontFamily: Typography.fontFamily.bold, fontSize: Typography.size.base, color: Colors.text, minWidth: 20, textAlign: 'center' },
  lineTotal: { fontFamily: Typography.fontFamily.semiBold, fontSize: Typography.size.md, color: Colors.text },
});
