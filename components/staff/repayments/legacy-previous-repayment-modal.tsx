import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MwkMoneyInput } from '@/components/ui/mwk-money-input';
import { CoFiColors } from '@/constants/theme';
import { ApiClientError } from '@/lib/api-client';
import { apiPreviewLegacyPreviousRepayments, apiRecordLegacyPreviousRepayments } from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import {
  parseOverpaymentConflict,
  previewLegacyPreviousRepayments,
  type LegacyPreviousRepaymentPreview,
} from '@/lib/staff/legacy-previous-repayments';
import { getStoredAuth } from '@/lib/storage';
import type { Loan } from '@/store';

type Props = {
  visible: boolean;
  loan: Loan | null;
  onClose: () => void;
  onRecorded?: () => void;
};

export function LegacyPreviousRepaymentModal({ visible, loan, onClose, onRecorded }: Props) {
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState('');
  const [notes, setNotes] = useState('');
  const [baseline, setBaseline] = useState<LegacyPreviousRepaymentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundDue, setRefundDue] = useState<number | null>(null);

  useEffect(() => {
    if (!visible || !loan?.id) return;
    let cancelled = false;
    setLoadingPreview(true);
    setError(null);
    setRefundDue(null);
    void (async () => {
      const auth = await getStoredAuth();
      if (!auth?.token) {
        if (!cancelled) setLoadingPreview(false);
        return;
      }
      try {
        const preview = await apiPreviewLegacyPreviousRepayments(auth.token, loan.id, 0);
        if (!cancelled) setBaseline(preview);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load remaining balance.');
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loan?.id, visible]);

  const preview = useMemo(() => {
    if (!baseline) return null;
    return previewLegacyPreviousRepayments({
      remaining_minor: baseline.remaining_minor,
      already_recorded_minor: baseline.already_recorded_minor,
      requested_minor: amountMinor ?? 0,
    });
  }, [amountMinor, baseline]);

  const overpayment = (preview?.overpayment_minor ?? 0) > 0;

  const resetAndClose = () => {
    setAmountMinor(null);
    setMethod('CASH');
    setReference('');
    setReceipt('');
    setNotes('');
    setBaseline(null);
    setError(null);
    setRefundDue(null);
    onClose();
  };

  const submit = async (resolution?: 'reduce' | 'refund') => {
    if (!loan?.id) return;
    setError(null);
    if (!amountMinor || amountMinor <= 0) {
      setError('Previous repayment amount must be greater than 0');
      return;
    }
    if (method === 'CASH' && !receipt.trim()) {
      setError('Physical receipt number is required for cash payments');
      return;
    }
    if (overpayment && !resolution) {
      setError('Previous repayments exceed remaining. Reduce the amount or confirm a refund.');
      return;
    }
    const auth = await getStoredAuth();
    if (!auth?.token) return;
    setLoading(true);
    try {
      const result = await apiRecordLegacyPreviousRepayments(auth.token, loan.id, {
        amount_minor: amountMinor,
        payment_method: method,
        physical_receipt_number: receipt.trim() || null,
        reference_number: reference.trim() || null,
        notes: notes.trim() || null,
        reduce_to_remaining: resolution === 'reduce',
        confirm_overpayment: resolution === 'refund',
      });
      if (result.refund_due_minor > 0) {
        setRefundDue(result.refund_due_minor);
      } else {
        onRecorded?.();
        resetAndClose();
      }
    } catch (err) {
      const conflict = parseOverpaymentConflict(
        err instanceof ApiClientError ? { status: err.status, detail: err.detail } : err
      );
      if (conflict) {
        setBaseline(conflict);
        setAmountMinor(conflict.requested_minor);
        setError(
          'Previous repayments plus remaining exceed the original total. Reduce the amount or confirm an overpayment refund.'
        );
      } else {
        setError(err instanceof Error ? err.message : 'Failed to record previous repayments');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !loan) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.body}>
            <ThemedText style={styles.title}>Record previous repayments</ThemedText>
            <ThemedText style={styles.subtitle}>
              {loan.loan_account_number}
              {loan.client_name ? ` · ${loan.client_name}` : ''}
            </ThemedText>
            <ThemedText style={styles.hint}>
              Previous repayments plus remaining must equal the original total.
            </ThemedText>

            {refundDue != null ? (
              <View style={styles.refundBox}>
                <ThemedText style={styles.refundTitle}>Overpayment recorded</ThemedText>
                <ThemedText style={styles.hint}>
                  Remaining balance was applied. Refund {formatMinorMWK(refundDue)} to the client.
                </ThemedText>
                <Pressable
                  style={styles.primary}
                  onPress={() => {
                    onRecorded?.();
                    resetAndClose();
                  }}
                >
                  <ThemedText style={styles.primaryText}>Done</ThemedText>
                </Pressable>
              </View>
            ) : (
              <>
                {loadingPreview ? (
                  <ActivityIndicator color={CoFiColors.primary} />
                ) : preview ? (
                  <View style={styles.summary}>
                    <Row label="Original total" value={formatMinorMWK(preview.original_total_minor)} />
                    <Row label="Already recorded" value={formatMinorMWK(preview.already_recorded_minor)} />
                    <Row label="Remaining" value={formatMinorMWK(preview.remaining_minor)} />
                    <Row label="Remaining after" value={formatMinorMWK(preview.remaining_after_minor)} />
                  </View>
                ) : null}

                <MwkMoneyInput
                  label="Previous repayments"
                  valueMinor={amountMinor}
                  onChangeMinor={setAmountMinor}
                />

                {overpayment ? (
                  <View style={styles.warn}>
                    <ThemedText style={styles.warnText}>
                      Amount exceeds remaining by {formatMinorMWK(preview?.overpayment_minor ?? 0)}.
                      Reduce to remaining or confirm an overpayment refund.
                    </ThemedText>
                  </View>
                ) : null}

                <ThemedText style={styles.label}>Payment method</ThemedText>
                <View style={styles.chipRow}>
                  {(['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER'] as const).map((key) => (
                    <Pressable
                      key={key}
                      style={[styles.chip, method === key && styles.chipActive]}
                      onPress={() => setMethod(key)}
                    >
                      <ThemedText style={[styles.chipText, method === key && styles.chipTextActive]}>
                        {key === 'MOBILE_MONEY' ? 'Mobile money' : key === 'BANK_TRANSFER' ? 'Bank transfer' : 'Cash'}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>

                <ThemedText style={styles.label}>Reference</ThemedText>
                <TextInput style={styles.input} value={reference} onChangeText={setReference} />
                {method === 'CASH' ? (
                  <>
                    <ThemedText style={styles.label}>Physical receipt number</ThemedText>
                    <TextInput style={styles.input} value={receipt} onChangeText={setReceipt} />
                  </>
                ) : null}
                <ThemedText style={styles.label}>Notes</ThemedText>
                <TextInput style={styles.input} value={notes} onChangeText={setNotes} />

                {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

                {loading ? <ActivityIndicator color={CoFiColors.primary} /> : null}

                <View style={styles.actions}>
                  <Pressable style={styles.secondary} onPress={resetAndClose} disabled={loading}>
                    <ThemedText style={styles.secondaryText}>Cancel</ThemedText>
                  </Pressable>
                  {overpayment ? (
                    <>
                      <Pressable
                        style={styles.secondary}
                        disabled={loading}
                        onPress={() => void submit('reduce')}
                      >
                        <ThemedText style={styles.secondaryText}>Reduce to remaining</ThemedText>
                      </Pressable>
                      <Pressable style={styles.primary} disabled={loading} onPress={() => void submit('refund')}>
                        <ThemedText style={styles.primaryText}>Confirm refund</ThemedText>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      style={styles.primary}
                      disabled={loading || loadingPreview}
                      onPress={() => void submit()}
                    >
                      <ThemedText style={styles.primaryText}>Record previous</ThemedText>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText style={styles.rowLabel}>{label}</ThemedText>
      <ThemedText style={styles.rowValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: CoFiColors.backgroundCard,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  body: { padding: 20, gap: 10 },
  title: { fontSize: 18, fontWeight: '700', color: CoFiColors.foreground },
  subtitle: { fontSize: 13, color: CoFiColors.mutedForeground },
  hint: { fontSize: 12, color: CoFiColors.mutedForeground },
  summary: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 12, color: CoFiColors.mutedForeground },
  rowValue: { fontSize: 12, fontWeight: '600', color: CoFiColors.foreground },
  label: { fontSize: 12, fontWeight: '600', color: CoFiColors.foreground, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: CoFiColors.foreground,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: CoFiColors.primary, borderColor: CoFiColors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: CoFiColors.foreground },
  chipTextActive: { color: '#fff' },
  warn: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  warnText: { fontSize: 12, color: '#7c2d12' },
  error: { fontSize: 12, color: CoFiColors.destructive },
  actions: { gap: 8, marginTop: 8 },
  primary: {
    backgroundColor: CoFiColors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { fontWeight: '600', color: CoFiColors.foreground },
  refundBox: { gap: 12, paddingVertical: 12 },
  refundTitle: { fontSize: 16, fontWeight: '700', color: CoFiColors.foreground },
});
