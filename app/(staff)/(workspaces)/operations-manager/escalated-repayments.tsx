import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { RoleActionList, type RoleActionItem } from '@/components/staff/role-action-list';
import { StaffReasonModal } from '@/components/staff/staff-reason-modal';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import {
  apiGetOperationsManagerEscalatedRepayments,
  apiPostOperationsManagerApproveEscalation,
  type ApiEscalatedRepaymentRow,
} from '@/lib/data/api';
import { isOperationsManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { opsRepaymentRecordHref } from '@/lib/ops-records';
import { repaymentAmountMinor } from '@/lib/staff/repayment-flows';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

function repaymentId(row: ApiEscalatedRepaymentRow, index: number): number {
  return row.repayment_id ?? row.id ?? index;
}

export default function EscalatedRepaymentsScreen() {
  const router = useRouter();
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_MANAGER', 'ADMIN']);
  const [rows, setRows] = useState<ApiEscalatedRepaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<RoleActionItem | null>(null);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      const page = await apiGetOperationsManagerEscalatedRepayments(auth.token, {
        limit: 50,
        status: 'PENDING',
      });
      setRows(page.items ?? []);
      setTotal(page.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const items = useMemo<RoleActionItem[]>(
    () =>
      rows.map((row, i) => ({
        id: String(repaymentId(row, i)),
        title: row.client_name?.trim() || row.receipt_number || `Receipt #${repaymentId(row, i)}`,
        subtitle: (row.manager_approval_status || row.status || 'PENDING').replace(/_/g, ' '),
        meta: row.escalation_reason || row.reason || undefined,
        amountMinor: repaymentAmountMinor(row),
        applicationId: row.loan_application_id,
        loanId: row.loan_id,
      })),
    [rows]
  );

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Escalated repayments"
        message={desktopOnlyWorkspaceMessage('Operations Manager shell')}
      />
    );
  }

  return (
    <>
      <RoleActionList
        title="Escalated repayments"
        subtitle={`${total} receipt${total === 1 ? '' : 's'} waiting for manager approval`}
        emptyTitle="Nothing escalated"
        emptyMessage="Operations officers escalate problem receipts here for your decision."
        items={items}
        loading={loading}
        onRefresh={load}
        openLabel="View record"
        onOpen={(item) => router.push(opsRepaymentRecordHref(Number(item.id), 'manager'))}
        actions={[
          {
            label: 'Approve',
            kind: 'primary',
            onPress: async (item) => {
              const auth = await getStoredAuth();
              if (!auth?.token) return;
              try {
                await apiPostOperationsManagerApproveEscalation(auth.token, Number(item.id), true);
                Alert.alert('Approved', 'The receipt is approved. The accountant can now post it to the ledger.');
                await load();
              } catch (e) {
                Alert.alert('Could not approve', e instanceof Error ? e.message : 'Try again.');
              }
            },
          },
          { label: 'Reject', kind: 'danger', onPress: (item) => setRejectTarget(item) },
        ]}
      />
      <StaffReasonModal
        visible={rejectTarget != null}
        title="Reject escalated repayment"
        subtitle="The receipt will be marked failed. Reason must be at least 10 characters."
        confirmLabel="Reject"
        minLength={10}
        onClose={() => setRejectTarget(null)}
        onSubmit={async (reason) => {
          const auth = await getStoredAuth();
          if (!auth?.token || !rejectTarget) return;
          await apiPostOperationsManagerApproveEscalation(auth.token, Number(rejectTarget.id), false, reason);
          Alert.alert('Rejected', 'The receipt was returned as failed.');
          await load();
        }}
      />
    </>
  );
}
