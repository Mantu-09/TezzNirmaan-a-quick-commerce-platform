// ────────────────────────────────────────────────────────────
// ContractorInvoicesScreen — P6-6
// Lists all GST invoices for a verified contractor.
// ────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import { listInvoices } from '../../api/b2b';
import { formatPaise } from '../../utils/money';

const fmt = {
  date: (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
};

function InvoiceCard({ invoice }) {
  const b2bOrder   = invoice.b2b_orders;
  const status     = b2bOrder?.payment_status || 'pending';
  const statusMap  = {
    pending:  { label: 'Pending',  color: Colors.warning,  bg: Colors.warningLight },
    paid:     { label: 'Paid ✓',   color: Colors.success,  bg: Colors.successLight },
    overdue:  { label: 'Overdue',  color: Colors.error,    bg: Colors.errorLight ?? '#fef2f2' },
  };
  const s = statusMap[status] || statusMap.pending;

  const handleDownload = async () => {
    if (!invoice.pdf_url) {
      Alert.alert('PDF Not Ready', 'The invoice PDF is being generated. Please try again in a moment.');
      return;
    }
    try {
      await Linking.openURL(invoice.pdf_url);
    } catch {
      Alert.alert('Error', 'Could not open the PDF. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.invoiceNum}>{invoice.invoice_number}</Text>
          <Text style={styles.invoiceDate}>{fmt.date(invoice.issued_at)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: s.bg }]}>
          <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <View>
          <Text style={styles.amountLabel}>Subtotal</Text>
          <Text style={styles.amountVal}>{formatPaise(invoice.subtotal_paise)}</Text>
        </View>
        <View style={styles.amountDivider} />
        <View>
          <Text style={styles.amountLabel}>GST ({invoice.gst_rate}%)</Text>
          <Text style={styles.amountVal}>{formatPaise(invoice.gst_amount_paise)}</Text>
        </View>
        <View style={styles.amountDivider} />
        <View>
          <Text style={styles.amountLabel}>Total</Text>
          <Text style={[styles.amountVal, { color: Colors.text, fontFamily: Typography.fontFamily.bold }]}>
            {formatPaise(invoice.total_paise)}
          </Text>
        </View>
      </View>

      {b2bOrder?.po_number && (
        <Text style={styles.poNum}>PO: {b2bOrder.po_number}</Text>
      )}
      {b2bOrder?.due_date && status !== 'paid' && (
        <Text style={[styles.dueDate, status === 'overdue' && { color: Colors.error }]}>
          Due: {b2bOrder.due_date}
        </Text>
      )}

      <TouchableOpacity style={styles.downloadBtn} onPress={handleDownload} activeOpacity={0.7}>
        <Ionicons name="download-outline" size={16} color={Colors.primary} />
        <Text style={styles.downloadText}>Download PDF Invoice</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ContractorInvoicesScreen() {
  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError,
  } = useInfiniteQuery({
    queryKey: ['contractor-invoices'],
    queryFn:  ({ pageParam = 1 }) => listInvoices(pageParam),
    getNextPageParam: (lastPage) =>
      lastPage?.hasMore ? lastPage.page + 1 : undefined,
  });

  const invoices = data?.pages?.flatMap(p => p.invoices) || [];

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={styles.errorText}>Failed to load invoices.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={invoices}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <InvoiceCard invoice={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.3}
        ListFooterComponent={isFetchingNextPage
          ? <ActivityIndicator color={Colors.primary} style={{ padding: Spacing[4] }} />
          : null
        }
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Invoices Yet</Text>
            <Text style={styles.emptySub}>GST invoices appear here after your first B2B order.</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.background },
  list:  { padding: Spacing[4] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: Colors.surface,
    borderRadius:    BorderRadius.xl,
    padding:         Spacing[4],
    marginBottom:    Spacing[3],
    ...Shadow.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing[3] },
  invoiceNum: {
    fontFamily:   Typography.fontFamily.bold,
    fontSize:     Typography.size.base,
    color:        Colors.text,
    marginBottom: 2,
  },
  invoiceDate: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
  },
  badge: {
    borderRadius:      BorderRadius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical:   Spacing[1],
    alignSelf:         'flex-start',
  },
  badgeText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.xs,
  },

  amountRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    backgroundColor: Colors.background,
    borderRadius:    BorderRadius.lg,
    padding:         Spacing[3],
    marginBottom:    Spacing[3],
  },
  amountDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  amountLabel: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
    marginBottom: 2,
    textAlign:  'center',
  },
  amountVal: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      Colors.textSecondary,
    textAlign:  'center',
  },

  poNum: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.xs,
    color:      Colors.textSecondary,
    marginBottom: 2,
  },
  dueDate: {
    fontFamily: Typography.fontFamily.medium,
    fontSize:   Typography.size.xs,
    color:      Colors.warning,
    marginBottom: Spacing[2],
  },

  downloadBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop:     Spacing[3],
    marginTop:      Spacing[1],
  },
  downloadText: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.sm,
    color:      Colors.primary,
  },

  errorText: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.error,
    marginTop:  Spacing[3],
  },
  empty: { alignItems: 'center', paddingTop: 64 },
  emptyTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize:   Typography.size.lg,
    color:      Colors.textSecondary,
    marginTop:  Spacing[3],
  },
  emptySub: {
    fontFamily: Typography.fontFamily.regular,
    fontSize:   Typography.size.sm,
    color:      Colors.textTertiary,
    marginTop:  Spacing[2],
    textAlign:  'center',
    paddingHorizontal: Spacing[6],
  },
});
