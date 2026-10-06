/**
 * Shows borrower repayments still awaiting operations confirmation.
 * Mirrors the web portal PendingPaymentsCard.
 */

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Radius } from '@/constants/theme';
import * as data from '@/lib/data';
import type { PendingCustomerPayment } from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';

function methodLabel(method?: string | null): string {
  switch ((method || '').toUpperCase()) {
    case 'CLIENT_DIRECT_DEPOSIT':
      return 'Direct deposit';
    case 'GROUP_CHAIRPERSON_DEPOSIT':
      return 'Group chair deposit';
    case 'MOBILE_APP':
      return 'In-app payment';
    case 'MOBILE_MONEY':
      return 'Mobile money';
    default:
      return method || 'Payment';
  }
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return value;
  return new Date(t).toLocaleDateString('en-MW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PendingPaymentsCard() {
  const [items, setItems] = useState<PendingCustomerPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await data.getPendingCustomerPayments());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={ClientUI.colors.primary} />
        <ThemedText style={styles.muted}>Loading pending payments…</ThemedText>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialIcons name="hourglass-top" size={18} color={ClientUI.colors.primary} />
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Awaiting confirmation ({items.length})
        </ThemedText>
        <Pressable onPress={() => void load()} hitSlop={8}>
          <MaterialIcons name="refresh" size={18} color={ClientUI.colors.textMuted} />
        </Pressable>
      </View>
      <ThemedText style={styles.muted}>
        These payments are saved and will post to your loan after CoFi verifies them.
      </ThemedText>
      {items.map((p) => {
        const amount = Number(p.amount_minor ?? p.total_amount ?? 0);
        return (
          <View key={p.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">{formatMinorMWK(amount)}</ThemedText>
              <ThemedText style={styles.muted}>
                {methodLabel(p.payment_method)}
                {p.reference_number || p.deposit_receipt_number
                  ? ` · ${p.reference_number || p.deposit_receipt_number}`
                  : ''}
              </ThemedText>
              <ThemedText style={styles.muted}>
                {formatDate(p.payment_date || p.repayment_date || p.created_at)}
                {p.lifecycle_state || p.internal_status
                  ? ` · ${p.lifecycle_state || p.internal_status}`
                  : ''}
              </ThemedText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: ClientUI.colors.surface,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 15 },
  muted: { fontSize: 12, color: ClientUI.colors.textMuted, lineHeight: 17 },
  row: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ClientUI.colors.border,
  },
});
