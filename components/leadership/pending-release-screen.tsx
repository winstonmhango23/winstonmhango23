import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { RoleActionList, type RoleActionItem } from '@/components/staff/role-action-list';
import { StaffReasonModal } from '@/components/staff/staff-reason-modal';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import {
  apiGetPendingDisbursementReleases,
  apiPostApproveDisbursementRelease,
  apiPostRejectDisbursementRelease,
  type ApiDisbursementReviewRow,
} from '@/lib/data/api';
import { desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';

export function PendingReleaseScreen({
  allowed,
  title = 'Pending fund release',
}: {
  allowed: boolean;
  title?: string;
}) {
  const [rows, setRows] = useState<ApiDisbursementReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<RoleActionItem | null>(null);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      setRows(await apiGetPendingDisbursementReleases(auth.token, { limit: 50 }));
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
        id: String(row.id ?? row.disbursement_id ?? i),
        title: row.client_name?.trim() || row.disbursement_number || `Disbursement #${row.id}`,
        subtitle: (row.status || 'PENDING_RELEASE').replace(/_/g, ' '),
        meta: row.method || undefined,
        amountMinor: row.amount_minor ?? row.amount,
        applicationId: row.loan_application_id,
        loanId: row.loan_id,
      })),
    [rows]
  );

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace title={title} message={desktopOnlyWorkspaceMessage('Executive shell')} />
    );
  }

  return (
    <>
      <RoleActionList
        title={title}
        subtitle={`${items.length} dual-control disbursement${items.length === 1 ? '' : 's'} after operations review`}
        emptyTitle="Nothing pending release"
        emptyMessage="Operations assistant approvals land here for CEO or GCEO fund release."
        items={items}
        loading={loading}
        onRefresh={load}
        openLabel="Open loan file"
        actions={[
          {
            label: 'Release funds',
            kind: 'primary',
            onPress: async (item) => {
              const auth = await getStoredAuth();
              if (!auth?.token) return;
              try {
                await apiPostApproveDisbursementRelease(auth.token, Number(item.id));
                Alert.alert('Released', 'Funds are released and operations can start repayment tracking.');
                await load();
              } catch (e) {
                Alert.alert('Could not release', e instanceof Error ? e.message : 'Try again.');
              }
            },
          },
          { label: 'Withdraw', kind: 'danger', onPress: (item) => setRejectTarget(item) },
        ]}
      />
      <StaffReasonModal
        visible={rejectTarget != null}
        title="Withdraw release"
        subtitle="This funding stays blocked until it is reviewed again."
        confirmLabel="Withdraw"
        minLength={5}
        onClose={() => setRejectTarget(null)}
        onSubmit={async (reason) => {
          const auth = await getStoredAuth();
          if (!auth?.token || !rejectTarget) return;
          await apiPostRejectDisbursementRelease(auth.token, Number(rejectTarget.id), reason);
          Alert.alert('Withdrawn', 'The pending release was withdrawn.');
          await load();
        }}
      />
    </>
  );
}
