import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { GroupedReviewList } from '@/components/operations/grouped-review-list';
import { StaffReasonModal } from '@/components/staff/staff-reason-modal';
import { DesktopOnlyWorkspace } from '@/components/staff-ui';
import { ThemedText } from '@/components/themed-text';
import {
  apiGetOperationsAssistantPendingReviewGrouped,
  apiGetOperationsAssistantReviewDetail,
  apiPostOperationsAssistantReviewApprove,
  apiPostOperationsAssistantReviewReturn,
  type ApiPendingReviewGroup,
  type ApiPendingReviewMember,
} from '@/lib/data/api';
import { isOperationsAssistantStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches, desktopOnlyWorkspaceMessage } from '@/lib/navigation/role-workspace-gate';
import { getStoredAuth } from '@/lib/storage';
import { useAuthStore } from '@/store/auth';

export default function OperationsAssistantReviewsScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsAssistantStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_ASSISTANT', 'ADMIN']);
  const [groups, setGroups] = useState<ApiPendingReviewGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [returnTarget, setReturnTarget] = useState<ApiPendingReviewMember | null>(null);
  const [detailNote, setDetailNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const auth = await getStoredAuth();
      if (!auth?.token) return;
      setGroups(await apiGetOperationsAssistantPendingReviewGrouped(auth.token, { limit: 50 }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const approveMember = async (member: ApiPendingReviewMember) => {
    const auth = await getStoredAuth();
    if (!auth?.token || member.id == null) return;
    await apiPostOperationsAssistantReviewApprove(auth.token, Number(member.id));
  };

  const memberNeedsUpdate = (member: ApiPendingReviewMember | null | undefined): boolean => {
    if (!member) return false;
    if (member.needs_origination_update) return true;
    return !!(member.origination_return_reason && String(member.origination_return_reason).trim().length > 0);
  };

  const groupNeedsUpdate = (group: ApiPendingReviewGroup | null | undefined): boolean => {
    if (!group) return false;
    if (group.needs_origination_update) return true;
    if (group.origination_return_reason && String(group.origination_return_reason).trim().length > 0) return true;
    return (group.members ?? []).some(memberNeedsUpdate);
  };

  const memberCount = groups.reduce((n, g) => n + (g.members?.length ?? 0), 0);

  if (!allowed) {
    return (
      <DesktopOnlyWorkspace
        title="Loan reviews"
        message={desktopOnlyWorkspaceMessage('Operations Assistant shell')}
      />
    );
  }

  return (
    <>
      <GroupedReviewList
        title="Loan reviews"
        subtitle={`${groups.length} group${groups.length === 1 ? '' : 's'} · ${memberCount} accountant booking${memberCount === 1 ? '' : 's'} awaiting review`}
        emptyTitle="Review queue clear"
        emptyMessage="Accountant-booked disbursements will appear here (grouped by loan application) before CEO release."
        groups={groups}
        loading={loading}
        onRefresh={load}
        groupActions={[
          {
            label: 'Approve all to CEO',
            kind: 'primary',
            pendingLabel: 'Pending update',
            disabled: (_member, group) => groupNeedsUpdate(group),
            onPress: async (_first, group) => {
              try {
                const members = (group.members ?? []).filter((m) => m.id != null);
                for (const member of members) await approveMember(member);
                Alert.alert('Approved', `${members.length} booking${members.length === 1 ? '' : 's'} sent to the CEO pending-release queue.`);
                await load();
              } catch (e) {
                Alert.alert('Could not approve', e instanceof Error ? e.message : 'One booking could not be approved.');
              }
            },
          },
        ]}
        actions={[
          {
            label: 'Approve to CEO',
            kind: 'primary',
            pendingLabel: 'Pending update',
            disabled: (member) => memberNeedsUpdate(member),
            onPress: async (member) => {
              try {
                await approveMember(member);
                Alert.alert('Approved', 'This funding is now in the CEO pending-release queue.');
                await load();
              } catch (e) {
                Alert.alert('Could not approve', e instanceof Error ? e.message : 'Try again.');
              }
            },
          },
          {
            label: 'Return',
            kind: 'danger',
            onPress: (member) => setReturnTarget(member),
          },
          {
            label: 'Details',
            kind: 'secondary',
            onPress: async (member) => {
              try {
                const auth = await getStoredAuth();
                if (!auth?.token || member.id == null) return;
                const detail = await apiGetOperationsAssistantReviewDetail(auth.token, Number(member.id));
                if (!detail) {
                  setDetailNote('No extra review details available for this disbursement.');
                  return;
                }
                const parts: string[] = [];
                const fees = detail.fees as Record<string, unknown> | undefined;
                if (fees) {
                  const gross = fees.gross_principal_minor;
                  const net = fees.net_cash_minor;
                  const fee = fees.processing_fee_minor;
                  if (gross != null) parts.push(`Gross ${gross}`);
                  if (fee != null) parts.push(`Processing fee ${fee}`);
                  if (net != null) parts.push(`Net cash ${net}`);
                }
                const collateral = detail.collateral ?? [];
                const guarantors = detail.guarantors ?? [];
                if (collateral.length > 0) parts.push(`${collateral.length} collateral item(s)`);
                if (guarantors.length > 0) parts.push(`${guarantors.length} guarantor(s)`);
                setDetailNote(
                  parts.length > 0
                    ? parts.join('\n')
                    : 'Booking approved for release — full ledger detail stays on the BMS.'
                );
              } catch (e) {
                setDetailNote(e instanceof Error ? e.message : 'Could not load review details.');
              }
            },
          },
        ]}
      />
      <StaffReasonModal
        visible={returnTarget != null}
        title="Return to accountant"
        subtitle="Explain what needs correction. Note must be at least 5 characters."
        confirmLabel="Return"
        minLength={5}
        onClose={() => setReturnTarget(null)}
        onSubmit={async (note) => {
          const auth = await getStoredAuth();
          if (!auth?.token || !returnTarget) return;
          await apiPostOperationsAssistantReviewReturn(auth.token, Number(returnTarget.id), note);
          Alert.alert('Returned', 'The accountant will see this booking again.');
          await load();
        }}
      />
      <StaffReasonModal
        visible={detailNote != null}
        title="Review details"
        subtitle="Booking snapshot for this disbursement"
        confirmLabel="Close"
        minLength={0}
        showInput={false}
        onClose={() => setDetailNote(null)}
        onSubmit={async () => undefined}
      >
        {detailNote ? <ThemedText style={styles.detailBody}>{detailNote}</ThemedText> : null}
      </StaffReasonModal>
    </>
  );
}

const styles = StyleSheet.create({
  detailBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#334155',
  },
});