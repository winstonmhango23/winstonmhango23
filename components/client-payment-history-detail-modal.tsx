/**
 * Borrower payment history detail — portal PaymentHistoryDetailModal parity.
 * Shows breakdown, lifecycle state, and optional lifecycle timeline + draft actions.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ClientModalShell } from '@/components/client-ui';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';
import {
  deleteClientRepaymentDraft,
  getClientRepaymentLifecycle,
  updateClientRepaymentDraft,
} from '@/lib/data';
import type { ApiRepaymentLifecycleEvent } from '@/lib/data/api';
import {
  isMutableDraftRepayment,
  repaymentLifecycleLabel,
} from '@/lib/client-portal/repayment-draft';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import type { Repayment } from '@/store/test-data';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText style={styles.dt}>{label}</ThemedText>
      <ThemedText style={styles.dd}>{value}</ThemedText>
    </View>
  );
}

function formatWhen(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function ClientPaymentHistoryDetailModal({
  visible,
  payment,
  onClose,
  onChanged,
}: {
  visible: boolean;
  payment: Repayment | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [events, setEvents] = useState<ApiRepaymentLifecycleEvent[]>([]);
  const [lifecycleState, setLifecycleState] = useState<string | null>(null);
  const [loadingLifecycle, setLoadingLifecycle] = useState(false);
  const [showLifecycle, setShowLifecycle] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editReceipt, setEditReceipt] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');

  const loadLifecycle = useCallback(async (repaymentId: number) => {
    setLoadingLifecycle(true);
    try {
      const data = await getClientRepaymentLifecycle(repaymentId);
      setEvents(Array.isArray(data.events) ? data.events : []);
      setLifecycleState(data.lifecycle_state ?? null);
    } catch {
      setEvents([]);
      setLifecycleState(null);
    } finally {
      setLoadingLifecycle(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || !payment) {
      setShowLifecycle(false);
      setEditOpen(false);
      setDeleteOpen(false);
      return;
    }
    // Edit field uses major MWK for readability; API expects minor units.
    setEditAmount(payment.amount > 0 ? (payment.amount / 100).toFixed(2) : '');
    setEditReceipt(payment.deposit_receipt_number || payment.reference_number || '');
    setEditDate(payment.repayment_date?.slice(0, 10) || '');
    setEditReason('');
    setDeleteReason('');
    void loadLifecycle(payment.id);
  }, [visible, payment, loadLifecycle]);

  if (!payment) return null;

  const mutable = isMutableDraftRepayment(payment);
  const statusLabel = repaymentLifecycleLabel(payment);

  const handleUpdate = async () => {
    if (!editReason.trim()) {
      Alert.alert('Reason required', 'Please provide a reason for updating this draft.');
      return;
    }
    setMutating(true);
    try {
      const major = Number(String(editAmount).replace(/,/g, ''));
      await updateClientRepaymentDraft({
        repayment_id: payment.id,
        amount_minor:
          Number.isFinite(major) && major > 0 ? Math.round(major * 100) : undefined,
        deposit_receipt_number: editReceipt.trim() || undefined,
        payment_date: editDate.trim() || undefined,
        reason: editReason.trim(),
      });
      setEditOpen(false);
      onChanged?.();
      Alert.alert('Updated', 'Draft repayment updated successfully.');
      onClose();
    } catch (e) {
      Alert.alert('Update failed', e instanceof Error ? e.message : 'Could not update draft.');
    } finally {
      setMutating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteReason.trim()) {
      Alert.alert('Reason required', 'Please provide a reason for deleting this draft.');
      return;
    }
    setMutating(true);
    try {
      await deleteClientRepaymentDraft({
        repayment_id: payment.id,
        reason: deleteReason.trim(),
      });
      setDeleteOpen(false);
      onChanged?.();
      Alert.alert('Deleted', 'Draft repayment deleted successfully.');
      onClose();
    } catch (e) {
      Alert.alert('Delete failed', e instanceof Error ? e.message : 'Could not delete draft.');
    } finally {
      setMutating(false);
    }
  };

  return (
    <>
      <ClientModalShell
        visible={visible && !editOpen && !deleteOpen}
        title="Payment details"
        onClose={onClose}
      >
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.headerCard}>
            <View>
              <ThemedText style={styles.overline}>Payment ID</ThemedText>
              <ThemedText style={styles.paymentId}>#{payment.id}</ThemedText>
            </View>
            <View style={styles.statusPill}>
              <ThemedText style={styles.statusPillText}>{statusLabel}</ThemedText>
            </View>
          </View>

          <ThemedText style={styles.sectionTitle}>Loan</ThemedText>
          <DetailRow
            label="Loan account"
            value={payment.loan_account_number || (payment.loan_id ? `Loan #${payment.loan_id}` : '—')}
          />
          {payment.loan_id != null ? (
            <DetailRow label="Loan ID" value={`#${payment.loan_id}`} />
          ) : null}

          <ThemedText style={styles.sectionTitle}>Breakdown</ThemedText>
          <DetailRow label="Total" value={formatMinorMWK(payment.amount)} />
          <DetailRow
            label="Principal"
            value={
              payment.principal_amount > 0
                ? formatMinorMWK(payment.principal_amount)
                : 'Pending allocation'
            }
          />
          <DetailRow
            label="Interest"
            value={
              payment.interest_amount > 0
                ? formatMinorMWK(payment.interest_amount)
                : 'Pending allocation'
            }
          />
          <DetailRow label="Payment date" value={payment.repayment_date || '—'} />
          {payment.payment_method ? (
            <DetailRow label="Method" value={payment.payment_method.replace(/_/g, ' ')} />
          ) : null}
          {payment.deposit_receipt_number || payment.reference_number ? (
            <DetailRow
              label="Receipt / reference"
              value={String(payment.deposit_receipt_number || payment.reference_number)}
            />
          ) : null}

          <Pressable
            style={styles.lifecycleBtn}
            onPress={() => setShowLifecycle((v) => !v)}
          >
            <MaterialIcons name="history" size={18} color={ClientUI.colors.primary} />
            <ThemedText style={styles.lifecycleBtnText}>
              {showLifecycle ? 'Hide lifecycle' : 'View lifecycle history'}
            </ThemedText>
          </Pressable>

          {showLifecycle ? (
            <View style={styles.lifecycleBox}>
              {loadingLifecycle ? (
                <ActivityIndicator color={ClientUI.colors.primary} />
              ) : (
                <>
                  <DetailRow
                    label="Current state"
                    value={(lifecycleState || statusLabel).replace(/_/g, ' ')}
                  />
                  {events.length === 0 ? (
                    <ThemedText style={styles.muted}>No lifecycle events recorded.</ThemedText>
                  ) : (
                    events.map((event) => (
                      <View key={String(event.id)} style={styles.eventCard}>
                        <ThemedText style={styles.eventType}>
                          {String(event.event_type || 'Event').replace(/_/g, ' ')}
                        </ThemedText>
                        <ThemedText style={styles.muted}>
                          {[event.from_state, event.to_state]
                            .filter(Boolean)
                            .map((s) => String(s).replace(/_/g, ' '))
                            .join(' → ') || '—'}
                        </ThemedText>
                        {event.notes ? (
                          <ThemedText style={styles.muted}>{event.notes}</ThemedText>
                        ) : null}
                        <ThemedText style={styles.muted}>
                          {formatWhen(event.created_at)}
                          {event.triggered_by
                            ? ` · ${String(event.triggered_by).replace(/_/g, ' ')}`
                            : ''}
                        </ThemedText>
                      </View>
                    ))
                  )}
                </>
              )}
            </View>
          ) : null}

          {mutable ? (
            <View style={styles.draftActions}>
              <Pressable style={styles.editBtn} onPress={() => setEditOpen(true)}>
                <MaterialIcons name="edit" size={18} color={ClientUI.colors.primary} />
                <ThemedText style={styles.editBtnText}>Edit draft</ThemedText>
              </Pressable>
              <Pressable style={styles.deleteBtn} onPress={() => setDeleteOpen(true)}>
                <MaterialIcons name="delete-outline" size={18} color={ClientUI.colors.danger} />
                <ThemedText style={styles.deleteBtnText}>Delete draft</ThemedText>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </ClientModalShell>

      <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <ThemedText style={styles.sheetTitle}>Edit draft repayment</ThemedText>
            <ThemedText style={styles.muted}>Amount (MWK)</ThemedText>
            <TextInput
              style={styles.input}
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="decimal-pad"
              placeholder="Amount in MWK"
            />
            <TextInput
              style={styles.input}
              value={editReceipt}
              onChangeText={setEditReceipt}
              placeholder="Receipt / reference number"
            />
            <TextInput
              style={styles.input}
              value={editDate}
              onChangeText={setEditDate}
              placeholder="Payment date (YYYY-MM-DD)"
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={editReason}
              onChangeText={setEditReason}
              placeholder="Reason for update *"
              multiline
            />
            <View style={styles.sheetActions}>
              <Pressable style={styles.sheetCancel} onPress={() => setEditOpen(false)}>
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.sheetConfirm, mutating && styles.disabled]}
                onPress={() => void handleUpdate()}
                disabled={mutating}
              >
                {mutating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.sheetConfirmText}>Save</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteOpen} transparent animationType="slide" onRequestClose={() => setDeleteOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <ThemedText style={styles.sheetTitle}>Delete draft repayment</ThemedText>
            <ThemedText style={styles.muted}>
              Delete payment #{payment.id} for {formatMinorMWK(payment.amount)}?
            </ThemedText>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={deleteReason}
              onChangeText={setDeleteReason}
              placeholder="Reason for deletion *"
              multiline
            />
            <View style={styles.sheetActions}>
              <Pressable style={styles.sheetCancel} onPress={() => setDeleteOpen(false)}>
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.sheetDanger, mutating && styles.disabled]}
                onPress={() => void handleDelete()}
                disabled={mutating}
              >
                {mutating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.sheetConfirmText}>Delete</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 28, gap: 8 },
  headerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: ClientUI.colors.primarySoft,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  overline: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted },
  paymentId: { fontFamily: Fonts.sansSemiBold, fontSize: 18, color: ClientUI.colors.text },
  statusPill: {
    backgroundColor: ClientUI.colors.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    maxWidth: '50%',
  },
  statusPillText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    color: ClientUI.colors.primary,
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.text,
    marginTop: 10,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ClientUI.colors.border,
  },
  dt: { fontFamily: Fonts.sans, fontSize: 13, color: ClientUI.colors.textMuted, flex: 1 },
  dd: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    color: ClientUI.colors.text,
    flex: 1,
    textAlign: 'right',
  },
  lifecycleBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  lifecycleBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: ClientUI.colors.primary,
  },
  lifecycleBox: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: ClientUI.colors.surface,
  },
  eventCard: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  eventType: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: ClientUI.colors.text },
  muted: { fontFamily: Fonts.sans, fontSize: 12, color: ClientUI.colors.textMuted, lineHeight: 17 },
  draftActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.primary,
    backgroundColor: ClientUI.colors.primarySoft,
  },
  editBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.primary },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.35)',
    backgroundColor: 'rgba(220,38,38,0.06)',
  },
  deleteBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: ClientUI.colors.danger },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: ClientUI.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 10,
  },
  sheetTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 17, color: ClientUI.colors.text },
  input: {
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: ClientUI.colors.text,
    backgroundColor: '#fff',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sheetCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ClientUI.colors.border,
  },
  sheetConfirm: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ClientUI.colors.primary,
  },
  sheetDanger: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ClientUI.colors.danger,
  },
  sheetConfirmText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: '#fff' },
  disabled: { opacity: 0.65 },
});
