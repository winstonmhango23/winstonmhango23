import { useCallback } from 'react';

import { RoleGatedApplicationQueue } from '@/components/staff/role-gated-application-queue';
import { apiGetOperationsManagerOpsQueue } from '@/lib/data/api';
import { isOperationsManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function OperationsManagerCreditQueueScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_MANAGER', 'ADMIN']);
  const loadPage = useCallback((token: string) => apiGetOperationsManagerOpsQueue(token, { limit: 50 }), []);

  return (
    <RoleGatedApplicationQueue
      allowed={allowed}
      gateTitle="Credit queue"
      gateMessage="Operations Manager shell"
      title="Credit queue"
      subtitle={(total) => `${total} CIO-verified file${total === 1 ? '' : 's'} in the PM credit band`}
      emptyTitle="Credit queue clear"
      emptyMessage="No CIO-verified files are waiting in the operations manager credit queue."
      actionLabel="Open credit file"
      loadPage={loadPage}
    />
  );
}
