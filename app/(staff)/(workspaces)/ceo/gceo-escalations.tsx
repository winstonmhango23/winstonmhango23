import { useCallback } from 'react';

import { RoleGatedApplicationQueue } from '@/components/staff/role-gated-application-queue';
import { apiGetCeoGceoEscalations } from '@/lib/data/api';
import { isCeoStaffRole, isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function CeoGceoEscalationsScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isCeoStaffRole(backendRole) ||
    isGceoStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['CEO', 'GCEO', 'ADMIN']);
  const loadPage = useCallback((token: string) => apiGetCeoGceoEscalations(token, { limit: 50 }), []);

  return (
    <RoleGatedApplicationQueue
      allowed={allowed}
      gateTitle="GCEO escalations"
      gateMessage="CEO executive shell"
      title="GCEO escalations"
      subtitle={(total) => `${total} file${total === 1 ? '' : 's'} already with the General CEO`}
      emptyTitle="No GCEO files"
      emptyMessage="Nothing has been escalated to the General CEO."
      actionLabel="Open loan file"
      loadPage={loadPage}
    />
  );
}
