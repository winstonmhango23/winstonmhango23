import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DesktopOnlyWorkspace, StaffDetailScreen } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import { CoFiColors } from '@/constants/theme';
import {
  apiGetOperationsManagerQueueDetail,
  apiGetOperationsOfficerQueueDetail,
  apiPostOperationsOfficerProvisionCycle,
} from '@/lib/data/api';
import { formatMinorMWK } from '@/lib/money/formatMinorMWK';
import { desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { labelOpsEnum, type OpsOriginationQueueRecord } from '@/lib/ops-records';
import { getStoredAuth } from '@/lib/storage';

function formatWhen(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
}

function formatRate(bps?: number | null): string {
  if (bps == null || Number.isNaN(bps)) return '—';
  const pct = bps / 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2)}% p.a.`;
}

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.detail}>
      <ThemedText style={styles.detailLabel}>{label}</ThemedText>
      <ThemedText style={styles.detailValue}>{value == null || value === '' ? '—' : String(value)}</ThemedText>
    </View>
  );
}

export function OpsQueueDetailScreen({
  applicationId,
  allowed,
  gateTitle,
  readOnly = false,
  useManagerApi = false,
}: {
  applicationId: number;
  allowed: boolean;
  gateTitle: string;
  readOnly?: boolean;
  useManagerApi?: boolean;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<OpsOriginationQueueRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(applicationId)) return;
    setLoading(true);
    setError(null);
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const next = useManagerApi
        ? await apiGetOperationsManagerQueueDetail(auth.token, applicationId)
        : await apiGetOperationsOfficerQueueDetail(auth.token, applicationId);
      setRecord(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load queued loan');
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [applicationId, useManagerApi]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace title={gateTitle} message={desktopOnlyWorkspaceMessage(gateTitle)} />
    );
  }

  const submit = (repair: boolean) => {
    Alert.alert(
      repair ? 'Repair schedule & submit' : 'Submit to operations manager',
      repair
        ? 'Provision a missing schedule and hand this file to the operations manager?'
        : 'Hand this released loan to the operations manager for repayment tracking?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: repair ? 'Repair & submit' : 'Submit',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const auth = await getStoredAuth();
                if (!auth?.token) return;
                await apiPostOperationsOfficerProvisionCycle(auth.token, applicationId, {});
                Alert.alert(
                  'Submitted',
                  repair
                    ? 'Schedule provisioned and submitted to the operations manager.'
                    : 'Submitted to the operations manager.'
                );
                await load();
              } catch (e) {
                Alert.alert('Could not submit', e instanceof Error ? e.message : 'Try again.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  const issues = record?.readiness.issues ?? [];

  return (
    <StaffDetailScreen
      title={record?.application.application_number || `Application #${applicationId}`}
      subtitle="Review client, posted disbursements, and schedule before handoff"
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
              <ThemedText style={styles.badgeText}>{labelOpsEnum(record.stage)}</ThemedText>
            </View>
            <View style={styles.badgeOutline}>
              <ThemedText style={styles.badgeOutlineText}>
                {record.schedule.has_repayment_schedule ? 'Schedule present' : 'Schedule missing'}
              </ThemedText>
            </View>
          </View>

          {issues.length > 0 ? (
            <View style={styles.alert}>
              <ThemedText type="defaultSemiBold">Readiness issues</ThemedText>
              {issues.map((issue) => (
                <ThemedText key={issue} style={styles.issue}>
                  • {issue}
                </ThemedText>
              ))}
            </View>
          ) : null}

          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Client</ThemedText>
            <Detail label="Name" value={record.client.name} />
            <Detail label="Client no." value={record.client.client_number} />
            <Detail label="Phone" value={record.client.phone_number} />
            <Detail label="Type" value={labelOpsEnum(record.client.client_type)} />
          </View>

          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Product and terms</ThemedText>
            <Detail label="Product" value={record.product.name || record.application.product_name} />
            <Detail label="Rate" value={formatRate(record.product.interest_rate_bps)} />
            <Detail label="Term" value={record.application.approved_term_months ?? record.product.term_months} />
            <Detail label="Approved" value={formatMinorMWK(record.application.approved_amount ?? record.application.requested_amount ?? 0)} />
            <Detail label="Purpose" value={record.purpose || record.application.purpose} />
          </View>

          {record.loan ? (
            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">Loan</ThemedText>
              <Detail label="Account" value={record.loan.loan_account_number} />
              <Detail label="Status" value={labelOpsEnum(record.loan.status)} />
              <Detail label="Outstanding" value={formatMinorMWK(record.loan.outstanding_principal_minor)} />
              <Pressable style={styles.linkBtn} onPress={() => router.push(`/(staff)/loans/${record.loan!.id}`)}>
                <ThemedText style={styles.linkText}>Open loan file</ThemedText>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Posted disbursements</ThemedText>
            <Detail label="Posted total" value={formatMinorMWK(record.posted_disbursed_amount_minor)} />
            {record.disbursements.length === 0 ? (
              <ThemedText style={styles.muted}>No posted disbursement rows.</ThemedText>
            ) : (
              record.disbursements.map((row) => (
                <Detail
                  key={row.id}
                  label={`${row.disbursement_number || `#${row.id}`} · ${labelOpsEnum(row.status)}`}
                  value={`${formatMinorMWK(row.amount_minor)} · ${formatWhen(row.disbursement_date)}`}
                />
              ))
            )}
          </View>

          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Schedule</ThemedText>
            <Detail label="Installments" value={String(record.schedule.installment_count)} />
            <Detail
              label="Next due"
              value={
                record.schedule.next_due_date
                  ? `${formatWhen(record.schedule.next_due_date)}${
                      record.schedule.next_due_amount_minor != null
                        ? ` · ${formatMinorMWK(record.schedule.next_due_amount_minor)}`
                        : ''
                    }`
                  : '—'
              }
            />
            {record.schedule.installments.slice(0, 6).map((row) => (
              <Detail
                key={row.id}
                label={`#${row.installment_number} · ${formatWhen(row.due_date)}`}
                value={`${formatMinorMWK(row.paid_amount_minor)} / ${formatMinorMWK(row.total_amount_minor)}`}
              />
            ))}
          </View>

          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Readiness</ThemedText>
            <Detail label="KYC" value={labelOpsEnum(record.readiness.kyc_status)} />
            <Detail label="Collateral" value={labelOpsEnum(record.readiness.collateral_status)} />
            <Detail label="Guarantor" value={labelOpsEnum(record.readiness.guarantor_status)} />
          </View>

          {!readOnly ? (
            <View style={styles.actionRow}>
              {record.actions.can_repair_schedule ? (
                <Pressable
                  style={[styles.secondaryBtn, busy && styles.disabled]}
                  disabled={busy}
                  onPress={() => submit(true)}
                >
                  <ThemedText style={styles.secondaryText}>Repair schedule</ThemedText>
                </Pressable>
              ) : null}
              {record.actions.can_submit_to_manager ? (
                <Pressable
                  style={[styles.primaryBtn, busy && styles.disabled]}
                  disabled={busy}
                  onPress={() => submit(false)}
                >
                  <ThemedText style={styles.btnText}>Submit to manager</ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <ThemedText style={styles.error}>Queued loan not found.</ThemedText>
      )}
    </StaffDetailScreen>
  );
}

const styles = StyleSheet.create({
  spinner: { marginVertical: 32 },
  error: { color: '#b91c1c', marginVertical: 16 },
  muted: { fontSize: 13, opacity: 0.7 },
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
  badgeOutlineText: { fontSize: 12, fontWeight: '600' },
  alert: {
    borderWidth: 1,
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 12,
    gap: 4,
    marginBottom: 12,
  },
  issue: { fontSize: 13 },
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
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  primaryBtn: {
    backgroundColor: CoFiColors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: CoFiColors.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: CoFiColors.backgroundCard,
  },
  secondaryText: { fontWeight: '700' },
  btnText: { color: '#fff', fontWeight: '700' },
  linkBtn: { alignSelf: 'flex-start', marginTop: 4 },
  linkText: { color: CoFiColors.primary, fontWeight: '600' },
  disabled: { opacity: 0.45 },
});
