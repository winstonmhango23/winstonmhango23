import { useCallback } from 'react';

import { OriginationPipeline } from '@/components/leadership/origination-pipeline';
import { apiGetGceoQueue } from '@/lib/data/api';
import { isGceoStaffRole } from '@/lib/loan-origination/origination-workflow';
import { backendRoleMatches } from '@/lib/navigation/role-workspace-gate';
import { useAuthStore } from '@/store/auth';

export default function GceoQueueScreen() {
  const backendRole = useAuthStore((s) => s.user?.backendRole);
  const allowed = isGceoStaffRole(backendRole) || backendRoleMatches(backendRole, ['GCEO', 'ADMIN']);
  const loadPage = useCallback((token: string) => apiGetGceoQueue(token, { limit: 50 }), []);

  return (
    <OriginationPipeline
      allowed={allowed}
      gateTitle="GCEO action queue"
      gateMessage="GCEO executive shell"
      title="GCEO pipeline"
      subtitle={(total) => `${total} file${total === 1 ? '' : 's'} awaiting the GCEO decision`}
      emptyTitle="Queue clear"
      emptyMessage="No applications are waiting in the GCEO band."
      loadPage={loadPage}
      canReleaseAction
    />
  );
}