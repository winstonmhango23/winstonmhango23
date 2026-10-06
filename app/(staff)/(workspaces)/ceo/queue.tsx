import { useCallback } from 'react';

import { OriginationPipeline } from '@/components/leadership/origination-pipeline';
import { apiGetCeoQueue } from '@/lib/data/api';
import { isCeoStaffRole, isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function CeoQueueScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed =
    isCeoStaffRole(backendRole) ||
    isGceoStaffRole(backendRole) ||
    backendRoleMatches(backendRole, ['CEO', 'GCEO', 'ADMIN']);
  const loadPage = useCallback((token: string) => apiGetCeoQueue(token, { limit: 50 }), []);

  return (
    <OriginationPipeline
      allowed={allowed}
      gateTitle="CEO action queue"
      gateMessage="CEO executive shell"
      title="CEO pipeline"
      subtitle={(total) => `${total} file${total === 1 ? '' : 's'} to approve to accountant or escalate to GCEO`}
      emptyTitle="Queue clear"
      emptyMessage="No applications are waiting in the CEO band."
      loadPage={loadPage}
      canReleaseAction
    />
  );
}