import { useCallback } from 'react';

import { RoleGatedApplicationQueue } from '@/components/staff/role-gated-application-queue';
import { apiGetOperationsManagerExecutivePipeline } from '@/lib/data/api';
import { isOperationsManagerStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function OperationsManagerExecutiveScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isOperationsManagerStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['OPERATIONS_MANAGER', 'ADMIN']);
  const loadPage = useCallback(
    (token: string) => apiGetOperationsManagerExecutivePipeline(token, { limit: 50 }),
    []
  );

  return (
    <RoleGatedApplicationQueue
      allowed={allowed}
      gateTitle="Executive pipeline"
      gateMessage="Operations Manager shell"
      title="Executive pipeline"
      subtitle={(total) => `${total} file${total === 1 ? '' : 's'} with CEO or GCEO — oversight only`}
      emptyTitle="No executive files"
      emptyMessage="Nothing is currently with the CEO or General CEO."
      actionLabel="Open loan file"
      loadPage={loadPage}
    />
  );
}
