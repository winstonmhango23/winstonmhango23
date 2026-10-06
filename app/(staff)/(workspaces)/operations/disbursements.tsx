import { useCallback } from 'react';

import { RoleGatedApplicationQueue } from '@/components/staff/role-gated-application-queue';
import { apiGetOperationsOfficerOpsQueue } from '@/lib/data/api';
import { opsQueueDetailHref } from '@/lib/ops-records';
import { isOperationsOfficerStaffRole, isOperationsManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function OperationsDisbursementsScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsOfficerStaffRole(backendRole) ||
    isOperationsManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS', 'ADMIN']);
  const loadPage = useCallback((token: string) => apiGetOperationsOfficerOpsQueue(token, { limit: 50 }), []);

  return (
    <RoleGatedApplicationQueue
      allowed={allowed}
      gateTitle="Disbursements"
      gateMessage="Operations shell"
      title="Post-disbursement files"
      subtitle={(total) => `${total} file${total === 1 ? '' : 's'} after CEO release`}
      emptyTitle="Nothing to hand off"
      emptyMessage="Modern loans reach operations after CEO release. Open a file to submit to the operations manager."
      actionLabel="View queued loan"
      hrefForItem={(item) => opsQueueDetailHref(item.id)}
      loadPage={loadPage}
    />
  );
}
