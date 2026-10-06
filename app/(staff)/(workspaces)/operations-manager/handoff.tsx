import { useCallback } from 'react';

import { RoleGatedApplicationQueue } from '@/components/staff/role-gated-application-queue';
import { apiGetOperationsManagerHandoffQueue } from '@/lib/data/api';
import { opsQueueDetailHref } from '@/lib/ops-records';
import { isOperationsManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function OperationsManagerHandoffScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_MANAGER', 'ADMIN']);
  const loadPage = useCallback((token: string) => apiGetOperationsManagerHandoffQueue(token, { limit: 50 }), []);

  return (
    <RoleGatedApplicationQueue
      allowed={allowed}
      gateTitle="Repayment handoff"
      gateMessage="Operations Manager shell"
      title="Repayment handoff"
      subtitle={(total) => `${total} OPS_PENDING_MANAGER file${total === 1 ? '' : 's'} — acknowledge to start tracking`}
      emptyTitle="No handoff waiting"
      emptyMessage="Nothing is waiting for operations manager acknowledgement."
      actionLabel="View queued loan"
      hrefForItem={(item) => opsQueueDetailHref(item.id, true)}
      loadPage={loadPage}
    />
  );
}
