import { useCallback } from 'react';

import { RoleGatedApplicationQueue } from '@/components/staff/role-gated-application-queue';
import { apiGetOperationsOfficerOpsQueue } from '@/lib/data/api';
import { opsQueueDetailHref } from '@/lib/ops-records';
import { isOperationsOfficerStaffRole, isOperationsManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function OperationsOpsQueueScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsOfficerStaffRole(backendRole) ||
    isOperationsManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_OFFICER', 'OPERATIONS_MANAGER', 'ADMIN']);
  const loadPage = useCallback((token: string) => apiGetOperationsOfficerOpsQueue(token, { limit: 50 }), []);

  return (
    <RoleGatedApplicationQueue
      allowed={allowed}
      gateTitle="Ops handoff"
      gateMessage="Operations Officer shell"
      title="Ops handoff queue"
      subtitle={(total) => `${total} post-disbursement file${total === 1 ? '' : 's'} awaiting operations`}
      emptyTitle="Queue clear"
      emptyMessage="No applications are waiting in DISBURSED_OPS_QUEUE."
      actionLabel="View queued loan"
      hrefForItem={(item) => opsQueueDetailHref(item.id)}
      loadPage={loadPage}
    />
  );
}
