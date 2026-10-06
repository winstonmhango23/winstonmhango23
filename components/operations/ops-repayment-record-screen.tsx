import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DesktopOnlyWorkspace, StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiGetOperationsManagerRepaymentRecord,
  apiGetOperationsOfficerRepaymentRecord,
  apiPostOperationsManagerApproveEscalation,
  apiPostOperationsManagerApproveRepayment,
  apiPostOperationsOfficerConfirmBatch,
  apiPostOperationsOfficerEscalateRepayment,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import {
  labelOpsEnum,
  type OpsRepaymentRecord,
  type OpsRepaymentRole,
} from '@/lib/ops-records';
import { getStoredAuth } from '@/lib/storage';

function formatWhen(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
}

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.detail}>
      <ThemedText style={styles.detailLabel}>{label}</ThemedText>
      <ThemedText style={styles.detailValue}>{value == null || value === '' ? '—' : String(value)}</ThemedText>
    </View>
  );
}

function roleCopy(role: OpsRepaymentRole): string {
  if (role === 'assistant') {
    return 'Read-only operations ledger. Officers reconcile and escalate; managers approve exceptions.';
  }
  if (role === 'manager') {
    return 'Review the full receipt before approving or rejecting.';
  }
  return 'Verify the receipt, escalate exceptions, or confirm manager-approved payments.';
}

export function OpsRepaymentRecordScreen({
  repaymentId,
  role,
  allowed,
  gateTitle,
}: {
  repaymentId: number;
  role: OpsRepaymentRole;
  allowed: boolean;
  gateTitle: string;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<OpsRepaymentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [escalateReason, setEscalateReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(repaymentId)) return;
    setLoading(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const next =
        role === 'manager'
          ? await apiGetOperationsManagerRepaymentRecord(auth.token, repaymentId)
          : await apiGetOperationsOfficerRepaymentRecord(auth.token, repaymentId);
      setRecord(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load repayment');
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [repaymentId, role]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace title={gateTitle} message={desktopOnlyWorkspaceMessage(gateTitle)} />
    );
  }

  const escalate = async () => {
    if (escalateReason.trim().length < 10) {
      Alert.alert('Reason required', 'Give at least 10 characters for the escalation reason.');
      return;
    }
    setBusy(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await apiPostOperationsOfficerEscalateRepayment(auth.token, repaymentId, escalateReason.trim());
      setEscalateReason('');
      Alert.alert('Escalated', 'The operations manager will review this receipt.');
      await load();
    } catch (e) {
      Alert.alert('Could not escalate', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      await apiPostOperationsOfficerConfirmBatch(auth.token, [repaymentId]);
      Alert.alert('Confirmed', 'Receipt confirmed for accountant finalization.');
      await load();
    } catch (e) {
      Alert.alert('Could not confirm', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (approved: boolean) => {
    if (!record) return;
    if (!approved && rejectReason.trim().length < 10) {
      Alert.alert('Reason required', 'Give at least 10 characters when rejecting.');
      return;
    }
    setBusy(true);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const approve = record.actions.can_approve_escalation
        ? apiPostOperationsManagerApproveEscalation
        : apiPostOperationsManagerApproveRepayment;
      await approve(auth.token, repaymentId, approved, approved ? undefined : rejectReason.trim());
      setRejectReason('');
      Alert.alert(approved ? 'Approved' : 'Rejected', approved ? 'The receipt is approved.' : 'The receipt was returned as failed.');
      await load();
    } catch (e) {
      Alert.alert('Could not decide', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <StaffDetailScreen
      title={record?.receipt_number || `Receipt #${repaymentId}`}
      subtitle={roleCopy(role)}
      scroll
      refreshing={loading}
      onRefresh={load}
    >
      {loading && !record ? (
        <ActivityIndicator color={CoFiColors.primary} style={styles.spinner} />
      ) : error ? (
        <ThemedText style={styles.error}>{error}</ThemedText>
      ) : record ? (
        <>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <ThemedText style={styles.badgeText}>{labelOpsEnum(record.internal_status)}</ThemedText>
            </View>
            <View style={styles.badgeOutline}>
              <ThemedText style={styles.badgeOutlineText}>{labelOpsEnum(record.lifecycle_state)}</ThemedText>
            </View>
          </View>

          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Client</ThemedText>
            <Detail label="Name" value={record.client.name} />
            <Detail label="Client no." value={record.client.client_number} />
            <Detail label="Phone" value={record.client.phone_number} />
          </View>

          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Loan</ThemedText>
            <Detail label="Account" value={record.loan.loan_account_number} />
            <Detail label="Product" value={record.loan.product_name} />
            <Detail label="Officer" value={record.loan.loan_officer_name} />
            <Detail label="Outstanding" value={formatMinorMWK(record.loan.outstanding_principal_minor)} />
            <Detail label="Days in arrears" value={String(record.loan.days_in_arrears)} />
            <Pressable style={styles.linkBtn} onPress={() => router.push(`/(staff)/loans/${record.loan_id}`)}>
              <ThemedText style={styles.linkText}>Open loan file</ThemedText>
            </Pressable>
          </View>

          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Receipt</ThemedText>
            <Detail label="Total" value={formatMinorMWK(record.total_amount_minor)} />
            <Detail label="Principal" value={formatMinorMWK(record.principal_amount_minor)} />
            <Detail label="Interest" value={formatMinorMWK(record.interest_amount_minor)} />
            <Detail label="Penalty" value={formatMinorMWK(record.penalty_amount_minor)} />
            <Detail label="Paid on" value={formatWhen(record.repayment_date)} />
            <Detail label="Method" value={labelOpsEnum(record.payment_method)} />
            <Detail label="Bank / mobile ref" value={record.reference_number} />
            <Detail label="Physical receipt" value={record.physical_receipt_number} />
            <Detail label="Received by" value={record.received_by_name} />
          </View>

          {record.escalation.escalated_to_manager || record.escalation.reason ? (
            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">Escalation</ThemedText>
              <Detail label="Status" value={labelOpsEnum(record.escalation.manager_approval_status)} />
              <Detail label="Reason" value={record.escalation.reason} />
              <Detail label="Escalated by" value={record.escalation.escalated_by_name} />
              <Detail label="Manager" value={record.escalation.manager_approved_by_name} />
              {record.escalation.manager_rejection_reason ? (
                <Detail label="Rejection" value={record.escalation.manager_rejection_reason} />
              ) : null}
            </View>
          ) : null}

          {record.member_contributions.length > 0 ? (
            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">Group contributions</ThemedText>
              {record.member_contributions.map((row) => (
                <Detail
                  key={row.member_client_id}
                  label={row.member_name || `Client #${row.member_client_id}`}
                  value={formatMinorMWK(row.amount_minor)}
                />
              ))}
            </View>
          ) : null}

          {record.selected_installments.length > 0 ? (
            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">Allocated installments</ThemedText>
              {record.selected_installments.map((row) => (
                <Detail
                  key={row.id}
                  label={`#${row.installment_number} · ${formatWhen(row.due_date)}`}
                  value={`${formatMinorMWK(row.paid_amount_minor)} / ${formatMinorMWK(row.total_amount_minor)}`}
                />
              ))}
            </View>
          ) : null}

          {record.lifecycle_events.length > 0 ? (
            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">Lifecycle</ThemedText>
              {record.lifecycle_events.slice(0, 8).map((event) => (
                <Detail
                  key={event.id}
                  label={`${labelOpsEnum(event.event_type)} · ${formatWhen(event.created_at)}`}
                  value={event.triggered_by_staff_name || labelOpsEnum(event.to_state)}
                />
              ))}
            </View>
          ) : null}

          {role === 'officer' && record.actions.can_escalate ? (
            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">Escalate to manager</ThemedText>
              <TextInput
                style={styles.input}
                value={escalateReason}
                onChangeText={setEscalateReason}
                placeholder="Reason (10+ characters)"
                placeholderTextColor={CoFiColors.mutedForeground}
                multiline
                editable={!busy}
              />
              <Pressable
                style={[styles.dangerBtn, (busy || escalateReason.trim().length < 10) && styles.disabled]}
                disabled={busy || escalateReason.trim().length < 10}
                onPress={() => void escalate()}
              >
                <ThemedText style={styles.btnText}>Escalate</ThemedText>
              </Pressable>
            </View>
          ) : null}

          {role === 'officer' && record.actions.can_confirm ? (
            <Pressable style={[styles.primaryBtn, busy && styles.disabled]} disabled={busy} onPress={() => void confirm()}>
              <ThemedText style={styles.btnText}>Confirm for accountant</ThemedText>
            </Pressable>
          ) : null}

          {role === 'manager' && (record.actions.can_approve_escalation || record.actions.can_approve_pending) ? (
            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">Manager decision</ThemedText>
              <TextInput
                style={styles.input}
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Rejection reason (required to reject)"
                placeholderTextColor={CoFiColors.mutedForeground}
                multiline
                editable={!busy}
              />
              <View style={styles.actionRow}>
                <Pressable style={[styles.primaryBtn, busy && styles.disabled]} disabled={busy} onPress={() => void decide(true)}>
                  <ThemedText style={styles.btnText}>Approve</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.dangerBtn, (busy || rejectReason.trim().length < 10) && styles.disabled]}
                  disabled={busy || rejectReason.trim().length < 10}
                  onPress={() => void decide(false)}
                >
                  <ThemedText style={styles.btnText}>Reject</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      ) : (
        <ThemedText style={styles.error}>Repayment not found.</ThemedText>
      )}
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  spinner: { marginVertical: 32 },
  error: { color: '#b91c1c', marginVertical: 16 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  badge: {
    backgroundColor: 'rgba(10,61,122,0.1)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: CoFiColors.primary, textTransform: 'capitalize' },
  badgeOutline: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeOutlineText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  card: {
    backgroundColor: CoFiColors.backgroundCard,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginBottom: 12,
  },
  detail: { gap: 2 },
  detailLabel: { fontSize: 12, opacity: 0.65 },
  detailValue: { fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    padding: 10,
    color: CoFiColors.foreground,
    textAlignVertical: 'top',
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryBtn: {
    backgroundColor: CoFiColors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  dangerBtn: {
    backgroundColor: '#b91c1c',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  linkBtn: { alignSelf: 'flex-start', marginTop: 4 },
  linkText: { color: CoFiColors.primary, fontWeight: '600' },
  btnText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
