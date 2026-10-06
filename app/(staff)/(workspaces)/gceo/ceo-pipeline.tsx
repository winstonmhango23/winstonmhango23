import { useCallback } from 'react';

import { RoleGatedApplicationQueue } from '@/components/staff/role-gated-application-queue';
import { apiGetGceoCeoPipeline } from '@/lib/data/api';
import { isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function GceoCeoPipelineScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed = isGceoStaffRole(backendRole) || backendRoleMatches(backendRole, ['GCEO', 'ADMIN']);
  const loadPage = useCallback((token: string) => apiGetGceoCeoPipeline(token, { limit: 50 }), []);

  return (
    <RoleGatedApplicationQueue
      allowed={allowed}
      gateTitle="CEO pipeline"
      gateMessage="GCEO executive shell"
      title="CEO pipeline"
      subtitle={(total) => `${total} file${total === 1 ? '' : 's'} still with the CEO`}
      emptyTitle="No CEO files"
      emptyMessage="Nothing is currently in the CEO origination band."
      actionLabel="Open loan file"
      loadPage={loadPage}
    />
  );
}
