import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AmountText } from '@/components/ui/amount-text';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import { getLoanSchedule } from '@/lib/data';
import { apiPostAccountantReturnForCorrection } from '@/lib/data/api';
import { isValidAccountantReturnReason } from '@/lib/staff/accountant-schedule-return';
import {
  normalizeLoanScheduleRows,
  type LoanScheduleRow,
} from '@/lib/staff/loan-schedule';
import { getStoredAuth } from '@/lib/storage';

export function LoanScheduleModal({
  visible,
  loanId,
  title,
  subtitle,
  allowReturnForCorrection = false,
  onClose,
  onReturned,
}: {
  visible: boolean;
  loanId: number | null;
  title?: string;
  subtitle?: string;
  allowReturnForCorrection?: boolean;
  onClose: () => void;
  onReturned?: () => void;
}) {
  const [rows, setRows] = useState<LoanScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || loanId == null) {
      setRows([]);
      setError(null);
      setReason('');
      setReturnError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getLoanSchedule(loanId)
      .then((schedule) => {
        if (!cancelled) setRows(normalizeLoanScheduleRows(schedule));
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load the repayment schedule');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, loanId]);

  const handleReturn = async () => {
    if (loanId == null || !isValidAccountantReturnReason(reason)) {
      setReturnError('Enter a reason of at least 5 characters so operations can correct this loan.');
      return;
    }
    const auth = await getStoredAuth();
    if (!auth?.token) {
      setReturnError('Sign in again to return this loan.');
      return;
    }
    setReturning(true);
    setReturnError(null);
    try {
      await apiPostAccountantReturnForCorrection(auth.token, loanId, reason.trim());
      onClose();
      onReturned?.();
    } catch (e) {
      setReturnError(e instanceof Error ? e.message : 'Could not return this loan for correction');
    } finally {
      setReturning(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            {title?.trim() || 'Loan details'}
          </ThemedText>
          {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
          <ThemedText style={styles.section}>Repayment schedule</ThemedText>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={CoFiColors.primary} />
            </View>
          ) : null}
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          {!loading && !error ? (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {rows.length === 0 ? (
                <ThemedText style={styles.empty}>No repayment schedule on file for this loan.</ThemedText>
              ) : (
                rows.map((row) => (
                  <View key={row.installmentNumber} style={styles.row}>
                    <View style={styles.rowTop}>
                      <ThemedText type="defaultSemiBold">#{row.installmentNumber}</ThemedText>
                      <ThemedText style={styles.status}>{row.status}</ThemedText>
                    </View>
                    <ThemedText style={styles.due}>
                      Due {row.dueDate ? String(row.dueDate).slice(0, 10) : '—'}
                    </ThemedText>
                    <AmountText cents={row.totalMinor} style={styles.amount} />
                  </View>
                ))
              )}
              {allowReturnForCorrection ? (
                <View style={styles.returnBox}>
                  <ThemedText type="defaultSemiBold">Flag an issue</ThemedText>
                  <ThemedText style={styles.returnHint}>
                    Returning the loan keeps the schedule and sends it back for correction.
                  </ThemedText>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Reason for returning this loan"
                    placeholderTextColor="#94a3b8"
                    multiline
                    style={styles.reason}
                  />
                  {returnError ? <ThemedText style={styles.error}>{returnError}</ThemedText> : null}
                </View>
              ) : null}
            </ScrollView>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={styles.close} onPress={onClose}>
              <ThemedText style={styles.closeText}>Close</ThemedText>
            </Pressable>
            {allowReturnForCorrection ? (
              <Pressable
                style={[
                  styles.returnBtn,
                  (!isValidAccountantReturnReason(reason) || returning) && styles.returnDisabled,
                ]}
                onPress={() => void handleReturn()}
                disabled={!isValidAccountantReturnReason(reason) || returning}
              >
                <ThemedText style={styles.returnText}>
                  {returning ? 'Returning…' : 'Return for correction'}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderRadius: 16,
    padding: 18,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: CoFiColors.border,
  },
  title: { fontSize: 18 },
  subtitle: { marginTop: 4, fontSize: 13, opacity: 0.75 },
  section: { marginTop: 14, marginBottom: 8, fontSize: 13, fontWeight: '700' },
  center: { paddingVertical: 24, alignItems: 'center' },
  error: { color: '#b91c1c', fontSize: 13 },
  list: { maxHeight: 360 },
  listContent: { gap: 10, paddingBottom: 8 },
  empty: { fontSize: 13, opacity: 0.7, paddingVertical: 16 },
  row: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontSize: 12, fontWeight: '600', opacity: 0.7 },
  due: { fontSize: 12, opacity: 0.7 },
  amount: { fontSize: 16, fontWeight: '700', color: CoFiColors.primary },
  returnBox: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  returnHint: { fontSize: 12, opacity: 0.7 },
  reason: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 8,
    padding: 10,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#0f172a',
  },
  actions: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  close: {
    backgroundColor: CoFiColors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  closeText: { color: '#fff', fontWeight: '700' },
  returnBtn: {
    backgroundColor: '#b91c1c',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  returnDisabled: { opacity: 0.5 },
  returnText: { color: '#fff', fontWeight: '700' },
});
