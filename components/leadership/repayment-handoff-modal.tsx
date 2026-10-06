import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { AmountText } from '@/components/ui/amount-text';
import { StatusBadge } from '@/components/ui/list-card';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiGetRepaymentHandoffDetail,
  type ApiRepaymentHandoffDetail,
} from '@/lib/data/api';
import { getStoredAuth } from '@/lib/storage';

type Props = {
  visible: boolean;
  applicationId: number;
  onClose: () => void;
};

export function RepaymentHandoffModal({ visible, applicationId, onClose }: Props) {
  const [detail, setDetail] = useState<ApiRepaymentHandoffDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !applicationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    (async () => {
      try {
        const auth = await getStoredAuth();
        if (!auth?.token) throw new Error('You must be signed in.');
        const res = await apiGetRepaymentHandoffDetail(auth.token, applicationId);
        if (cancelled) return;
        if (!res) throw new Error('No repayment handoff record for this application.');
        setDetail(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, applicationId]);

  const loans = detail?.loans ?? [];
  const memberTotal = detail?.member_total_minor ?? 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.flex}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="defaultSemiBold" style={styles.headerTitle}>
              Repayment handoff
            </ThemedText>
            <ThemedText style={styles.headerSub}>
              Application #{applicationId} · {detail?.stage?.replace(/_/g, ' ') ?? 'origination'}
            </ThemedText>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <MaterialIcons name="close" size={22} color={CoFiColors.foreground} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={CoFiColors.primary} size="large" />
            <ThemedText style={styles.centerText}>Fetching handoff detail…</ThemedText>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <MaterialIcons name="error-outline" size={40} color={CoFiColors.destructive} />
            <ThemedText style={styles.centerText}>{error}</ThemedText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {detail?.client ? (
              <View style={styles.card}>
                <ThemedText type="defaultSemiBold">{detail.client.name}</ThemedText>
                {detail.client.client_number ? (
                  <ThemedText style={styles.muted}>{detail.client.client_number}</ThemedText>
                ) : null}
                {detail.client.is_group ? (
                  <ThemedText style={styles.muted}>
                    Group · {detail.client.member_count ?? 0} members
                  </ThemedText>
                ) : detail.client.client_type ? (
                  <ThemedText style={styles.muted}>{detail.client.client_type.replace(/_/g, ' ')}</ThemedText>
                ) : null}
                {detail.client.phone_number ? (
                  <ThemedText style={styles.muted}>{detail.client.phone_number}</ThemedText>
                ) : null}
                {detail.branch?.name ? <ThemedText style={styles.muted}>{detail.branch.name}</ThemedText> : null}
              </View>
            ) : null}

            {memberTotal > 0 ? (
              <View style={styles.totalRow}>
                <ThemedText style={styles.totalLabel}>Total exposure</ThemedText>
                <AmountText cents={memberTotal} style={styles.totalValue} />
              </View>
            ) : null}

            <ThemedText type="defaultSemiBold">
              Loans · {loans.length}
            </ThemedText>
            {loans.map((loan, index) => (
              <View key={String(loan.loan_id ?? index)} style={styles.loanCard}>
                <View style={styles.loanHeader}>
                  <ThemedText type="defaultSemiBold">
                    {loan.loan_account_number || `Loan #${loan.loan_id ?? index + 1}`}
                  </ThemedText>
                  {loan.status ? <StatusBadge status={loan.status} type="loan" /> : null}
                </View>
                {loan.client_name ? <ThemedText style={styles.muted}>{loan.client_name}</ThemedText> : null}
                {loan.first_disbursement_date ? (
                  <ThemedText style={styles.muted}>First draw: {loan.first_disbursement_date}</ThemedText>
                ) : null}
                <View style={styles.loanAmounts}>
                  <View>
                    <ThemedText style={styles.label}>Principal out</ThemedText>
                    <AmountText cents={loan.outstanding_principal_minor ?? 0} />
                  </View>
                  <View>
                    <ThemedText style={styles.label}>Interest out</ThemedText>
                    <AmountText cents={loan.outstanding_interest_minor ?? 0} />
                  </View>
                </View>
                {loan.next_due_date ? (
                  <ThemedText style={styles.muted}>
                    Next due {loan.next_due_date}
                    {loan.next_due_amount != null ? (
                      <>
                        {' · '}
                        {formatCents(loan.next_due_amount)}
                      </>
                    ) : null}
                  </ThemedText>
                ) : null}
              </View>
            ))}

            {loans.length === 0 ? (
              <ThemedText style={styles.empty}>No active loans in the handoff yet.</ThemedText>
            ) : null}

            {detail?.actions?.can_acknowledge ? (
              <ThemedText style={styles.note}>
                This handoff is ready for the operations manager to acknowledge on the BMS desktop.
              </ThemedText>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function formatCents(cents: number): string {
  const amount = cents / 100;
  return `MWK ${amount.toLocaleString('en-MW', { maximumFractionDigits: 0 })}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CoFiColors.backgroundCard },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: CoFiColors.border,
  },
  headerTitle: { fontSize: 16 },
  headerSub: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  closeBtn: { padding: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  centerText: { fontSize: 13, opacity: 0.8, textAlign: 'center' },
  body: { padding: 20, gap: 14, paddingBottom: 48 },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  muted: { fontSize: 13, opacity: 0.7 },
  label: { fontSize: 12, opacity: 0.65 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 61, 122, 0.08)',
    padding: 12,
    borderRadius: 12,
  },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalValue: { fontSize: 16, fontWeight: '700', color: CoFiColors.primary },
  loanCard: {
    backgroundColor: CoFiColors.backgroundCard,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  loanHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  loanAmounts: { flexDirection: 'row', gap: 32, paddingTop: 4 },
  empty: { fontSize: 13, opacity: 0.7, textAlign: 'center', paddingVertical: 16 },
  note: { fontSize: 12.5, opacity: 0.75, fontStyle: 'italic', textAlign: 'center' },
});