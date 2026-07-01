import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ordersApi from '../../api/orders';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { Colors, Typography, Spacing, BorderRadius } from '../../theme';

const ADDRESS_LABELS = ['home', 'work', 'other'];

export default function AddressScreen({ navigation }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    recipient_name: '',
    recipient_phone: '',
    address_line1: '',
    address_line2: '',
    landmark: '',
    city: 'Patna',
    state: 'Bihar',
    pin_code: '',
    label: 'home',
    is_default: false,
  });
  const [errors, setErrors] = useState({});

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.recipient_name.trim()) e.recipient_name = 'Name is required';
    if (!/^\d{10}$/.test(form.recipient_phone.trim())) e.recipient_phone = 'Enter a valid 10-digit number';
    if (!form.address_line1.trim()) e.address_line1 = 'Address line 1 is required';
    if (!/^\d{6}$/.test(form.pin_code.trim())) e.pin_code = 'Enter a valid 6-digit PIN code';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const mutation = useMutation({
    mutationFn: () => ordersApi.createAddress({
      ...form,
      recipient_phone: `+91${form.recipient_phone.trim()}`,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      navigation.goBack();
    },
    onError: (e) => Alert.alert('Error', e.message || 'Failed to save address'),
  });

  const handleSave = () => {
    if (validate()) mutation.mutate();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Label selector */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Address Type</Text>
            <View style={styles.labelRow}>
              {ADDRESS_LABELS.map(l => (
                <TouchableOpacity
                  key={l}
                  style={[styles.labelChip, form.label === l && styles.labelChipActive]}
                  onPress={() => set('label', l)}
                >
                  <Text style={[styles.labelChipText, form.label === l && styles.labelChipTextActive]}>
                    {l === 'home' ? '🏠 Home' : l === 'work' ? '💼 Work' : '📍 Other'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Input label="Full Name *"          value={form.recipient_name}  onChangeText={v => set('recipient_name', v)}  error={errors.recipient_name} placeholder="Ramesh Kumar" />
          <Input label="Mobile Number *"      value={form.recipient_phone} onChangeText={v => set('recipient_phone', v.replace(/\D/g,''))} keyboardType="phone-pad" maxLength={10} prefix="+91" error={errors.recipient_phone} placeholder="XXXXXXXXXX" />
          <Input label="Address Line 1 *"     value={form.address_line1}   onChangeText={v => set('address_line1', v)}   error={errors.address_line1}  placeholder="House / Flat no., Street name" />
          <Input label="Address Line 2"       value={form.address_line2}   onChangeText={v => set('address_line2', v)}   placeholder="Colony / Locality (optional)" />
          <Input label="Landmark"             value={form.landmark}         onChangeText={v => set('landmark', v)}        placeholder="Near school, hospital etc." />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: Spacing[3] }}>
              <Input label="City"     value={form.city}     onChangeText={v => set('city', v)}  />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="State"    value={form.state}    onChangeText={v => set('state', v)} />
            </View>
          </View>

          <Input label="PIN Code *" value={form.pin_code} onChangeText={v => set('pin_code', v.replace(/\D/,''))} keyboardType="number-pad" maxLength={6} error={errors.pin_code} placeholder="800001" />

          {/* Default toggle */}
          <View style={styles.defaultRow}>
            <View>
              <Text style={styles.defaultTitle}>Set as default address</Text>
              <Text style={styles.defaultSub}>Used automatically at checkout</Text>
            </View>
            <Switch
              value={form.is_default}
              onValueChange={v => set('is_default', v)}
              trackColor={{ true: Colors.primary, false: Colors.border }}
              thumbColor="#fff"
            />
          </View>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={mutation.isPending}
            onPress={handleSave}
            style={{ marginTop: Spacing[4] }}
          >
            Save Address
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing[4], paddingBottom: Spacing[10] },

  section:      { marginBottom: Spacing[4] },
  sectionLabel: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text, marginBottom: Spacing[2] },

  labelRow:          { flexDirection: 'row', gap: Spacing[3] },
  labelChip:         { flex: 1, paddingVertical: Spacing[2], borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.surface },
  labelChipActive:   { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  labelChipText:     { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.sm, color: Colors.text },
  labelChipTextActive: { color: Colors.primary },

  row: { flexDirection: 'row' },

  defaultRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing[4], marginBottom: Spacing[2],
  },
  defaultTitle: { fontFamily: Typography.fontFamily.medium, fontSize: Typography.size.base, color: Colors.text },
  defaultSub:   { fontFamily: Typography.fontFamily.regular, fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
});
